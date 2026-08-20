import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel


class FileAsset(TimeStampedModel):
    class OwnerType(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        STAFF = "STAFF", "Staff"
        TEACHER = "TEACHER", "Teacher"
        INSTITUTE = "INSTITUTE", "Institute"
        CLASS = "CLASS", "Class"
        SUBJECT = "SUBJECT", "Subject"
        TERM = "TERM", "Term"

    class AssetType(models.TextChoices):
        PROFILE_PHOTO = "PROFILE_PHOTO", "Profile photo"
        LOGO = "LOGO", "Institute logo"
        LETTERHEAD = "LETTERHEAD", "Institute letterhead"
        BANNER = "BANNER", "Institute banner"
        GALLERY_IMAGE = "GALLERY_IMAGE", "Gallery image"
        ID_DOCUMENT = "ID_DOCUMENT", "Identity document"
        CERTIFICATE = "CERTIFICATE", "Certificate"
        MARKSHEET = "MARKSHEET", "Marksheet"
        ACADEMIC_NOTE = "ACADEMIC_NOTE", "Academic note"
        OTHER_DOCUMENT = "OTHER_DOCUMENT", "Other document"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACTIVE = "ACTIVE", "Active"
        QUARANTINED = "QUARANTINED", "Quarantined"
        FAILED = "FAILED", "Failed"
        DELETED = "DELETED", "Deleted"
        AWAITING_UPLOAD = "AWAITING_UPLOAD", "Awaiting upload"
        VERIFYING = "VERIFYING", "Verifying"
        EXPIRED = "EXPIRED", "Expired"
        SOFT_DELETED = "SOFT_DELETED", "Soft deleted"
        DISPOSAL_PENDING = "DISPOSAL_PENDING", "Disposal pending"
        DISPOSAL_FAILED = "DISPOSAL_FAILED", "Disposal failed"
        DISPOSED = "DISPOSED", "Disposed"

    class Visibility(models.TextChoices):
        PRIVATE = "PRIVATE", "Private"
        AUTHENTICATED = "AUTHENTICATED", "Authenticated"
        PUBLIC = "PUBLIC", "Public"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="file_assets"
    )
    branch = models.ForeignKey(
        "institutes.Branch",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="file_assets",
    )
    owner_type = models.CharField(max_length=16, choices=OwnerType.choices)
    owner_id = models.UUIDField()
    asset_type = models.CharField(max_length=32, choices=AssetType.choices)
    container_name = models.CharField(max_length=63)
    blob_name = models.CharField(max_length=1024, unique=True)
    original_file_name = models.CharField(max_length=255)
    extension = models.CharField(max_length=12)
    mime_type = models.CharField(max_length=127)
    detected_mime_type = models.CharField(max_length=127, blank=True)
    file_size = models.PositiveBigIntegerField(default=0)
    sha256_hash = models.CharField(max_length=64, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    storage_etag = models.CharField(max_length=255, blank=True)
    storage_version_id = models.CharField(max_length=255, blank=True)
    storage_provider = models.CharField(max_length=16, default="AZURE")
    checksum_algorithm = models.CharField(max_length=16, blank=True)
    checksum_value = models.CharField(max_length=128, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    visibility = models.CharField(
        max_length=16, choices=Visibility.choices, default=Visibility.PRIVATE
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="uploaded_file_assets",
    )
    retention_until = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    public_id = models.UUIDField(null=True, blank=True, unique=True)
    public_url = models.URLField(max_length=2048, blank=True)
    privacy_transition_state = models.CharField(max_length=24, default="STABLE")
    replaces_file = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="replacement_files",
    )
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("institute", "owner_type", "owner_id", "status")),
            models.Index(fields=("institute", "asset_type", "status")),
            models.Index(fields=("sha256_hash", "file_size")),
            models.Index(fields=("institute", "branch", "status", "created_at", "id")),
            models.Index(fields=("status", "updated_at")),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(version__gte=1), name="ck_file_asset_version_gte_1"),
        ]


class FileUploadSession(TimeStampedModel):
    class Status(models.TextChoices):
        CREATED = "CREATED", "Created"
        UPLOADED = "UPLOADED", "Uploaded"
        VERIFYING = "VERIFYING", "Verifying"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="file_upload_sessions"
    )
    branch = models.ForeignKey(
        "institutes.Branch",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="file_upload_sessions",
    )
    file_asset = models.OneToOneField(
        FileAsset, on_delete=models.CASCADE, related_name="upload_session"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="file_upload_sessions"
    )
    expected_size = models.PositiveBigIntegerField()
    expected_checksum = models.CharField(max_length=64, blank=True)
    expected_media_type = models.CharField(max_length=127, blank=True)
    checksum_algorithm = models.CharField(max_length=16, blank=True)
    content_md5 = models.CharField(max_length=64, blank=True)
    idempotency_key = models.CharField(max_length=128, blank=True)
    request_fingerprint = models.CharField(max_length=64, blank=True)
    staging_bucket = models.CharField(max_length=63, blank=True)
    staging_key = models.CharField(max_length=1024, blank=True)
    required_headers = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CREATED)
    expires_at = models.DateTimeField()
    staging_delete_after = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    failure_code = models.CharField(max_length=64, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("status", "expires_at")),
            models.Index(fields=("status", "staging_delete_after")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "uploaded_by", "idempotency_key"),
                condition=~Q(idempotency_key=""),
                name="uq_file_upload_idempotency",
            )
        ]


class FileVariant(TimeStampedModel):
    class VariantType(models.TextChoices):
        THUMBNAIL = "THUMBNAIL", "Thumbnail"
        DISPLAY = "DISPLAY", "Display"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        PROCESSING = "PROCESSING", "Processing"
        READY = "READY", "Ready"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file_asset = models.ForeignKey(FileAsset, on_delete=models.CASCADE, related_name="variants")
    variant_type = models.CharField(max_length=16, choices=VariantType.choices)
    container_name = models.CharField(max_length=63)
    blob_name = models.CharField(max_length=1024, unique=True)
    mime_type = models.CharField(max_length=127)
    file_size = models.PositiveBigIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    storage_provider = models.CharField(max_length=16, default="R2")
    checksum_algorithm = models.CharField(max_length=16, blank=True)
    checksum_value = models.CharField(max_length=128, blank=True)
    storage_etag = models.CharField(max_length=255, blank=True)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    last_error_code = models.CharField(max_length=64, blank=True)
    last_error_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("file_asset", "variant_type"), name="uq_file_variant_type"
            )
        ]


class FileAccessLog(TimeStampedModel):
    institute = models.ForeignKey(
        "institutes.Institute",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="file_access_logs",
    )
    branch = models.ForeignKey(
        "institutes.Branch",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="file_access_logs",
    )
    file_asset = models.ForeignKey(
        FileAsset,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="access_logs",
    )
    file_asset_snapshot_id = models.UUIDField(null=True, blank=True)
    accessed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    action = models.CharField(max_length=32)
    purpose = models.CharField(max_length=16, blank=True)
    outcome = models.CharField(max_length=16, default="SUCCEEDED")
    reason_code = models.CharField(max_length=64, blank=True)
    trace_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("institute", "created_at", "id")),
            models.Index(fields=("file_asset_snapshot_id", "created_at")),
            models.Index(fields=("institute", "action", "outcome", "created_at")),
        ]


class FileRetentionRecord(TimeStampedModel):
    class StepState(models.TextChoices):
        NOT_REQUIRED = "NOT_REQUIRED", "Not required"
        PENDING = "PENDING", "Pending"
        SUCCEEDED = "SUCCEEDED", "Succeeded"
        FAILED = "FAILED", "Failed"

    file_asset = models.OneToOneField(
        FileAsset, on_delete=models.CASCADE, related_name="retention_record"
    )
    deleted_at = models.DateTimeField()
    retention_until = models.DateTimeField()
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deleted_file_retention_records",
    )
    delete_reason = models.CharField(max_length=32)
    restored_at = models.DateTimeField(null=True, blank=True)
    restored_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="restored_file_retention_records",
    )
    disposal_started_at = models.DateTimeField(null=True, blank=True)
    disposed_at = models.DateTimeField(null=True, blank=True)
    public_purge_state = models.CharField(
        max_length=16, choices=StepState.choices, default=StepState.NOT_REQUIRED
    )
    private_delete_state = models.CharField(
        max_length=16, choices=StepState.choices, default=StepState.PENDING
    )
    public_delete_state = models.CharField(
        max_length=16, choices=StepState.choices, default=StepState.NOT_REQUIRED
    )
    metadata_state = models.CharField(
        max_length=16, choices=StepState.choices, default=StepState.PENDING
    )
    attempt_count = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    last_error_code = models.CharField(max_length=64, blank=True)


class StorageReconciliationIssue(TimeStampedModel):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RETRYING = "RETRYING", "Retrying"
        RESOLVED = "RESOLVED", "Resolved"
        IGNORED = "IGNORED", "Ignored"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="file_storage_issues",
    )
    file_asset = models.ForeignKey(
        FileAsset,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reconciliation_issues",
    )
    issue_type = models.CharField(max_length=32)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    first_seen_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()
    attempt_count = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    safe_details = models.JSONField(default=dict, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolution_code = models.CharField(max_length=64, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=("status", "issue_type", "last_seen_at")),
            models.Index(fields=("institute", "status", "last_seen_at")),
        ]
