from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ("institutes", "0010_avoid_main_branch_code"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name="FileAsset",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("owner_type", models.CharField(choices=[("STUDENT", "Student"), ("STAFF", "Staff"), ("TEACHER", "Teacher"), ("INSTITUTE", "Institute")], max_length=16)),
                ("owner_id", models.UUIDField()),
                ("asset_type", models.CharField(choices=[("PROFILE_PHOTO", "Profile photo"), ("LOGO", "Institute logo"), ("BANNER", "Institute banner"), ("GALLERY_IMAGE", "Gallery image"), ("ID_DOCUMENT", "Identity document"), ("CERTIFICATE", "Certificate"), ("OTHER_DOCUMENT", "Other document")], max_length=32)),
                ("container_name", models.CharField(max_length=63)),
                ("blob_name", models.CharField(max_length=1024, unique=True)),
                ("original_file_name", models.CharField(max_length=255)),
                ("extension", models.CharField(max_length=12)),
                ("mime_type", models.CharField(max_length=127)),
                ("detected_mime_type", models.CharField(blank=True, max_length=127)),
                ("file_size", models.PositiveBigIntegerField(default=0)),
                ("sha256_hash", models.CharField(blank=True, max_length=64)),
                ("width", models.PositiveIntegerField(blank=True, null=True)),
                ("height", models.PositiveIntegerField(blank=True, null=True)),
                ("storage_etag", models.CharField(blank=True, max_length=255)),
                ("storage_version_id", models.CharField(blank=True, max_length=255)),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("ACTIVE", "Active"), ("QUARANTINED", "Quarantined"), ("FAILED", "Failed"), ("DELETED", "Deleted")], default="PENDING", max_length=16)),
                ("visibility", models.CharField(choices=[("PRIVATE", "Private"), ("AUTHENTICATED", "Authenticated"), ("PUBLIC", "Public")], default="PRIVATE", max_length=16)),
                ("retention_until", models.DateTimeField(blank=True, null=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("institute", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="file_assets", to="institutes.institute")),
                ("uploaded_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="uploaded_file_assets", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-created_at",), "indexes": [models.Index(fields=("institute", "owner_type", "owner_id", "status"), name="file_storag_institu_528131_idx"), models.Index(fields=("institute", "asset_type", "status"), name="file_storag_institu_5943d3_idx"), models.Index(fields=("sha256_hash", "file_size"), name="file_storag_sha256__308b86_idx")]},
        ),
        migrations.CreateModel(
            name="FileUploadSession",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("expected_size", models.PositiveBigIntegerField()), ("expected_checksum", models.CharField(blank=True, max_length=64)),
                ("status", models.CharField(choices=[("CREATED", "Created"), ("UPLOADED", "Uploaded"), ("COMPLETED", "Completed"), ("FAILED", "Failed"), ("EXPIRED", "Expired")], default="CREATED", max_length=16)), ("expires_at", models.DateTimeField()),
                ("file_asset", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="upload_session", to="file_storage.fileasset")),
                ("institute", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="file_upload_sessions", to="institutes.institute")),
                ("uploaded_by", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="file_upload_sessions", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="FileVariant",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)), ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("variant_type", models.CharField(choices=[("THUMBNAIL", "Thumbnail"), ("DISPLAY", "Display")], max_length=16)), ("container_name", models.CharField(max_length=63)), ("blob_name", models.CharField(max_length=1024, unique=True)), ("mime_type", models.CharField(max_length=127)), ("file_size", models.PositiveBigIntegerField(default=0)), ("width", models.PositiveIntegerField(blank=True, null=True)), ("height", models.PositiveIntegerField(blank=True, null=True)),
                ("file_asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="variants", to="file_storage.fileasset")),
            ], options={"constraints": [models.UniqueConstraint(fields=("file_asset", "variant_type"), name="uq_file_variant_type")]},
        ),
        migrations.CreateModel(
            name="FileAccessLog",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)), ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")), ("action", models.CharField(max_length=32)), ("ip_address", models.GenericIPAddressField(blank=True, null=True)), ("user_agent", models.TextField(blank=True)),
                ("accessed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)), ("file_asset", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="access_logs", to="file_storage.fileasset")),
            ],
        ),
    ]
