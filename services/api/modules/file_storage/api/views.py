from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.file_storage.authorization import authorize_admin_owner
from modules.file_storage.services.uploads import (
    UploadServiceError,
    complete_upload,
    initiate_upload,
)
from modules.institutes.api.permissions import IsCurrentInstituteAdmin

from .serializers import (
    CompleteFileUploadSerializer,
    FileAssetSerializer,
    InitiateFileUploadSerializer,
    initiated_upload_data,
)


def _service_error(error: UploadServiceError) -> Response:
    return Response(
        {"success": False, "error": {"code": error.code, "message": str(error)}},
        status=error.status_code,
    )


class FileUploadInitiateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request):
        serializer = InitiateFileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        owner_values = values["owner"]
        authorized = authorize_admin_owner(
            request,
            permission_key="files.upload",
            owner_type=owner_values["type"],
            owner_id=owner_values["id"],
            branch_id=values.get("branchId"),
        )
        payload = {
            "owner": {"type": owner_values["type"], "id": str(owner_values["id"])},
            **{key: value for key, value in values.items() if key != "owner"},
        }
        try:
            result = initiate_upload(
                actor=request.user,
                institute=request.institute,
                owner=authorized.scope,
                idempotency_key=request.headers.get("Idempotency-Key", ""),
                payload=payload,
            )
        except UploadServiceError as error:
            return _service_error(error)
        return Response(
            {"success": True, "data": initiated_upload_data(result)},
            status=status.HTTP_200_OK if result.replayed else status.HTTP_201_CREATED,
        )


class FileUploadCompleteView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request, upload_id):
        serializer = CompleteFileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            asset = complete_upload(
                upload_id=upload_id,
                actor=request.user,
                institute=request.institute,
            )
        except UploadServiceError as error:
            return _service_error(error)
        return Response({"success": True, "data": FileAssetSerializer(asset).data})
