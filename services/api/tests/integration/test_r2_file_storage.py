import base64
import hashlib
import os
from contextlib import closing
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import pytest
from django.conf import settings

from modules.file_storage.storage.keys import ObjectKeyBuilder
from modules.file_storage.storage.r2 import R2StorageProvider

pytestmark = pytest.mark.r2_integration


@pytest.mark.skipif(
    os.environ.get("RUN_R2_INTEGRATION_TESTS") != "1",
    reason="Set RUN_R2_INTEGRATION_TESTS=1 to use disposable R2 development objects.",
)
def test_direct_put_copy_read_and_cleanup_against_development_r2():
    assert settings.FILE_STORAGE_PROVIDER == "r2"
    assert settings.R2_PRIVATE_BUCKET.endswith("-dev")
    provider = R2StorageProvider()
    ids = [uuid4() for _ in range(4)]
    institute_id, branch_id, upload_id, asset_id = ids
    keys = ObjectKeyBuilder()
    staging_key = keys.staging(
        institute_id=institute_id, branch_id=branch_id, upload_id=upload_id
    )
    final_key = keys.original(
        institute_id=institute_id,
        branch_id=branch_id,
        owner_type="INSTITUTE",
        owner_id=institute_id,
        category="LETTERHEAD",
        asset_id=asset_id,
        extension="pdf",
    )
    content = b"%PDF-1.4\n% CampusOne disposable R2 integration object\n"
    content_md5 = base64.b64encode(
        hashlib.md5(content).digest()  # noqa: S324 - required R2 Content-MD5 contract
    ).decode()
    bucket = settings.R2_PRIVATE_BUCKET
    grant = provider.create_upload_grant(
        bucket=bucket,
        key=staging_key,
        media_type="application/pdf",
        content_md5=content_md5,
        expires_in=300,
    )
    try:
        request = Request(
            grant.url,
            data=content,
            method="PUT",
            headers={**grant.headers, "Origin": "http://localhost:5173"},
        )
        with urlopen(request, timeout=30) as response:  # noqa: S310
            assert response.status == 200
            assert response.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"

        with pytest.raises(HTTPError) as replay_error:
            urlopen(request, timeout=30)  # noqa: S310
        assert replay_error.value.code == 412

        staged = provider.head(bucket=bucket, key=staging_key)
        assert staged.size_bytes == len(content)
        assert provider.read_range(bucket=bucket, key=staging_key, byte_count=5) == b"%PDF-"

        copied = provider.copy_if_absent(
            source_bucket=bucket,
            source_key=staging_key,
            target_bucket=bucket,
            target_key=final_key,
        )
        assert copied.metadata.size_bytes == len(content)
        read_grant = provider.create_read_grant(
            bucket=bucket,
            key=final_key,
            expires_in=60,
            content_disposition='attachment; filename="integration.pdf"',
        )
        with closing(urlopen(read_grant.url, timeout=30)) as response:  # noqa: S310
            assert response.read() == content
    finally:
        provider.delete(bucket=bucket, key=final_key)
        provider.delete(bucket=bucket, key=staging_key)
