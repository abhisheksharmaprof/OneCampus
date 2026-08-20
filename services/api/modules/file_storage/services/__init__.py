"""File-storage application services and legacy compatibility exports."""

from .legacy import (
    FileStorageError,
    FileValidationError,
    _blob_service_client,
    blob_name,
    compute_sha256,
    container_for,
    read_url,
    upload_blob,
    validate_upload,
)

__all__ = [
    "FileStorageError",
    "FileValidationError",
    "_blob_service_client",
    "blob_name",
    "compute_sha256",
    "container_for",
    "read_url",
    "upload_blob",
    "validate_upload",
]
