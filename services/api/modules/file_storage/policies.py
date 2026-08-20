from __future__ import annotations

import base64
import binascii
import re
import unicodedata
from dataclasses import dataclass
from uuid import UUID

from django.conf import settings


class FilePolicyError(ValueError):
    def __init__(self, code: str, message: str, *, field: str | None = None):
        super().__init__(message)
        self.code = code
        self.field = field


@dataclass(frozen=True, slots=True)
class CategoryPolicy:
    extensions: frozenset[str]
    media_types: frozenset[str]
    max_bytes: int
    public_allowed: bool = False
    image: bool = False


def category_policies() -> dict[str, CategoryPolicy]:
    image_extensions = frozenset({"jpg", "jpeg", "png", "webp"})
    image_media = frozenset({"image/jpeg", "image/png", "image/webp"})
    document_extensions = frozenset({"pdf", "jpg", "jpeg", "png"})
    document_media = frozenset({"application/pdf", "image/jpeg", "image/png"})
    return {
        "PROFILE_PHOTO": CategoryPolicy(
            image_extensions,
            image_media,
            settings.FILE_STORAGE_MAX_PROFILE_BYTES,
            image=True,
        ),
        "LOGO": CategoryPolicy(
            image_extensions,
            image_media,
            settings.FILE_STORAGE_MAX_BRANDING_BYTES,
            public_allowed=True,
            image=True,
        ),
        "BANNER": CategoryPolicy(
            image_extensions,
            image_media,
            settings.FILE_STORAGE_MAX_BRANDING_BYTES,
            public_allowed=True,
            image=True,
        ),
        "GALLERY_IMAGE": CategoryPolicy(
            image_extensions,
            image_media,
            settings.FILE_STORAGE_MAX_BRANDING_BYTES,
            public_allowed=True,
            image=True,
        ),
        "LETTERHEAD": CategoryPolicy(
            document_extensions,
            document_media,
            settings.FILE_STORAGE_MAX_BRANDING_BYTES,
        ),
        **{
            category: CategoryPolicy(
                document_extensions,
                document_media,
                settings.FILE_STORAGE_MAX_DOCUMENT_BYTES,
            )
            for category in (
                "ID_DOCUMENT",
                "CERTIFICATE",
                "MARKSHEET",
                "ACADEMIC_NOTE",
                "OTHER_DOCUMENT",
            )
        },
    }


def normalize_file_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(value)).strip()
    if not normalized or len(normalized) > 255:
        raise FilePolicyError(
            "INVALID_FILE_NAME", "Enter a valid file name.", field="originalFileName"
        )
    has_control_character = any(unicodedata.category(c) == "Cc" for c in normalized)
    if "/" in normalized or "\\" in normalized or has_control_character:
        raise FilePolicyError(
            "INVALID_FILE_NAME",
            "File names cannot contain path separators or control characters.",
            field="originalFileName",
        )
    return normalized


def extension_for(file_name: str) -> str:
    normalized = normalize_file_name(file_name)
    extension = normalized.rpartition(".")[2].lower()
    if not re.fullmatch(r"[a-z0-9]{1,10}", extension):
        raise FilePolicyError("MEDIA_TYPE_NOT_ALLOWED", "The file extension is not allowed.")
    return extension


def validate_upload_declaration(
    *, category: str, file_name: str, media_type: str, size_bytes: int, visibility: str
) -> tuple[str, str]:
    policy = category_policies().get(str(category).upper())
    if policy is None:
        raise FilePolicyError("MEDIA_TYPE_NOT_ALLOWED", "The file category is not supported.")
    extension = extension_for(file_name)
    normalized_media = str(media_type).lower().strip()
    if extension not in policy.extensions or normalized_media not in policy.media_types:
        raise FilePolicyError(
            "MEDIA_TYPE_NOT_ALLOWED", "The file type is not allowed for this category."
        )
    if not isinstance(size_bytes, int) or size_bytes <= 0 or size_bytes > policy.max_bytes:
        raise FilePolicyError(
            "FILE_TOO_LARGE", f"The file must be between 1 and {policy.max_bytes} bytes."
        )
    normalized_visibility = str(visibility).upper()
    if normalized_visibility == "PUBLIC" and not policy.public_allowed:
        raise FilePolicyError("VISIBILITY_NOT_ALLOWED", "This file category cannot be made public.")
    if normalized_visibility not in {"PRIVATE", "AUTHENTICATED", "PUBLIC"}:
        raise FilePolicyError("VISIBILITY_NOT_ALLOWED", "The visibility is not supported.")
    return extension, normalized_media


def validate_scope(*, owner_type: str, branch_id: UUID | str | None) -> None:
    owner = str(owner_type).upper()
    if owner not in {"STUDENT", "STAFF", "INSTITUTE", "CLASS", "SUBJECT", "TERM"}:
        raise FilePolicyError("OWNER_NOT_FOUND", "The owner type is not supported.")
    if owner != "INSTITUTE" and branch_id is None:
        raise FilePolicyError("OWNER_SCOPE_DENIED", "A branch is required for this owner type.")
    if branch_id is not None:
        try:
            UUID(str(branch_id))
        except (TypeError, ValueError, AttributeError) as exc:
            raise FilePolicyError("OWNER_SCOPE_DENIED", "The branch scope is invalid.") from exc


def validate_sha256(value: str) -> str:
    normalized = str(value).lower().strip()
    if not re.fullmatch(r"[0-9a-f]{64}", normalized):
        raise FilePolicyError("UPLOAD_MISMATCH", "The SHA-256 checksum is invalid.")
    return normalized


def validate_content_md5(value: str) -> str:
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise FilePolicyError("UPLOAD_MISMATCH", "The Content-MD5 checksum is invalid.") from exc
    if len(decoded) != 16:
        raise FilePolicyError("UPLOAD_MISMATCH", "The Content-MD5 checksum is invalid.")
    return value
