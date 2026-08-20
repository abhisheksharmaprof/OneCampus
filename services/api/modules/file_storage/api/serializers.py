from rest_framework import serializers

from modules.file_storage.models import FileAsset


class FileOwnerSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=FileAsset.OwnerType.choices)
    id = serializers.UUIDField()


class InitiateFileUploadSerializer(serializers.Serializer):
    owner = FileOwnerSerializer()
    branchId = serializers.UUIDField(required=False, allow_null=True)
    category = serializers.ChoiceField(choices=FileAsset.AssetType.choices)
    originalFileName = serializers.CharField(max_length=255)
    mediaType = serializers.CharField(max_length=127)
    sizeBytes = serializers.IntegerField(min_value=1)
    sha256 = serializers.RegexField(r"^[0-9a-fA-F]{64}$")
    contentMd5 = serializers.CharField(max_length=64)
    visibility = serializers.ChoiceField(
        choices=FileAsset.Visibility.choices,
        required=False,
        default=FileAsset.Visibility.PRIVATE,
    )
    replacesFileId = serializers.UUIDField(required=False)


class CompleteFileUploadSerializer(serializers.Serializer):
    etag = serializers.CharField(max_length=255, required=False, allow_blank=True)


class FileAssetSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    owner = serializers.SerializerMethodField()
    branchId = serializers.UUIDField(source="branch_id", read_only=True, allow_null=True)
    category = serializers.CharField(source="asset_type", read_only=True)
    originalFileName = serializers.CharField(source="original_file_name", read_only=True)
    mediaType = serializers.CharField(source="mime_type", read_only=True)
    sizeBytes = serializers.IntegerField(source="file_size", read_only=True)
    state = serializers.CharField(source="status", read_only=True)
    visibility = serializers.CharField(read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    deletedAt = serializers.DateTimeField(source="deleted_at", read_only=True, allow_null=True)
    retentionUntil = serializers.DateTimeField(
        source="retention_until", read_only=True, allow_null=True
    )
    version = serializers.IntegerField(read_only=True)

    def get_owner(self, asset):
        return {"type": asset.owner_type, "id": str(asset.owner_id)}


def initiated_upload_data(result) -> dict:
    session = result.session
    return {
        "uploadId": str(session.id),
        "fileId": str(session.file_asset_id),
        "state": "AWAITING_UPLOAD",
        "expiresAt": session.expires_at,
        "upload": {
            "method": result.grant.method,
            "url": result.grant.url,
            "headers": dict(result.grant.headers),
        },
        "completeUrl": f"/api/v1/admin/file-uploads/{session.id}/complete",
    }
