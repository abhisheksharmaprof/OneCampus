from django.db import transaction
from django.shortcuts import get_object_or_404
from secrets import token_hex

from django.utils.text import slugify
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.institutes.models import Branch, Institute
from platform_core.models import AuditEvent
from .admin_serializers import InstituteSerializer, short_branch_code


def is_platform_admin(user):
    return bool(user and user.is_authenticated and (user.is_superuser or user.user_type == "platform_admin"))


class IsPlatformAdmin(BasePermission):
    message = "A platform administrator session is required."

    def has_permission(self, request, view):
        return is_platform_admin(request.user) and request.auth and request.auth.get("client") == "platform-admin"


class PlatformRegistrationListView(APIView):
    permission_classes = (IsPlatformAdmin,)

    def get(self, request):
        qs = Institute.objects.filter(onboarding_status=Institute.OnboardingStatus.PENDING_REVIEW).order_by("created_at")
        return Response({"success": True, "data": {"items": [InstituteSerializer(item).data for item in qs], "count": qs.count()}})


class PlatformInstituteListView(APIView):
    permission_classes = (IsPlatformAdmin,)

    def get(self, request):
        qs = Institute.objects.all().order_by("name")
        return Response({"success": True, "data": {"items": [InstituteSerializer(item).data for item in qs], "count": qs.count()}})

    @transaction.atomic
    def post(self, request):
        serializer = PlatformInstituteCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        institute = serializer.save(actor=request.user)
        AuditEvent.objects.create(
            institute=institute,
            actor=request.user,
            event_type="PLATFORM_INSTITUTE_CREATED",
            message=f"Platform administrator created {institute.name}.",
            metadata={"slug": institute.slug},
        )
        return Response({"success": True, "data": InstituteSerializer(institute).data}, status=status.HTTP_201_CREATED)


class PlatformInstituteCreateSerializer(serializers.Serializer):
    legalName = serializers.CharField(min_length=2, max_length=200)
    displayName = serializers.CharField(min_length=2, max_length=200, required=False, allow_blank=True)
    slug = serializers.RegexField(r"^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$")
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)

    def validate_slug(self, value):
        value = slugify(value)
        if Institute.objects.filter(slug__iexact=value).exists():
            raise serializers.ValidationError("This URL name is already taken.")
        if value in {"admin", "api", "app", "auth", "help", "support", "www", "platform"}:
            raise serializers.ValidationError("This URL name is reserved.")
        return value

    def create(self, validated_data):
        actor = validated_data.pop("actor", None)
        legal_name = validated_data["legalName"]
        display_name = validated_data.get("displayName") or legal_name
        slug = validated_data["slug"]
        code_prefix = slugify(legal_name).upper()[:19] or "INSTITUTE"
        institute = Institute.objects.create(
            name=legal_name,
            display_name=display_name,
            slug=slug,
            code=f"{code_prefix}-{token_hex(6).upper()}",
            city=validated_data.get("city", ""),
            state=validated_data.get("state", ""),
            onboarding_status=Institute.OnboardingStatus.APPROVED,
            approved_at=timezone.now(),
            approved_by=actor,
        )
        Branch.objects.create(
            institute=institute,
            name=display_name,
            code=short_branch_code(display_name, institute),
            is_head_office=True,
            city=institute.city,
            state=institute.state,
        )
        return institute


class PlatformRegistrationApproveView(APIView):
    permission_classes = (IsPlatformAdmin,)

    @transaction.atomic
    def post(self, request, institute_id):
        institute = get_object_or_404(Institute.objects.select_for_update(), id=institute_id)
        if institute.onboarding_status != Institute.OnboardingStatus.PENDING_REVIEW:
            return Response({"success": False, "error": {"code": "INVALID_STATUS", "message": "Only pending registrations can be approved."}}, status=status.HTTP_409_CONFLICT)
        institute.onboarding_status = Institute.OnboardingStatus.APPROVED
        institute.is_active = True
        institute.approved_at = timezone.now()
        institute.approved_by = request.user
        institute.rejection_reason = ""
        institute.save(update_fields=("onboarding_status", "is_active", "approved_at", "approved_by", "rejection_reason", "updated_at"))
        Branch.objects.get_or_create(
            institute=institute,
            is_head_office=True,
            defaults={"name": institute.display_name or institute.name, "code": short_branch_code(institute.display_name or institute.name, institute)},
        )
        AuditEvent.objects.create(institute=institute, actor=request.user, event_type="PLATFORM_INSTITUTE_APPROVED", message=f"Platform administrator approved {institute.name}.", metadata={"slug": institute.slug})
        return Response({"success": True, "data": InstituteSerializer(institute).data})


class PlatformRegistrationRejectView(APIView):
    permission_classes = (IsPlatformAdmin,)

    @transaction.atomic
    def post(self, request, institute_id):
        institute = get_object_or_404(Institute.objects.select_for_update(), id=institute_id)
        reason = str(request.data.get("reason", "Application requires changes.")).strip()[:500]
        institute.onboarding_status = Institute.OnboardingStatus.DECLINED
        institute.rejection_reason = reason or "Application requires changes."
        institute.save(update_fields=("onboarding_status", "rejection_reason", "updated_at"))
        AuditEvent.objects.create(institute=institute, actor=request.user, event_type="PLATFORM_INSTITUTE_REJECTED", message=f"Platform administrator rejected {institute.name}.", metadata={"reason": reason, "slug": institute.slug})
        return Response({"success": True, "data": InstituteSerializer(institute).data})


class PublicInstituteConfigView(APIView):
    permission_classes = ()
    authentication_classes = ()

    def get(self, request, slug):
        institute = get_object_or_404(Institute, slug__iexact=slug)
        return Response({"success": True, "data": {"slug": institute.slug, "name": institute.display_name or institute.name, "logoUrl": institute.logo_url, "brandColor": institute.brand_color, "status": institute.onboarding_status, "publicUrl": f"https://{institute.slug}.arkailabs.com"}})
