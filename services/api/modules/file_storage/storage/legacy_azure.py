from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .base import PresignedRequest, StorageConfigurationError


class LegacyAzureStorageProvider:
    """Read-only adapter for existing Azure metadata during the R2 transition."""

    def create_read_grant_for_asset(self, asset) -> PresignedRequest:
        from modules.file_storage.services import read_url

        if asset.storage_provider != "AZURE":
            raise StorageConfigurationError("The legacy provider cannot read this asset.")
        return PresignedRequest(
            method="GET",
            url=read_url(asset),
            headers={},
            expires_at=timezone.now() + timedelta(minutes=settings.AZURE_STORAGE_SAS_MINUTES),
        )
