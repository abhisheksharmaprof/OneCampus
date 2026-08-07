import hashlib
import re
from dataclasses import dataclass
from datetime import timedelta
from pathlib import PurePosixPath
from uuid import UUID

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.utils import timezone

from .models import FileAsset


class FileStorageError(Exception):
    pass


class FileValidationError(FileStorageError):
    pass


@dataclass(frozen=True)
class FilePolicy:
    max_bytes: int
    extensions: frozenset[str]
    mime_types: frozenset[str]
    image: bool = False


POLICIES = {
    FileAsset.AssetType.PROFILE_PHOTO: FilePolicy(
        5 * 1024 * 1024,
        frozenset({"jpg", "jpeg", "png", "webp"}),
        frozenset({"image/jpeg", "image/png", "image/webp"}),
        True,
    ),
    FileAsset.AssetType.LOGO: FilePolicy(
        10 * 1024 * 1024,
        frozenset({"jpg", "jpeg", "png", "webp", "svg"}),
        frozenset({"image/jpeg", "image/png", "image/webp", "image/svg+xml"}),
        True,
    ),
    FileAsset.AssetType.LETTERHEAD: FilePolicy(
        10 * 1024 * 1024,
        frozenset({"pdf", "jpg", "jpeg", "png", "webp"}),
        frozenset({"application/pdf", "image/jpeg", "image/png", "image/webp"}),
        False,
    ),
    FileAsset.AssetType.BANNER: FilePolicy(
        10 * 1024 * 1024,
        frozenset({"jpg", "jpeg", "png", "webp"}),
        frozenset({"image/jpeg", "image/png", "image/webp"}),
        True,
    ),
    FileAsset.AssetType.GALLERY_IMAGE: FilePolicy(
        10 * 1024 * 1024,
        frozenset({"jpg", "jpeg", "png", "webp"}),
        frozenset({"image/jpeg", "image/png", "image/webp"}),
        True,
    ),
    FileAsset.AssetType.ID_DOCUMENT: FilePolicy(
        25 * 1024 * 1024,
        frozenset({"pdf", "jpg", "jpeg", "png"}),
        frozenset({"application/pdf", "image/jpeg", "image/png"}),
    ),
    FileAsset.AssetType.CERTIFICATE: FilePolicy(
        25 * 1024 * 1024,
        frozenset({"pdf", "jpg", "jpeg", "png"}),
        frozenset({"application/pdf", "image/jpeg", "image/png"}),
    ),
    FileAsset.AssetType.OTHER_DOCUMENT: FilePolicy(
        25 * 1024 * 1024,
        frozenset({"pdf", "jpg", "jpeg", "png"}),
        frozenset({"application/pdf", "image/jpeg", "image/png"}),
    ),
}

MAGIC = {
    "application/pdf": (b"%PDF-",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/webp": (b"RIFF",),
}


def _safe_extension(name: str) -> str:
    extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if not re.fullmatch(r"[a-z0-9]{1,10}", extension):
        raise FileValidationError("The file extension is not allowed.")
    return extension


def validate_upload(upload: UploadedFile, asset_type: str) -> tuple[str, str, str]:
    policy = POLICIES.get(asset_type)
    if not policy:
        raise FileValidationError("The requested asset type is not supported.")
    extension = _safe_extension(upload.name or "")
    if extension not in policy.extensions:
        raise FileValidationError("This file type is not allowed for the requested asset.")
    if not upload.size or upload.size > policy.max_bytes:
        raise FileValidationError(
            f"The file exceeds the {policy.max_bytes // (1024 * 1024)} MB limit."
        )
    declared = (upload.content_type or "").lower()
    if declared not in policy.mime_types:
        raise FileValidationError("The file MIME type is not allowed.")
    head = upload.read(16)
    upload.seek(0)
    if declared in MAGIC and not any(head.startswith(signature) for signature in MAGIC[declared]):
        raise FileValidationError("The file content does not match its MIME type.")
    if declared == "image/webp" and head[:4] != b"RIFF":
        raise FileValidationError("The image content is invalid.")
    return extension, declared, compute_sha256(upload)


def compute_sha256(upload: UploadedFile) -> str:
    digest = hashlib.sha256()
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    return digest.hexdigest()


def container_for(asset_type: str) -> str:
    if asset_type in {FileAsset.AssetType.PROFILE_PHOTO}:
        return settings.AZURE_STORAGE_PROFILE_CONTAINER
    if asset_type in {
        FileAsset.AssetType.LOGO,
        FileAsset.AssetType.LETTERHEAD,
        FileAsset.AssetType.BANNER,
        FileAsset.AssetType.GALLERY_IMAGE,
    }:
        return settings.AZURE_STORAGE_INSTITUTE_CONTAINER
    return settings.AZURE_STORAGE_DOCUMENT_CONTAINER


def blob_name(
    *,
    institute_id: UUID,
    owner_type: str,
    owner_id: UUID,
    asset_type: str,
    asset_id: UUID,
    extension: str,
) -> str:
    owner_folder = {
        "STUDENT": "students",
        "STAFF": "staff",
        "TEACHER": "teachers",
        "INSTITUTE": "institute",
    }[owner_type]
    asset_folder = asset_type.lower()
    return str(
        PurePosixPath(
            str(institute_id),
            owner_folder,
            str(owner_id),
            asset_folder,
            str(asset_id),
            f"original.{extension}",
        )
    )


def _blob_service_client():
    from azure.storage.blob import BlobServiceClient

    if settings.AZURE_STORAGE_CONNECTION_STRING:
        return BlobServiceClient.from_connection_string(settings.AZURE_STORAGE_CONNECTION_STRING)
    if settings.AZURE_STORAGE_ACCOUNT_NAME and settings.AZURE_STORAGE_ACCOUNT_KEY:
        endpoint = f"https://{settings.AZURE_STORAGE_ACCOUNT_NAME}.blob.{settings.AZURE_STORAGE_ENDPOINT_SUFFIX}"
        return BlobServiceClient(
            account_url=endpoint, credential=settings.AZURE_STORAGE_ACCOUNT_KEY
        )
    if settings.AZURE_STORAGE_ACCOUNT_NAME:
        from azure.identity import DefaultAzureCredential

        endpoint = f"https://{settings.AZURE_STORAGE_ACCOUNT_NAME}.blob.{settings.AZURE_STORAGE_ENDPOINT_SUFFIX}"
        return BlobServiceClient(account_url=endpoint, credential=DefaultAzureCredential())
    raise FileStorageError("Azure Blob Storage is not configured.")


def _connection_string_value(name: str) -> str:
    connection_string = settings.AZURE_STORAGE_CONNECTION_STRING
    if not connection_string:
        return ""
    values = {}
    for item in connection_string.split(";"):
        key, separator, value = item.partition("=")
        if separator:
            values[key] = value
    return values.get(name, "")


def upload_blob(
    *, container: str, name: str, upload: UploadedFile, content_type: str
) -> tuple[str, str]:
    from azure.storage.blob import ContentSettings

    client = _blob_service_client()
    blob = client.get_blob_client(container=container, blob=name)
    try:
        blob.upload_blob(
            upload, overwrite=False, content_settings=ContentSettings(content_type=content_type)
        )
        properties = blob.get_blob_properties()
    except Exception as exc:
        raise FileStorageError("Azure Blob Storage could not confirm the uploaded file.") from exc
    return properties.etag.strip('"'), getattr(properties, "version_id", "") or ""


def read_url(asset: FileAsset) -> str:
    from azure.storage.blob import BlobSasPermissions, generate_blob_sas

    expires = timezone.now() + timedelta(minutes=settings.AZURE_STORAGE_SAS_MINUTES)
    common = {
        "account_name": settings.AZURE_STORAGE_ACCOUNT_NAME,
        "container_name": asset.container_name,
        "blob_name": asset.blob_name,
        "permission": BlobSasPermissions(read=True),
        "expiry": expires,
    }
    account_name = settings.AZURE_STORAGE_ACCOUNT_NAME or _connection_string_value("AccountName")
    account_key = settings.AZURE_STORAGE_ACCOUNT_KEY or _connection_string_value("AccountKey")
    if not account_name:
        raise FileStorageError("Azure SAS URL generation requires an account name.")
    common["account_name"] = account_name
    try:
        if account_key:
            token = generate_blob_sas(account_key=account_key, **common)
        else:
            service = _blob_service_client()
            delegation_key = service.get_user_delegation_key(
                key_start_time=timezone.now() - timedelta(minutes=5),
                key_expiry_time=expires,
            )
            token = generate_blob_sas(user_delegation_key=delegation_key, **common)
    except Exception as exc:
        raise FileStorageError("Azure Blob Storage could not create a secure file URL.") from exc
    endpoint = f"https://{account_name}.blob.{settings.AZURE_STORAGE_ENDPOINT_SUFFIX}"
    return f"{endpoint}/{asset.container_name}/{asset.blob_name}?{token}"
