"""Provider-neutral object-storage boundary for CampusOne files."""

from .base import ObjectMetadata, PresignedRequest, StorageProvider
from .keys import ObjectKeyBuilder

__all__ = ["ObjectKeyBuilder", "ObjectMetadata", "PresignedRequest", "StorageProvider"]


def get_storage_provider():
    from django.conf import settings

    if settings.FILE_STORAGE_PROVIDER == "r2":
        from .r2 import R2StorageProvider

        return R2StorageProvider()
    from .legacy_azure import LegacyAzureStorageProvider

    return LegacyAzureStorageProvider()
