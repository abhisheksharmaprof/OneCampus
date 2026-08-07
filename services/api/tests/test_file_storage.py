from datetime import timedelta
from unittest.mock import Mock, patch

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from modules.file_storage.models import FileAccessLog, FileAsset, FileUploadSession, FileVariant
from modules.file_storage.services import FileStorageError, FileValidationError, validate_upload
from modules.identity.models import User
from modules.institutes.models import Institute


@pytest.mark.django_db
def test_file_storage_models_preserve_tenant_scope():
    institute = Institute.objects.create(name="Test School", code="FILES")
    asset = FileAsset.objects.create(
        institute=institute,
        owner_type="INSTITUTE",
        owner_id=institute.id,
        asset_type="LOGO",
        container_name="institute-assets",
        blob_name="i/photo.png",
        original_file_name="photo.png",
        extension="png",
        mime_type="image/png",
    )
    user = User.objects.create_user(email="files@example.com")
    FileUploadSession.objects.create(
        institute=institute,
        file_asset=asset,
        uploaded_by=user,
        expected_size=10,
        expires_at=timezone.now() + timedelta(minutes=30),
    )
    variant = FileVariant.objects.create(
        file_asset=asset,
        variant_type="THUMBNAIL",
        container_name="institute-assets",
        blob_name="i/photo-thumb.png",
        mime_type="image/png",
    )
    FileAccessLog.objects.create(file_asset=asset, action="preview", ip_address="127.0.0.1")
    assert asset.variants.get(variant_type="THUMBNAIL") == variant
    assert asset.access_logs.exists()


def test_storage_requires_configuration(settings):
    settings.AZURE_STORAGE_CONNECTION_STRING = ""
    settings.AZURE_STORAGE_ACCOUNT_NAME = ""
    settings.AZURE_STORAGE_ACCOUNT_KEY = ""
    from modules.file_storage.services import _blob_service_client

    with pytest.raises(FileStorageError):
        _blob_service_client()


def test_storage_upload_delegates_to_blob_client(settings):
    blob = Mock()
    blob.get_blob_properties.return_value = Mock(etag='"etag"', version_id="version")
    client = Mock()
    client.get_blob_client.return_value = blob
    upload = Mock(size=5, content_type="text/plain")
    with patch("modules.file_storage.services._blob_service_client", return_value=client):
        from modules.file_storage.services import upload_blob

        result = upload_blob(
            container="documents", name="a/b.txt", upload=upload, content_type="text/plain"
        )
    assert result == ("etag", "version")
    blob.upload_blob.assert_called_once()


def test_profile_upload_requires_matching_image_signature():
    upload = SimpleUploadedFile("avatar.png", b"not-an-image", content_type="image/png")
    with pytest.raises(FileValidationError):
        validate_upload(upload, FileAsset.AssetType.PROFILE_PHOTO)


def test_document_upload_rejects_executable_extension():
    upload = SimpleUploadedFile(
        "payload.exe", b"MZ" + (b"0" * 20), content_type="application/octet-stream"
    )
    with pytest.raises(FileValidationError):
        validate_upload(upload, FileAsset.AssetType.OTHER_DOCUMENT)
