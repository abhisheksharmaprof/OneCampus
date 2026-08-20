from datetime import timedelta

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from modules.file_storage.models import FileAccessLog, FileAsset, FileUploadSession
from modules.identity.models import User
from modules.institutes.models import Institute


@pytest.mark.django_db
def test_file_access_audit_survives_asset_disposal():
    institute = Institute.objects.create(name="Audit School", code="AUDIT-FILES")
    asset = FileAsset.objects.create(
        institute=institute,
        owner_type="INSTITUTE",
        owner_id=institute.id,
        asset_type="LOGO",
        container_name="private",
        blob_name=f"v1/objects/{institute.id}",
        original_file_name="logo.png",
        extension="png",
        mime_type="image/png",
    )
    event = FileAccessLog.objects.create(
        institute=institute,
        file_asset=asset,
        file_asset_snapshot_id=asset.id,
        action="ACCESS_GRANT",
        outcome="ALLOWED",
    )
    asset.delete()
    event.refresh_from_db()
    assert event.file_asset_id is None
    assert event.file_asset_snapshot_id is not None
    assert event.institute_id == institute.id


@pytest.mark.django_db
def test_upload_idempotency_key_is_unique_per_institute_and_actor():
    institute = Institute.objects.create(name="Idempotency School", code="IDEMP-FILES")
    actor = User.objects.create_user(email="uploader@example.com")

    def create_session(suffix):
        asset = FileAsset.objects.create(
            institute=institute,
            owner_type="INSTITUTE",
            owner_id=institute.id,
            asset_type="LOGO",
            container_name="private",
            blob_name=f"v1/object/{suffix}",
            original_file_name="logo.png",
            extension="png",
            mime_type="image/png",
        )
        return FileUploadSession.objects.create(
            institute=institute,
            file_asset=asset,
            uploaded_by=actor,
            idempotency_key="same-request",
            expected_size=10,
            expires_at=timezone.now() + timedelta(minutes=15),
        )

    create_session("one")
    with pytest.raises(IntegrityError), transaction.atomic():
        create_session("two")


def test_models_have_no_binary_payload_columns():
    assert all(field.get_internal_type() != "BinaryField" for field in FileAsset._meta.fields)
    assert all(field.get_internal_type() != "FileField" for field in FileAsset._meta.fields)
