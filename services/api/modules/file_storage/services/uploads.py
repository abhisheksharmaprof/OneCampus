from __future__ import annotations

import base64
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID, uuid4

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from modules.file_storage.models import (
    FileAccessLog,
    FileAsset,
    FileRetentionRecord,
    FileUploadSession,
)
from modules.file_storage.policies import (
    normalize_file_name,
    validate_content_md5,
    validate_scope,
    validate_sha256,
    validate_upload_declaration,
)
from modules.file_storage.storage import ObjectKeyBuilder, get_storage_provider
from modules.file_storage.storage.base import StorageNotFoundError
from modules.people.contracts import FileOwnerScope


class UploadServiceError(Exception):
    def __init__(self, code: str, message: str, *, status_code: int = 409):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class InitiatedUpload:
    session: FileUploadSession
    grant: object
    replayed: bool


def _fingerprint(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _validate_idempotency_key(value: str) -> str:
    key = str(value).strip()
    if not re.fullmatch(r"[\x21-\x7e]{1,128}", key):
        raise UploadServiceError(
            "INVALID_IDEMPOTENCY_KEY",
            "Idempotency-Key must contain 1 to 128 safe characters.",
            status_code=400,
        )
    return key


def _resolve_branch_id(*, owner: FileOwnerScope, requested_branch_id: UUID | None) -> UUID | None:
    from modules.institutes.models import Branch

    branch_id = requested_branch_id or owner.branch_id
    validate_scope(owner_type=owner.owner_type, branch_id=branch_id)
    if (
        branch_id is not None
        and not Branch.objects.filter(
            id=branch_id, institute_id=owner.institute_id, is_active=True
        ).exists()
    ):
        raise UploadServiceError(
            "OWNER_SCOPE_DENIED", "The branch is not in this institute.", status_code=404
        )
    if owner.branch_id is not None and owner.branch_id != branch_id:
        raise UploadServiceError(
            "OWNER_SCOPE_DENIED", "The owner is not in this branch.", status_code=404
        )
    return branch_id


def initiate_upload(
    *,
    actor,
    institute,
    owner: FileOwnerScope,
    idempotency_key: str,
    payload: dict,
    provider=None,
    now=None,
) -> InitiatedUpload:
    now = now or timezone.now()
    provider = provider or get_storage_provider()
    key = _validate_idempotency_key(idempotency_key)
    normalized_name = normalize_file_name(payload["originalFileName"])
    category = str(payload["category"]).upper()
    visibility = str(payload.get("visibility", "PRIVATE")).upper()
    extension, media_type = validate_upload_declaration(
        category=category,
        file_name=normalized_name,
        media_type=payload["mediaType"],
        size_bytes=payload["sizeBytes"],
        visibility=visibility,
    )
    sha256 = validate_sha256(payload["sha256"])
    content_md5 = validate_content_md5(payload["contentMd5"])
    requested_branch = payload.get("branchId")
    branch_id = _resolve_branch_id(
        owner=owner,
        requested_branch_id=UUID(str(requested_branch)) if requested_branch else None,
    )
    fingerprint_payload = {
        **payload,
        "owner": {"type": owner.owner_type, "id": str(owner.owner_id)},
        "branchId": str(branch_id) if branch_id else None,
        "originalFileName": normalized_name,
        "mediaType": media_type,
        "visibility": visibility,
    }
    request_fingerprint = _fingerprint(fingerprint_payload)

    with transaction.atomic():
        existing = (
            FileUploadSession.objects.select_for_update()
            .select_related("file_asset")
            .filter(institute=institute, uploaded_by=actor, idempotency_key=key)
            .first()
        )
        if existing:
            if existing.request_fingerprint != request_fingerprint:
                raise UploadServiceError(
                    "IDEMPOTENCY_CONFLICT",
                    "This idempotency key was already used with different upload details.",
                )
            if existing.expires_at <= now and existing.status != FileUploadSession.Status.COMPLETED:
                raise UploadServiceError(
                    "UPLOAD_EXPIRED", "The upload authorization has expired.", status_code=410
                )
            remaining = max(1, int((existing.expires_at - now).total_seconds()))
            grant = provider.create_upload_grant(
                bucket=existing.staging_bucket,
                key=existing.staging_key,
                media_type=existing.expected_media_type,
                content_md5=existing.content_md5,
                expires_in=remaining,
            )
            return InitiatedUpload(existing, grant, True)

        upload_id = uuid4()
        asset_id = uuid4()
        key_builder = ObjectKeyBuilder()
        staging_key = key_builder.staging(
            institute_id=institute.id, branch_id=branch_id, upload_id=upload_id
        )
        final_key = key_builder.original(
            institute_id=institute.id,
            branch_id=branch_id,
            owner_type=owner.owner_type,
            owner_id=owner.owner_id,
            category=category,
            asset_id=asset_id,
            extension=extension,
        )
        expires_at = now + timedelta(seconds=settings.R2_UPLOAD_TTL_SECONDS)
        headers = {
            "Content-Type": media_type,
            "Content-MD5": content_md5,
            "If-None-Match": "*",
        }
        asset = FileAsset.objects.create(
            id=asset_id,
            institute=institute,
            branch_id=branch_id,
            owner_type=owner.owner_type,
            owner_id=owner.owner_id,
            asset_type=category,
            container_name=settings.R2_PRIVATE_BUCKET,
            blob_name=final_key,
            original_file_name=normalized_name,
            extension=extension,
            mime_type=media_type,
            file_size=payload["sizeBytes"],
            sha256_hash=sha256,
            checksum_algorithm="MD5",
            checksum_value=content_md5,
            storage_provider="R2",
            status=FileAsset.Status.AWAITING_UPLOAD,
            visibility=visibility,
            uploaded_by=actor,
            replaces_file_id=payload.get("replacesFileId") or None,
        )
        session = FileUploadSession.objects.create(
            id=upload_id,
            institute=institute,
            branch_id=branch_id,
            file_asset=asset,
            uploaded_by=actor,
            expected_size=payload["sizeBytes"],
            expected_checksum=sha256,
            expected_media_type=media_type,
            checksum_algorithm="MD5",
            content_md5=content_md5,
            idempotency_key=key,
            request_fingerprint=request_fingerprint,
            staging_bucket=settings.R2_PRIVATE_BUCKET,
            staging_key=staging_key,
            required_headers=headers,
            status=FileUploadSession.Status.CREATED,
            expires_at=expires_at,
            staging_delete_after=expires_at
            + timedelta(seconds=settings.R2_STAGING_DELETE_BUFFER_SECONDS),
        )
        grant = provider.create_upload_grant(
            bucket=session.staging_bucket,
            key=session.staging_key,
            media_type=media_type,
            content_md5=content_md5,
            expires_in=settings.R2_UPLOAD_TTL_SECONDS,
        )
        FileAccessLog.objects.create(
            institute=institute,
            branch_id=branch_id,
            file_asset=asset,
            file_asset_snapshot_id=asset.id,
            accessed_by=actor,
            action="UPLOAD_INITIATED",
            outcome="SUCCEEDED",
        )
        return InitiatedUpload(session, grant, False)


def _verify_signature(media_type: str, content: bytes) -> None:
    valid = {
        "application/pdf": content.startswith(b"%PDF-"),
        "image/jpeg": content.startswith(b"\xff\xd8\xff"),
        "image/png": content.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": content.startswith(b"RIFF") and content[8:12] == b"WEBP",
    }.get(media_type, False)
    if not valid:
        raise UploadServiceError(
            "CONTENT_TYPE_MISMATCH", "The uploaded content does not match its media type."
        )


def complete_upload(*, upload_id: UUID, actor, institute, provider=None, now=None) -> FileAsset:
    now = now or timezone.now()
    provider = provider or get_storage_provider()
    with transaction.atomic():
        session = (
            FileUploadSession.objects.select_for_update()
            .select_related("file_asset")
            .filter(id=upload_id, institute=institute, uploaded_by=actor)
            .first()
        )
        if session is None:
            raise UploadServiceError(
                "UPLOAD_NOT_FOUND", "The upload was not found.", status_code=404
            )
        asset = session.file_asset
        if session.status == FileUploadSession.Status.COMPLETED:
            return asset
        if session.expires_at <= now:
            session.status = FileUploadSession.Status.EXPIRED
            session.failure_code = "UPLOAD_EXPIRED"
            session.save(update_fields=("status", "failure_code", "updated_at"))
            raise UploadServiceError(
                "UPLOAD_EXPIRED", "The upload authorization has expired.", status_code=410
            )
        session.status = FileUploadSession.Status.VERIFYING
        asset.status = FileAsset.Status.VERIFYING
        session.save(update_fields=("status", "updated_at"))
        asset.save(update_fields=("status", "updated_at"))
        try:
            metadata = provider.head(bucket=session.staging_bucket, key=session.staging_key)
        except StorageNotFoundError as exc:
            raise UploadServiceError(
                "UPLOAD_NOT_READY", "The upload has not reached storage yet."
            ) from exc
        if (
            metadata.size_bytes != session.expected_size
            or metadata.media_type != session.expected_media_type
        ):
            raise UploadServiceError(
                "UPLOAD_MISMATCH", "The uploaded object metadata does not match."
            )
        expected_md5_hex = base64.b64decode(session.content_md5).hex()
        if metadata.etag and "-" not in metadata.etag and metadata.etag.lower() != expected_md5_hex:
            raise UploadServiceError(
                "UPLOAD_MISMATCH", "The uploaded object checksum does not match."
            )
        _verify_signature(
            session.expected_media_type,
            provider.read_range(
                bucket=session.staging_bucket, key=session.staging_key, byte_count=64
            ),
        )
        from modules.file_storage.validators import verify_stored_content

        verify_stored_content(
            provider=provider,
            bucket=session.staging_bucket,
            key=session.staging_key,
            media_type=session.expected_media_type,
        )
        stored = provider.copy_if_absent(
            source_bucket=session.staging_bucket,
            source_key=session.staging_key,
            target_bucket=asset.container_name,
            target_key=asset.blob_name,
        )
        if stored.metadata.size_bytes != session.expected_size:
            raise UploadServiceError("UPLOAD_MISMATCH", "The final object could not be verified.")

        singleton_types = {
            FileAsset.AssetType.PROFILE_PHOTO,
            FileAsset.AssetType.LOGO,
            FileAsset.AssetType.LETTERHEAD,
        }
        if asset.asset_type in singleton_types:
            previous_assets = FileAsset.objects.select_for_update().filter(
                institute=institute,
                branch_id=asset.branch_id,
                owner_type=asset.owner_type,
                owner_id=asset.owner_id,
                asset_type=asset.asset_type,
                status=FileAsset.Status.ACTIVE,
            )
            for previous in previous_assets:
                previous.status = FileAsset.Status.SOFT_DELETED
                previous.deleted_at = now
                previous.retention_until = now + timedelta(
                    days=settings.FILE_STORAGE_RETENTION_DAYS
                )
                previous.version += 1
                previous.save(
                    update_fields=(
                        "status",
                        "deleted_at",
                        "retention_until",
                        "version",
                        "updated_at",
                    )
                )
                FileRetentionRecord.objects.update_or_create(
                    file_asset=previous,
                    defaults={
                        "deleted_at": now,
                        "retention_until": previous.retention_until,
                        "deleted_by": None,
                        "delete_reason": "REPLACED",
                    },
                )
        asset.status = FileAsset.Status.ACTIVE
        asset.detected_mime_type = session.expected_media_type
        asset.storage_etag = stored.metadata.etag
        asset.storage_version_id = stored.metadata.version_id
        asset.version += 1
        asset.save(
            update_fields=(
                "status",
                "detected_mime_type",
                "storage_etag",
                "storage_version_id",
                "version",
                "updated_at",
            )
        )
        session.status = FileUploadSession.Status.COMPLETED
        session.completed_at = now
        session.save(update_fields=("status", "completed_at", "updated_at"))
        FileAccessLog.objects.create(
            institute=institute,
            branch_id=asset.branch_id,
            file_asset=asset,
            file_asset_snapshot_id=asset.id,
            accessed_by=actor,
            action="UPLOAD_COMPLETED",
            outcome="SUCCEEDED",
        )
        return asset
