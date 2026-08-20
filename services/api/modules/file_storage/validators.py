from __future__ import annotations

from contextlib import closing

from django.conf import settings
from PIL import Image, UnidentifiedImageError

from modules.file_storage.services.uploads import UploadServiceError

_IMAGE_FORMATS = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}


def verify_stored_content(*, provider, bucket: str, key: str, media_type: str) -> None:
    """Perform bounded parser-level verification after signature inspection."""
    expected_format = _IMAGE_FORMATS.get(media_type)
    if expected_format is None:
        return
    original_limit = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = settings.FILE_STORAGE_PREVIEW_MAX_PIXELS
    try:
        with closing(provider.open(bucket=bucket, key=key)) as stream:
            with Image.open(stream) as image:
                if image.format != expected_format:
                    raise UploadServiceError(
                        "CONTENT_TYPE_MISMATCH",
                        "The uploaded image format does not match its media type.",
                    )
                image.verify()
    except UploadServiceError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as exc:
        raise UploadServiceError("CONTENT_TYPE_MISMATCH", "The uploaded image is invalid.") from exc
    finally:
        Image.MAX_IMAGE_PIXELS = original_limit
