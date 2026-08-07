from django.db import transaction
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import MethodNotAllowed, NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from platform_core.api.pagination import paginate_admin_queryset

from .errors import ScreenHasDedicatedDomain, VersionConflict
from .models import AdminRecord
from .registry import SCREENS, get_screen
from .serializers import (
    AdminRecordCreateSerializer,
    AdminRecordDeleteSerializer,
    AdminRecordQuerySerializer,
    AdminRecordSerializer,
    AdminRecordUpdateSerializer,
)

ORDER_FIELDS = {
    "updatedAt": ("updated_at", "id"),
    "-updatedAt": ("-updated_at", "-id"),
    "createdAt": ("created_at", "id"),
    "-createdAt": ("-created_at", "-id"),
    "title": ("title", "id"),
    "-title": ("-title", "-id"),
    "status": ("status", "id"),
    "-status": ("-status", "-id"),
}


def generic_screen_or_404(screen_id, *, for_write=False):
    screen = get_screen(screen_id)
    if screen is None:
        raise NotFound("Admin screen not found.")
    if not screen.supports_records:
        raise ScreenHasDedicatedDomain()
    if for_write and screen.read_only:
        raise MethodNotAllowed("write", detail="This screen is read-only.")
    return screen


def branch_for_write(institute, branch_id):
    if branch_id is None:
        return None
    return get_object_or_404(
        Branch,
        id=branch_id,
        institute=institute,
        is_active=True,
    )


def active_record_or_404(request, screen_id, record_id):
    return get_object_or_404(
        AdminRecord.objects.select_related("branch", "created_by"),
        id=record_id,
        institute=request.institute,
        screen_id=screen_id,
        is_active=True,
    )


class ScreenCatalogView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        items = [screen.as_dict() for screen in SCREENS]
        return Response({"success": True, "data": {"count": len(items), "items": items}})


class ScreenDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request, screen_id):
        screen = generic_screen_or_404(screen_id)
        query = AdminRecordQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        params = query.validated_data

        records = AdminRecord.objects.filter(
            institute=request.institute,
            screen_id=screen.id,
            is_active=True,
        ).select_related("branch", "created_by")

        if "branchId" in params:
            branch = get_object_or_404(
                Branch,
                id=params["branchId"],
                institute=request.institute,
            )
            records = records.filter(branch=branch)
        if "status" in params:
            records = records.filter(status=params["status"])
        search = params["search"].strip()
        if search:
            records = records.filter(
                Q(title__icontains=search)
                | Q(record_type__icontains=search)
                | Q(status__icontains=search)
            )
        records = records.order_by(*ORDER_FIELDS[params["order"]])

        page = paginate_admin_queryset(
            request=request,
            queryset=records,
            serializer_class=AdminRecordSerializer,
        )
        return Response(
            {
                "success": True,
                "data": {"screen": screen.as_dict(), "records": page},
            }
        )


class AdminRecordCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(request=AdminRecordCreateSerializer, responses={201: AdminRecordSerializer})
    def post(self, request, screen_id):
        screen = generic_screen_or_404(screen_id, for_write=True)
        serializer = AdminRecordCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        branch = branch_for_write(request.institute, values.pop("branchId"))

        with transaction.atomic():
            record = AdminRecord.objects.create(
                institute=request.institute,
                branch=branch,
                screen_id=screen.id,
                record_type=values["recordType"],
                title=values["title"],
                status=values["status"],
                data=values["data"],
                created_by=request.user,
            )
        record = AdminRecord.objects.select_related("branch", "created_by").get(id=record.id)
        return Response(
            {"success": True, "data": AdminRecordSerializer(record).data},
            status=status.HTTP_201_CREATED,
        )


class AdminRecordDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={200: AdminRecordSerializer})
    def get(self, request, screen_id, record_id):
        screen = generic_screen_or_404(screen_id)
        record = active_record_or_404(request, screen.id, record_id)
        return Response({"success": True, "data": AdminRecordSerializer(record).data})

    @extend_schema(request=AdminRecordUpdateSerializer, responses={200: AdminRecordSerializer})
    def patch(self, request, screen_id, record_id):
        screen = generic_screen_or_404(screen_id, for_write=True)
        record = active_record_or_404(request, screen.id, record_id)
        serializer = AdminRecordUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        expected_version = values.pop("version")

        updates = {"updated_at": timezone.now(), "version": F("version") + 1}
        field_map = {
            "recordType": "record_type",
            "title": "title",
            "status": "status",
            "data": "data",
        }
        for input_name, model_name in field_map.items():
            if input_name in values:
                updates[model_name] = values[input_name]
        if "branchId" in values:
            updates["branch"] = branch_for_write(
                request.institute,
                values["branchId"],
            )

        with transaction.atomic():
            changed = AdminRecord.objects.filter(
                id=record.id,
                institute=request.institute,
                screen_id=screen.id,
                is_active=True,
                version=expected_version,
            ).update(**updates)
        if changed != 1:
            raise VersionConflict()

        record.refresh_from_db()
        return Response({"success": True, "data": AdminRecordSerializer(record).data})

    @extend_schema(request=AdminRecordDeleteSerializer, responses={204: None})
    def delete(self, request, screen_id, record_id):
        screen = generic_screen_or_404(screen_id, for_write=True)
        record = active_record_or_404(request, screen.id, record_id)
        payload = request.data
        if not payload and request.headers.get("If-Match"):
            value = request.headers["If-Match"].strip().removeprefix("W/").strip('"')
            payload = {"version": value}
        serializer = AdminRecordDeleteSerializer(data=payload)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            changed = AdminRecord.objects.filter(
                id=record.id,
                institute=request.institute,
                screen_id=screen.id,
                is_active=True,
                version=serializer.validated_data["version"],
            ).update(
                is_active=False,
                version=F("version") + 1,
                updated_at=timezone.now(),
            )
        if changed != 1:
            raise VersionConflict()
        return Response(status=status.HTTP_204_NO_CONTENT)
