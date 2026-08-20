import base64
import hashlib
from datetime import timedelta
from io import BytesIO

import pytest
from django.utils import timezone

from modules.file_storage.models import FileAsset, FileUploadSession
from modules.file_storage.services.uploads import (
    UploadServiceError,
    complete_upload,
    initiate_upload,
)
from modules.file_storage.storage.base import ObjectMetadata, PresignedRequest, StoredObject
from modules.identity.models import User
from modules.institutes.models import Institute
from modules.people.contracts import FileOwnerScope


class FakeStorage:
    def __init__(self, content):
        self.content = content
        self.objects = {}
        self.grants = 0

    @property
    def md5_hex(self):
        return hashlib.md5(self.content).hexdigest()  # noqa: S324 - R2 Content-MD5 contract

    def create_upload_grant(self, *, bucket, key, media_type, content_md5, expires_in):
        self.grants += 1
        self.objects[(bucket, key)] = self.content
        return PresignedRequest(
            "PUT",
            "https://signed.invalid/upload",
            {"Content-Type": media_type, "Content-MD5": content_md5, "If-None-Match": "*"},
            timezone.now() + timedelta(seconds=expires_in),
        )

    def head(self, *, bucket, key):
        content = self.objects[(bucket, key)]
        return ObjectMetadata(len(content), self.md5_hex, "image/png")

    def read_range(self, *, bucket, key, byte_count):
        return self.objects[(bucket, key)][:byte_count]

    def open(self, *, bucket, key):
        return BytesIO(self.objects[(bucket, key)])

    def copy_if_absent(self, *, source_bucket, source_key, target_bucket, target_key):
        assert (target_bucket, target_key) not in self.objects
        self.objects[(target_bucket, target_key)] = self.objects[(source_bucket, source_key)]
        return StoredObject(self.head(bucket=target_bucket, key=target_key))


@pytest.fixture
def upload_context(db):
    institute = Institute.objects.create(name="Upload School", code="UPLOAD-FILES")
    actor = User.objects.create_user(email="direct-upload@example.com")
    content = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    payload = {
        "owner": {"type": "INSTITUTE", "id": str(institute.id)},
        "branchId": None,
        "category": "LOGO",
        "originalFileName": "school-logo.png",
        "mediaType": "image/png",
        "sizeBytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "contentMd5": base64.b64encode(hashlib.md5(content).digest()).decode(),  # noqa: S324
        "visibility": "PRIVATE",
    }
    owner = FileOwnerScope("INSTITUTE", institute.id, institute.id, None, True)
    return institute, actor, owner, content, payload


@pytest.mark.django_db
def test_initiate_is_idempotent_and_paths_are_institute_scoped(upload_context):
    institute, actor, owner, content, payload = upload_context
    provider = FakeStorage(content)
    first = initiate_upload(
        actor=actor,
        institute=institute,
        owner=owner,
        idempotency_key="upload-request-1",
        payload=payload,
        provider=provider,
    )
    second = initiate_upload(
        actor=actor,
        institute=institute,
        owner=owner,
        idempotency_key="upload-request-1",
        payload=payload,
        provider=provider,
    )
    assert second.replayed is True
    assert second.session.id == first.session.id
    assert f"institutes/{institute.id}/branches/_institute" in first.session.staging_key
    assert first.session.file_asset.blob_name.startswith(
        f"v1/objects/institutes/{institute.id}/branches/_institute/"
    )


@pytest.mark.django_db
def test_idempotency_key_reuse_with_different_input_conflicts(upload_context):
    institute, actor, owner, content, payload = upload_context
    provider = FakeStorage(content)
    initiate_upload(
        actor=actor,
        institute=institute,
        owner=owner,
        idempotency_key="upload-request-2",
        payload=payload,
        provider=provider,
    )
    changed = {**payload, "originalFileName": "different.png"}
    with pytest.raises(UploadServiceError) as error:
        initiate_upload(
            actor=actor,
            institute=institute,
            owner=owner,
            idempotency_key="upload-request-2",
            payload=changed,
            provider=provider,
        )
    assert error.value.code == "IDEMPOTENCY_CONFLICT"


@pytest.mark.django_db
def test_completion_verifies_and_activates_immutable_final_object(upload_context):
    institute, actor, owner, content, payload = upload_context
    provider = FakeStorage(content)
    initiated = initiate_upload(
        actor=actor,
        institute=institute,
        owner=owner,
        idempotency_key="upload-request-3",
        payload=payload,
        provider=provider,
    )
    asset = complete_upload(
        upload_id=initiated.session.id,
        actor=actor,
        institute=institute,
        provider=provider,
    )
    assert asset.status == FileAsset.Status.ACTIVE
    assert asset.storage_provider == "R2"
    assert provider.objects[(asset.container_name, asset.blob_name)] == content
    initiated.session.refresh_from_db()
    assert initiated.session.status == FileUploadSession.Status.COMPLETED
    assert (
        complete_upload(
            upload_id=initiated.session.id,
            actor=actor,
            institute=institute,
            provider=provider,
        ).id
        == asset.id
    )
