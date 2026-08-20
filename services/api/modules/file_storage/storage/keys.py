from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import UUID


class InvalidObjectKey(ValueError):
    pass


_OWNER_TYPES = frozenset({"student", "staff", "institute", "class", "subject", "term"})
_CATEGORIES = frozenset(
    {
        "profile_photo",
        "logo",
        "letterhead",
        "banner",
        "gallery_image",
        "id_document",
        "certificate",
        "marksheet",
        "academic_note",
        "other_document",
    }
)
_VARIANT_TYPES = frozenset({"thumbnail", "display"})
_EXTENSION = re.compile(r"^[a-z0-9]{1,10}$")


def _uuid(value: UUID | str, field: str) -> str:
    try:
        return str(UUID(str(value)))
    except (TypeError, ValueError, AttributeError) as exc:
        raise InvalidObjectKey(f"{field} must be a UUID.") from exc


def _choice(value: str, allowed: frozenset[str], field: str) -> str:
    normalized = str(value).strip().lower()
    if normalized not in allowed:
        raise InvalidObjectKey(f"{field} is not supported.")
    return normalized


def _extension(value: str) -> str:
    normalized = str(value).strip().lower().lstrip(".")
    if not _EXTENSION.fullmatch(normalized):
        raise InvalidObjectKey("extension is not supported.")
    return normalized


@dataclass(frozen=True, slots=True)
class ObjectKeyBuilder:
    version: str = "v1"

    def _scope(self, institute_id: UUID | str, branch_id: UUID | str | None) -> str:
        institute = _uuid(institute_id, "institute_id")
        branch = "_institute" if branch_id is None else _uuid(branch_id, "branch_id")
        return f"{self.version}/institutes/{institute}/branches/{branch}"

    def staging(
        self, *, institute_id: UUID | str, branch_id: UUID | str | None, upload_id: UUID | str
    ) -> str:
        scope = self._scope(institute_id, branch_id).split("/", 1)[1]
        upload = _uuid(upload_id, "upload_id")
        return f"{self.version}/staging/{scope}/uploads/{upload}/source"

    def original(
        self,
        *,
        institute_id: UUID | str,
        branch_id: UUID | str | None,
        owner_type: str,
        owner_id: UUID | str,
        category: str,
        asset_id: UUID | str,
        extension: str,
    ) -> str:
        scope = self._scope(institute_id, branch_id)
        return (
            f"{self.version}/objects/{scope.split('/', 1)[1]}"
            f"/owners/{_choice(owner_type, _OWNER_TYPES, 'owner_type')}"
            f"/{_uuid(owner_id, 'owner_id')}/{_choice(category, _CATEGORIES, 'category')}"
            f"/{_uuid(asset_id, 'asset_id')}/original.{_extension(extension)}"
        )

    def variant(
        self,
        *,
        institute_id: UUID | str,
        branch_id: UUID | str | None,
        owner_type: str,
        owner_id: UUID | str,
        category: str,
        asset_id: UUID | str,
        variant_type: str,
        variant_id: UUID | str,
        extension: str,
    ) -> str:
        original = self.original(
            institute_id=institute_id,
            branch_id=branch_id,
            owner_type=owner_type,
            owner_id=owner_id,
            category=category,
            asset_id=asset_id,
            extension=extension,
        )
        base = original.rsplit("/original.", 1)[0]
        return (
            f"{base}/{_choice(variant_type, _VARIANT_TYPES, 'variant_type')}"
            f"/{_uuid(variant_id, 'variant_id')}.{_extension(extension)}"
        ).replace(f"{self.version}/objects/", f"{self.version}/variants/", 1)

    def public_branding(
        self,
        *,
        institute_id: UUID | str,
        branch_id: UUID | str | None,
        category: str,
        public_id: UUID | str,
        revision_id: UUID | str,
        extension: str,
    ) -> str:
        category_value = _choice(category, _CATEGORIES, "category")
        if category_value not in {"logo", "banner", "gallery_image"}:
            raise InvalidObjectKey("category cannot be published.")
        scope = self._scope(institute_id, branch_id)
        return (
            f"{self.version}/public/{scope.split('/', 1)[1]}/branding/{category_value}"
            f"/{_uuid(public_id, 'public_id')}/{_uuid(revision_id, 'revision_id')}"
            f".{_extension(extension)}"
        )


object_keys = ObjectKeyBuilder()
