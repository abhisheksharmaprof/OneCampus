from celery import shared_task
from django.utils import timezone

from modules.file_storage.models import FileAsset, FileUploadSession, StorageReconciliationIssue
from modules.file_storage.storage import ObjectKeyBuilder, get_storage_provider
from modules.file_storage.storage.base import StorageError


@shared_task
def expire_file_upload_sessions(batch_size: int = 500) -> int:
    now = timezone.now()
    session_ids = list(
        FileUploadSession.objects.filter(
            status__in=(
                FileUploadSession.Status.CREATED,
                FileUploadSession.Status.UPLOADED,
                FileUploadSession.Status.VERIFYING,
            ),
            expires_at__lte=now,
        )
        .order_by("expires_at")
        .values_list("id", flat=True)[:batch_size]
    )
    FileUploadSession.objects.filter(id__in=session_ids).update(
        status=FileUploadSession.Status.EXPIRED,
        failure_code="UPLOAD_EXPIRED",
        updated_at=now,
    )
    FileAsset.objects.filter(
        upload_session__id__in=session_ids,
        status__in=(FileAsset.Status.AWAITING_UPLOAD, FileAsset.Status.VERIFYING),
    ).update(status=FileAsset.Status.EXPIRED, updated_at=now)
    return len(session_ids)


@shared_task
def cleanup_expired_staging_objects(batch_size: int = 200) -> dict[str, int]:
    now = timezone.now()
    provider = get_storage_provider()
    sessions = list(
        FileUploadSession.objects.filter(
            status__in=(FileUploadSession.Status.EXPIRED, FileUploadSession.Status.FAILED),
            staging_delete_after__lte=now,
        )
        .exclude(staging_key="")
        .order_by("staging_delete_after")[:batch_size]
    )
    deleted = failed = 0
    keys = ObjectKeyBuilder()
    for session in sessions:
        expected_key = keys.staging(
            institute_id=session.institute_id,
            branch_id=session.branch_id,
            upload_id=session.id,
        )
        if session.staging_key != expected_key:
            StorageReconciliationIssue.objects.get_or_create(
                institute_id=session.institute_id,
                file_asset_id=session.file_asset_id,
                issue_type="FAILED_STAGING_CLEANUP",
                status=StorageReconciliationIssue.Status.OPEN,
                defaults={
                    "first_seen_at": now,
                    "last_seen_at": now,
                    "safe_details": {"reason": "unexpected_staging_key"},
                },
            )
            failed += 1
            continue
        try:
            provider.delete(bucket=session.staging_bucket, key=session.staging_key)
        except StorageError:
            StorageReconciliationIssue.objects.update_or_create(
                institute_id=session.institute_id,
                file_asset_id=session.file_asset_id,
                issue_type="FAILED_STAGING_CLEANUP",
                status=StorageReconciliationIssue.Status.OPEN,
                defaults={
                    "first_seen_at": now,
                    "last_seen_at": now,
                    "safe_details": {"reason": "provider_delete_failed"},
                },
            )
            failed += 1
            continue
        session.staging_key = ""
        session.save(update_fields=("staging_key", "updated_at"))
        deleted += 1
    return {"deleted": deleted, "failed": failed}
