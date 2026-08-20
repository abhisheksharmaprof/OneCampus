from __future__ import annotations

import json
from datetime import timedelta
from io import BytesIO
from typing import BinaryIO
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.utils import timezone

from .base import (
    ObjectMetadata,
    PresignedRequest,
    StorageConfigurationError,
    StorageConflictError,
    StorageError,
    StorageNotFoundError,
    StorageTransientError,
    StoredObject,
)


class R2StorageProvider:
    """Bounded Cloudflare R2 adapter using only supported S3 operations."""

    def __init__(self, client=None):
        self.client = client or self._build_client()

    @staticmethod
    def _build_client():
        if not all(
            (
                settings.R2_ENDPOINT_URL,
                settings.R2_ACCESS_KEY_ID,
                settings.R2_SECRET_ACCESS_KEY,
            )
        ):
            raise StorageConfigurationError("Cloudflare R2 is not configured.")
        import boto3
        from botocore.config import Config

        return boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT_URL,
            region_name=settings.R2_REGION,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID,
            aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            config=Config(
                signature_version="s3v4",
                connect_timeout=settings.R2_CONNECT_TIMEOUT_SECONDS,
                read_timeout=settings.R2_READ_TIMEOUT_SECONDS,
                max_pool_connections=settings.R2_MAX_POOL_CONNECTIONS,
                retries={
                    "mode": "standard",
                    "total_max_attempts": settings.R2_MAX_ATTEMPTS,
                },
                s3={"addressing_style": "path"},
            ),
        )

    @staticmethod
    def _raise_safe(exc: Exception) -> None:
        try:
            from botocore.exceptions import BotoCoreError, ClientError
        except ImportError:
            raise StorageError("Object storage request failed.") from exc
        if isinstance(exc, ClientError):
            response = getattr(exc, "response", {})
            status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            code = response.get("Error", {}).get("Code", "")
            if status == 404 or code in {"NoSuchKey", "NotFound"}:
                raise StorageNotFoundError("The object was not found.") from exc
            if status in {409, 412} or code in {"PreconditionFailed", "ConditionalRequestConflict"}:
                raise StorageConflictError("The object already exists.") from exc
            if status in {429, 500, 502, 503, 504}:
                raise StorageTransientError("Object storage is temporarily unavailable.") from exc
        if isinstance(exc, BotoCoreError):
            raise StorageTransientError("Object storage is temporarily unavailable.") from exc
        raise StorageError("Object storage request failed.") from exc

    @staticmethod
    def _metadata(response: dict) -> ObjectMetadata:
        return ObjectMetadata(
            size_bytes=int(response.get("ContentLength", 0)),
            etag=str(response.get("ETag", "")).strip('"'),
            media_type=str(response.get("ContentType", "")),
            checksum_sha256=str(response.get("ChecksumSHA256", "")),
            version_id=str(response.get("VersionId", "") or ""),
        )

    def create_upload_grant(
        self,
        *,
        bucket: str,
        key: str,
        media_type: str,
        content_md5: str,
        expires_in: int,
    ) -> PresignedRequest:
        params = {
            "Bucket": bucket,
            "Key": key,
            "ContentType": media_type,
            "ContentMD5": content_md5,
            "IfNoneMatch": "*",
        }
        try:
            url = self.client.generate_presigned_url(
                "put_object", Params=params, ExpiresIn=expires_in, HttpMethod="PUT"
            )
        except Exception as exc:
            self._raise_safe(exc)
        return PresignedRequest(
            method="PUT",
            url=url,
            headers={
                "Content-Type": media_type,
                "Content-MD5": content_md5,
                "If-None-Match": "*",
            },
            expires_at=timezone.now() + timedelta(seconds=expires_in),
        )

    def head(self, *, bucket: str, key: str) -> ObjectMetadata:
        try:
            return self._metadata(self.client.head_object(Bucket=bucket, Key=key))
        except Exception as exc:
            self._raise_safe(exc)

    def read_range(self, *, bucket: str, key: str, byte_count: int) -> bytes:
        if byte_count < 1 or byte_count > 1024 * 1024:
            raise ValueError("byte_count must be between 1 and 1048576.")
        try:
            response = self.client.get_object(
                Bucket=bucket, Key=key, Range=f"bytes=0-{byte_count - 1}"
            )
            body = response["Body"]
            try:
                return body.read(byte_count)
            finally:
                body.close()
        except Exception as exc:
            self._raise_safe(exc)

    def copy_if_absent(
        self, *, source_bucket: str, source_key: str, target_bucket: str, target_key: str
    ) -> StoredObject:
        try:
            self.client.head_object(Bucket=target_bucket, Key=target_key)
        except Exception as exc:
            try:
                from botocore.exceptions import ClientError

                if (
                    not isinstance(exc, ClientError)
                    or exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404
                ):
                    self._raise_safe(exc)
            except ImportError:
                self._raise_safe(exc)
        else:
            raise StorageConflictError("The destination object already exists.")
        try:
            self.client.copy_object(
                Bucket=target_bucket,
                Key=target_key,
                CopySource={"Bucket": source_bucket, "Key": source_key},
                MetadataDirective="COPY",
            )
            return StoredObject(self.head(bucket=target_bucket, key=target_key))
        except Exception as exc:
            self._raise_safe(exc)

    def create_read_grant(
        self,
        *,
        bucket: str,
        key: str,
        expires_in: int,
        content_disposition: str,
    ) -> PresignedRequest:
        try:
            url = self.client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": bucket,
                    "Key": key,
                    "ResponseContentDisposition": content_disposition,
                },
                ExpiresIn=expires_in,
                HttpMethod="GET",
            )
        except Exception as exc:
            self._raise_safe(exc)
        return PresignedRequest(
            method="GET",
            url=url,
            headers={},
            expires_at=timezone.now() + timedelta(seconds=expires_in),
        )

    def open(self, *, bucket: str, key: str) -> BinaryIO:
        try:
            response = self.client.get_object(Bucket=bucket, Key=key)
            return response["Body"]
        except Exception as exc:
            self._raise_safe(exc)

    def put_if_absent(
        self,
        *,
        bucket: str,
        key: str,
        body: BinaryIO | bytes,
        media_type: str,
        content_md5: str,
    ) -> StoredObject:
        body_value = BytesIO(body) if isinstance(body, bytes) else body
        try:
            self.client.put_object(
                Bucket=bucket,
                Key=key,
                Body=body_value,
                ContentType=media_type,
                ContentMD5=content_md5,
                IfNoneMatch="*",
            )
            return StoredObject(self.head(bucket=bucket, key=key))
        except Exception as exc:
            self._raise_safe(exc)

    def delete(self, *, bucket: str, key: str) -> None:
        try:
            self.client.delete_object(Bucket=bucket, Key=key)
        except Exception as exc:
            self._raise_safe(exc)

    def purge_exact_urls(self, urls: list[str]) -> None:
        if not urls:
            return
        if not settings.CLOUDFLARE_API_TOKEN or not settings.CLOUDFLARE_ZONE_ID:
            raise StorageConfigurationError("Cloudflare cache purge is not configured.")
        if len(urls) > 30:
            raise ValueError("At most 30 URLs can be purged in one request.")
        endpoint = (
            f"https://api.cloudflare.com/client/v4/zones/{settings.CLOUDFLARE_ZONE_ID}/purge_cache"
        )
        request = Request(
            endpoint,
            data=json.dumps({"files": urls}).encode(),
            method="POST",
            headers={
                "Authorization": f"Bearer {settings.CLOUDFLARE_API_TOKEN}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=settings.R2_READ_TIMEOUT_SECONDS) as response:  # noqa: S310
                payload = json.loads(response.read())
        except (HTTPError, URLError, TimeoutError, ValueError) as exc:
            raise StorageTransientError("Cloudflare cache purge failed.") from exc
        if not payload.get("success"):
            raise StorageError("Cloudflare cache purge failed.")
