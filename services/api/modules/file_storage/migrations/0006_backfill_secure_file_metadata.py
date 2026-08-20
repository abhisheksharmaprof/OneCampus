from django.db import migrations
from django.utils import timezone


def backfill_secure_metadata(apps, schema_editor):
    FileAsset = apps.get_model("file_storage", "FileAsset")
    FileAccessLog = apps.get_model("file_storage", "FileAccessLog")
    FileUploadSession = apps.get_model("file_storage", "FileUploadSession")
    FileVariant = apps.get_model("file_storage", "FileVariant")
    StorageReconciliationIssue = apps.get_model(
        "file_storage", "StorageReconciliationIssue"
    )
    Student = apps.get_model("people", "Student")

    now = timezone.now()
    student_branches = dict(
        Student.objects.values_list("id", "branch_id").iterator(chunk_size=1000)
    )
    issues = []
    for asset in FileAsset.objects.all().iterator(chunk_size=500):
        changed = []
        if asset.storage_provider != "AZURE":
            asset.storage_provider = "AZURE"
            changed.append("storage_provider")
        if asset.visibility == "AUTHENTICATED":
            asset.visibility = "PRIVATE"
            changed.append("visibility")
        if asset.sha256_hash and not asset.checksum_value:
            asset.checksum_algorithm = "SHA256"
            asset.checksum_value = asset.sha256_hash
            changed.extend(("checksum_algorithm", "checksum_value"))
        if asset.owner_type == "STUDENT" and not asset.branch_id:
            asset.branch_id = student_branches.get(asset.owner_id)
            if asset.branch_id:
                changed.append("branch_id")
        if changed:
            asset.save(update_fields=sorted(set(changed)))
        if asset.owner_type not in {"INSTITUTE"} and not asset.branch_id:
            issues.append(
                StorageReconciliationIssue(
                    institute_id=asset.institute_id,
                    file_asset_id=asset.id,
                    issue_type="LEGACY_METADATA_REVIEW",
                    first_seen_at=now,
                    last_seen_at=now,
                    safe_details={"reason": "branch_scope_unresolved"},
                )
            )
    StorageReconciliationIssue.objects.bulk_create(issues, batch_size=500)

    for session in FileUploadSession.objects.select_related("file_asset").iterator(
        chunk_size=500
    ):
        asset = session.file_asset
        session.branch_id = asset.branch_id
        session.expected_media_type = asset.mime_type
        session.checksum_algorithm = "SHA256" if session.expected_checksum else ""
        session.save(
            update_fields=("branch_id", "expected_media_type", "checksum_algorithm")
        )

    for event in FileAccessLog.objects.select_related("file_asset").iterator(chunk_size=500):
        if event.file_asset_id:
            event.institute_id = event.file_asset.institute_id
            event.branch_id = event.file_asset.branch_id
            event.file_asset_snapshot_id = event.file_asset_id
            event.save(
                update_fields=("institute_id", "branch_id", "file_asset_snapshot_id")
            )

    FileVariant.objects.update(storage_provider="AZURE", status="READY")


class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ("file_storage", "0005_secure_file_storage_foundation"),
        ("people", "0016_assign_admin_employee_codes"),
    ]

    operations = [
        migrations.RunPython(backfill_secure_metadata, migrations.RunPython.noop),
    ]
