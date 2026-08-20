import base64
import hashlib
from datetime import timedelta
from io import BytesIO

import pytest
from django.utils import timezone

from modules.file_storage.storage.base import ObjectMetadata, PresignedRequest, StoredObject
from modules.identity.models import User
from modules.institutes.models import Institute, InstituteMembership


class ApiStorage:
    def __init__(self, content):
        self.content = content
        self.objects = {}
        self.md5_hex = hashlib.md5(content).hexdigest()  # noqa: S324

    def create_upload_grant(self, *, bucket, key, media_type, content_md5, expires_in):
        self.objects[(bucket, key)] = self.content
        return PresignedRequest(
            "PUT",
            "https://signed.invalid/upload",
            {"Content-Type": media_type, "Content-MD5": content_md5, "If-None-Match": "*"},
            timezone.now() + timedelta(seconds=expires_in),
        )

    def head(self, *, bucket, key):
        return ObjectMetadata(len(self.objects[(bucket, key)]), self.md5_hex, "image/png")

    def read_range(self, *, bucket, key, byte_count):
        return self.objects[(bucket, key)][:byte_count]

    def open(self, *, bucket, key):
        return BytesIO(self.objects[(bucket, key)])

    def copy_if_absent(self, *, source_bucket, source_key, target_bucket, target_key):
        self.objects[(target_bucket, target_key)] = self.objects[(source_bucket, source_key)]
        return StoredObject(self.head(bucket=target_bucket, key=target_key))


@pytest.fixture
def authenticated_admin(api_client):
    institute = Institute.objects.create(name="API File School", code="API-FILES")
    actor = User.objects.create_user(email="file-admin@example.com")
    membership = InstituteMembership.objects.create(
        user=actor, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    api_client.force_authenticate(
        user=actor, token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    return api_client, institute


@pytest.mark.django_db
def test_direct_upload_contract_never_returns_bucket_or_key(authenticated_admin, monkeypatch):
    client, institute = authenticated_admin
    content = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    provider = ApiStorage(content)
    monkeypatch.setattr(
        "modules.file_storage.services.uploads.get_storage_provider", lambda: provider
    )
    payload = {
        "owner": {"type": "INSTITUTE", "id": str(institute.id)},
        "category": "LOGO",
        "originalFileName": "logo.png",
        "mediaType": "image/png",
        "sizeBytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "contentMd5": base64.b64encode(hashlib.md5(content).digest()).decode(),  # noqa: S324
        "visibility": "PRIVATE",
    }
    initiated = client.post(
        "/api/v1/admin/file-uploads",
        payload,
        format="json",
        HTTP_IDEMPOTENCY_KEY="api-upload-1",
    )
    assert initiated.status_code == 201
    data = initiated.json()["data"]
    assert data["upload"]["headers"]["If-None-Match"] == "*"
    assert "bucket" not in str(initiated.json()).lower()
    assert "stagingKey" not in str(initiated.json())

    completed = client.post(data["completeUrl"], {}, format="json")
    assert completed.status_code == 200
    completed_data = completed.json()["data"]
    assert completed_data["state"] == "ACTIVE"
    assert completed_data["owner"] == {"type": "INSTITUTE", "id": str(institute.id)}
    assert "url" not in completed_data


@pytest.mark.django_db
def test_initiation_requires_idempotency_header(authenticated_admin):
    client, institute = authenticated_admin
    response = client.post(
        "/api/v1/admin/file-uploads",
        {
            "owner": {"type": "INSTITUTE", "id": str(institute.id)},
            "category": "LOGO",
            "originalFileName": "logo.png",
            "mediaType": "image/png",
            "sizeBytes": 10,
            "sha256": "a" * 64,
            "contentMd5": "MDEyMzQ1Njc4OWFiY2RlZg==",
        },
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_IDEMPOTENCY_KEY"
