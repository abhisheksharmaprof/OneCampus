from io import BytesIO
from urllib.parse import parse_qs, urlsplit

import pytest
from botocore.exceptions import ClientError
from django.test import override_settings

from modules.file_storage.storage.base import StorageConflictError, StorageNotFoundError
from modules.file_storage.storage.r2 import R2StorageProvider


class FakeClient:
    def __init__(self):
        self.presign = None
        self.objects = {}

    def generate_presigned_url(self, operation, **kwargs):
        self.presign = (operation, kwargs)
        return "https://signed.invalid/request"

    def head_object(self, *, Bucket, Key):
        try:
            return self.objects[(Bucket, Key)]
        except KeyError as exc:
            raise ClientError(
                {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}},
                "HeadObject",
            ) from exc

    def get_object(self, *, Bucket, Key, Range=None):
        return {"Body": BytesIO(b"0123456789")}

    def copy_object(self, *, Bucket, Key, CopySource, MetadataDirective):
        self.objects[(Bucket, Key)] = self.objects[(CopySource["Bucket"], CopySource["Key"])]

    def put_object(self, **kwargs):
        key = (kwargs["Bucket"], kwargs["Key"])
        if key in self.objects:
            raise ClientError(
                {
                    "Error": {"Code": "PreconditionFailed"},
                    "ResponseMetadata": {"HTTPStatusCode": 412},
                },
                "PutObject",
            )
        self.objects[key] = {
            "ContentLength": 3,
            "ETag": '"etag"',
            "ContentType": kwargs["ContentType"],
        }

    def delete_object(self, **kwargs):
        self.objects.pop((kwargs["Bucket"], kwargs["Key"]), None)


def test_upload_grant_binds_exact_conditional_headers():
    client = FakeClient()
    grant = R2StorageProvider(client).create_upload_grant(
        bucket="private",
        key="v1/staging/key",
        media_type="application/pdf",
        content_md5="MDEyMzQ1Njc4OWFiY2RlZg==",
        expires_in=900,
    )
    operation, options = client.presign
    assert operation == "put_object"
    assert options["Params"] == {
        "Bucket": "private",
        "Key": "v1/staging/key",
        "ContentType": "application/pdf",
        "ContentMD5": "MDEyMzQ1Njc4OWFiY2RlZg==",
        "IfNoneMatch": "*",
    }
    assert grant.headers["If-None-Match"] == "*"


def test_head_maps_missing_object_without_leaking_locator():
    with pytest.raises(StorageNotFoundError) as error:
        R2StorageProvider(FakeClient()).head(bucket="secret-bucket", key="secret-key")
    assert "secret" not in str(error.value)


def test_put_and_copy_are_create_only():
    client = FakeClient()
    provider = R2StorageProvider(client)
    provider.put_if_absent(
        bucket="private",
        key="staging",
        body=b"pdf",
        media_type="application/pdf",
        content_md5="MDEyMzQ1Njc4OWFiY2RlZg==",
    )
    copied = provider.copy_if_absent(
        source_bucket="private",
        source_key="staging",
        target_bucket="private",
        target_key="final",
    )
    assert copied.metadata.etag == "etag"
    with pytest.raises(StorageConflictError):
        provider.copy_if_absent(
            source_bucket="private",
            source_key="staging",
            target_bucket="private",
            target_key="final",
        )


def test_range_reads_are_bounded():
    provider = R2StorageProvider(FakeClient())
    assert provider.read_range(bucket="private", key="object", byte_count=4) == b"0123"
    with pytest.raises(ValueError):
        provider.read_range(bucket="private", key="object", byte_count=2 * 1024 * 1024)


@override_settings(
    R2_ENDPOINT_URL="https://account-id.r2.cloudflarestorage.com",
    R2_ACCESS_KEY_ID="test-access-key",
    R2_SECRET_ACCESS_KEY="test-secret-key",
    R2_REGION="auto",
    R2_CONNECT_TIMEOUT_SECONDS=5,
    R2_READ_TIMEOUT_SECONDS=15,
    R2_MAX_ATTEMPTS=4,
    R2_MAX_POOL_CONNECTIONS=20,
)
def test_real_botocore_model_signs_supported_headers_and_uses_bounded_config():
    provider = R2StorageProvider()
    grant = provider.create_upload_grant(
        bucket="private",
        key="v1/staging/object",
        media_type="application/pdf",
        content_md5="MDEyMzQ1Njc4OWFiY2RlZg==",
        expires_in=900,
    )
    query = parse_qs(urlsplit(grant.url).query)
    signed_headers = query["X-Amz-SignedHeaders"][0].split(";")
    assert {"content-md5", "content-type", "host", "if-none-match"}.issubset(signed_headers)
    assert provider.client.meta.config.connect_timeout == 5
    assert provider.client.meta.config.read_timeout == 15
    assert provider.client.meta.config.retries["total_max_attempts"] == 4
