from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.people.models import StaffProfile, Student

from .models import FileAccessLog, FileAsset
from .services import (
    FileStorageError,
    FileValidationError,
    blob_name,
    container_for,
    read_url,
    upload_blob,
    validate_upload,
)


class FileUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    ownerType = serializers.ChoiceField(choices=FileAsset.OwnerType.choices)
    ownerId = serializers.UUIDField()
    assetType = serializers.ChoiceField(choices=FileAsset.AssetType.choices)
    visibility = serializers.ChoiceField(
        choices=FileAsset.Visibility.choices, required=False, default=FileAsset.Visibility.PRIVATE
    )

    def validate(self, attrs):
        owner_type = attrs["ownerType"]
        asset_type = attrs["assetType"]
        if (
            owner_type == FileAsset.OwnerType.INSTITUTE
            and attrs["ownerId"] != self.context["institute"].id
        ):
            raise serializers.ValidationError("The institute owner must be the current institute.")
        if owner_type in {
            FileAsset.OwnerType.STUDENT,
            FileAsset.OwnerType.STAFF,
            FileAsset.OwnerType.TEACHER,
        } and asset_type in {
            FileAsset.AssetType.LOGO,
            FileAsset.AssetType.LETTERHEAD,
            FileAsset.AssetType.BANNER,
            FileAsset.AssetType.GALLERY_IMAGE,
        }:
            raise serializers.ValidationError(
                "Institute image assets must belong to the institute."
            )
        return attrs


def _owner_belongs_to_institute(owner_type, owner_id, institute):
    if owner_type == FileAsset.OwnerType.INSTITUTE:
        return owner_id == institute.id
    if owner_type == FileAsset.OwnerType.STUDENT:
        return Student.objects.filter(id=owner_id, institute=institute).exists()
    if owner_type in {FileAsset.OwnerType.STAFF, FileAsset.OwnerType.TEACHER}:
        return StaffProfile.objects.filter(id=owner_id, institute=institute).exists()
    return False


def _data(asset):
    url = None
    if asset.status == FileAsset.Status.ACTIVE:
        try:
            url = read_url(asset)
        except FileStorageError:
            # Metadata remains inspectable in local/test environments without Azure credentials.
            url = None
    return {
        "id": str(asset.id),
        "ownerType": asset.owner_type,
        "ownerId": str(asset.owner_id),
        "assetType": asset.asset_type,
        "originalFileName": asset.original_file_name,
        "mimeType": asset.mime_type,
        "fileSize": asset.file_size,
        "status": asset.status,
        "visibility": asset.visibility,
        "url": url,
        "createdAt": asset.created_at,
    }


class FileAssetListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)
    parser_classes = (MultiPartParser, FormParser)

    def get(self, request):
        queryset = FileAsset.objects.filter(
            institute=request.institute, status=FileAsset.Status.ACTIVE
        )
        if request.query_params.get("ownerType"):
            queryset = queryset.filter(owner_type=request.query_params["ownerType"])
        if request.query_params.get("ownerId"):
            queryset = queryset.filter(owner_id=request.query_params["ownerId"])
        if request.query_params.get("assetType"):
            queryset = queryset.filter(asset_type=request.query_params["assetType"])
        return Response({"success": True, "data": [_data(asset) for asset in queryset[:100]]})

    def post(self, request):
        request_data = getattr(request, "_file_storage_payload", request.data)
        serializer = FileUploadSerializer(
            data=request_data, context={"institute": request.institute}
        )
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        if not _owner_belongs_to_institute(
            values["ownerType"], values["ownerId"], request.institute
        ):
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "OWNER_NOT_FOUND",
                        "message": "The file owner is not part of this institute.",
                    },
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        upload = values["file"]
        try:
            extension, mime_type, checksum = validate_upload(upload, values["assetType"])
        except FileValidationError as exc:
            return Response(
                {"success": False, "error": {"code": "INVALID_FILE", "message": str(exc)}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        asset = FileAsset(
            institute=request.institute,
            owner_type=values["ownerType"],
            owner_id=values["ownerId"],
            asset_type=values["assetType"],
            container_name=container_for(values["assetType"]),
            original_file_name=upload.name[:255],
            extension=extension,
            mime_type=mime_type,
            detected_mime_type=mime_type,
            file_size=upload.size,
            sha256_hash=checksum,
            visibility=values["visibility"],
            uploaded_by=request.user,
        )
        asset.blob_name = blob_name(
            institute_id=request.institute.id,
            owner_type=asset.owner_type,
            owner_id=asset.owner_id,
            asset_type=asset.asset_type,
            asset_id=asset.id,
            extension=extension,
        )
        try:
            etag, version_id = upload_blob(
                container=asset.container_name,
                name=asset.blob_name,
                upload=upload,
                content_type=mime_type,
            )
        except FileStorageError as exc:
            return Response(
                {"success": False, "error": {"code": "STORAGE_UNAVAILABLE", "message": str(exc)}},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        with transaction.atomic():
            if asset.asset_type in {
                FileAsset.AssetType.PROFILE_PHOTO,
                FileAsset.AssetType.LOGO,
                FileAsset.AssetType.LETTERHEAD,
            }:
                FileAsset.objects.filter(
                    institute=request.institute,
                    owner_type=asset.owner_type,
                    owner_id=asset.owner_id,
                    asset_type=asset.asset_type,
                    status=FileAsset.Status.ACTIVE,
                ).update(status=FileAsset.Status.DELETED, deleted_at=timezone.now())
            asset.storage_etag = etag
            asset.storage_version_id = version_id
            asset.status = FileAsset.Status.ACTIVE
            asset.save()
        return Response({"success": True, "data": _data(asset)}, status=status.HTTP_201_CREATED)


class ScopedFileUploadView(FileAssetListCreateView):
    """Compatibility routes for the UI while keeping one metadata pipeline."""

    owner_type = None
    asset_type = None

    def post(self, request, owner_id=None):
        payload = request.data.copy()
        payload["ownerType"] = self.owner_type
        payload["ownerId"] = str(owner_id or request.institute.id)
        payload["assetType"] = self.asset_type
        request._file_storage_payload = payload
        return super().post(request)


class StudentPhotoUploadView(ScopedFileUploadView):
    owner_type = FileAsset.OwnerType.STUDENT
    asset_type = FileAsset.AssetType.PROFILE_PHOTO


class StudentDocumentUploadView(ScopedFileUploadView):
    owner_type = FileAsset.OwnerType.STUDENT
    asset_type = FileAsset.AssetType.OTHER_DOCUMENT


class StaffPhotoUploadView(ScopedFileUploadView):
    owner_type = FileAsset.OwnerType.STAFF
    asset_type = FileAsset.AssetType.PROFILE_PHOTO


class StaffDocumentUploadView(ScopedFileUploadView):
    owner_type = FileAsset.OwnerType.STAFF
    asset_type = FileAsset.AssetType.OTHER_DOCUMENT


class TeacherPhotoUploadView(ScopedFileUploadView):
    owner_type = FileAsset.OwnerType.TEACHER
    asset_type = FileAsset.AssetType.PROFILE_PHOTO


class TeacherDocumentUploadView(ScopedFileUploadView):
    owner_type = FileAsset.OwnerType.TEACHER
    asset_type = FileAsset.AssetType.OTHER_DOCUMENT


class InstituteLogoUploadView(ScopedFileUploadView):
    owner_type = FileAsset.OwnerType.INSTITUTE
    asset_type = FileAsset.AssetType.LOGO


class InstituteDocumentUploadView(ScopedFileUploadView):
    owner_type = FileAsset.OwnerType.INSTITUTE
    asset_type = FileAsset.AssetType.CERTIFICATE


class FileAssetDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request, asset_id):
        asset = get_object_or_404(
            FileAsset, id=asset_id, institute=request.institute, status=FileAsset.Status.ACTIVE
        )
        FileAccessLog.objects.create(
            file_asset=asset,
            accessed_by=request.user,
            action="READ",
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:2000],
        )
        return Response({"success": True, "data": _data(asset)})

    def delete(self, request, asset_id):
        asset = get_object_or_404(
            FileAsset, id=asset_id, institute=request.institute, status=FileAsset.Status.ACTIVE
        )
        asset.status = FileAsset.Status.DELETED
        asset.deleted_at = timezone.now()
        asset.save(update_fields=("status", "deleted_at", "updated_at"))
        return Response(status=status.HTTP_204_NO_CONTENT)
