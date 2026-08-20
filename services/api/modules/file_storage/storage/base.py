from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import BinaryIO, Protocol


class StorageError(Exception):
    """Safe provider error whose message never contains credentials or locators."""

    code = "STORAGE_UNAVAILABLE"
    retryable = False


class StorageConfigurationError(StorageError):
    code = "STORAGE_NOT_CONFIGURED"


class StorageNotFoundError(StorageError):
    code = "STORAGE_OBJECT_NOT_FOUND"


class StorageConflictError(StorageError):
    code = "STORAGE_OBJECT_CONFLICT"


class StorageTransientError(StorageError):
    retryable = True


@dataclass(frozen=True, slots=True)
class PresignedRequest:
    method: str
    url: str
    headers: Mapping[str, str]
    expires_at: datetime


@dataclass(frozen=True, slots=True)
class ObjectMetadata:
    size_bytes: int
    etag: str
    media_type: str
    checksum_sha256: str = ""
    version_id: str = ""


@dataclass(frozen=True, slots=True)
class StoredObject:
    metadata: ObjectMetadata


class StorageProvider(Protocol):
    def create_upload_grant(
        self,
        *,
        bucket: str,
        key: str,
        media_type: str,
        content_md5: str,
        expires_in: int,
    ) -> PresignedRequest: ...

    def head(self, *, bucket: str, key: str) -> ObjectMetadata: ...

    def read_range(self, *, bucket: str, key: str, byte_count: int) -> bytes: ...

    def copy_if_absent(
        self, *, source_bucket: str, source_key: str, target_bucket: str, target_key: str
    ) -> StoredObject: ...

    def create_read_grant(
        self,
        *,
        bucket: str,
        key: str,
        expires_in: int,
        content_disposition: str,
    ) -> PresignedRequest: ...

    def open(self, *, bucket: str, key: str) -> BinaryIO: ...

    def put_if_absent(
        self,
        *,
        bucket: str,
        key: str,
        body: BinaryIO | bytes,
        media_type: str,
        content_md5: str,
    ) -> StoredObject: ...

    def delete(self, *, bucket: str, key: str) -> None: ...

    def purge_exact_urls(self, urls: list[str]) -> None: ...
