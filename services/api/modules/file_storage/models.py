import uuid

from django.conf import settings
from django.db import models

from platform_core.models import TimeStampedModel


class FileAsset(TimeStampedModel):
    class OwnerType(models.TextChoices):
        STUDENT = "STUDENT", "Student"
        STAFF = "STAFF", "Staff"
        TEACHER = "TEACHER", "Teacher"
        INSTITUTE = "INSTITUTE", "Institute"

    class AssetType(models.TextChoices):
        PROFILE_PHOTO = "PROFILE_PHOTO", "Profile photo"
        LOGO = "LOGO", "Institute logo"
        LETTERHEAD = "LETTERHEAD", "Institute letterhead"
        BANNER = "BANNER", "Institute banner"
        GALLERY_IMAGE = "GALLERY_IMAGE", "Gallery image"
        ID_DOCUMENT = "ID_DOCUMENT", "Identity document"
        CERTIFICATE = "CERTIFICATE", "Certificate"
        OTHER_DOCUMENT = "OTHER_DOCUMENT", "Other document"

    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        ACTIVE = "ACTIVE", "Active"
        QUARANTINED = "QUARANTINED", "Quarantined"
        FAILED = "FAILED", "Failed"
        DELETED = "DELETED", "Deleted"

    class Visibility(models.TextChoices):
        PRIVATE = "PRIVATE", "Private"
        AUTHENTICATED = "AUTHENTICATED", "Authenticated"
        PUBLIC = "PUBLIC", "Public"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="file_assets"
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

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("institute", "owner_type", "owner_id", "status")),
            models.Index(fields=("institute", "asset_type", "status")),
            models.Index(fields=("sha256_hash", "file_size")),
        ]


class FileUploadSession(TimeStampedModel):
    class Status(models.TextChoices):
        CREATED = "CREATED", "Created"
        UPLOADED = "UPLOADED", "Uploaded"
        COMPLETED = "COMPLETED", "Completed"
        FAILED = "FAILED", "Failed"
        EXPIRED = "EXPIRED", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="file_upload_sessions"
    )
    file_asset = models.OneToOneField(
        FileAsset, on_delete=models.CASCADE, related_name="upload_session"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="file_upload_sessions"
    )
    expected_size = models.PositiveBigIntegerField()
    expected_checksum = models.CharField(max_length=64, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CREATED)
    expires_at = models.DateTimeField()


class FileVariant(TimeStampedModel):
    class VariantType(models.TextChoices):
        THUMBNAIL = "THUMBNAIL", "Thumbnail"
        DISPLAY = "DISPLAY", "Display"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file_asset = models.ForeignKey(FileAsset, on_delete=models.CASCADE, related_name="variants")
    variant_type = models.CharField(max_length=16, choices=VariantType.choices)
    container_name = models.CharField(max_length=63)
    blob_name = models.CharField(max_length=1024, unique=True)
    mime_type = models.CharField(max_length=127)
    file_size = models.PositiveBigIntegerField(default=0)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("file_asset", "variant_type"), name="uq_file_variant_type"
            )
        ]


class FileAccessLog(TimeStampedModel):
    file_asset = models.ForeignKey(FileAsset, on_delete=models.CASCADE, related_name="access_logs")
    accessed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL
    )
    action = models.CharField(max_length=32)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
