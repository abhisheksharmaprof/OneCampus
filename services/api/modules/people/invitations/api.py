from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle
from rest_framework.views import APIView

from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.people.models import StaffProfile

from .services import (
    InvitationRateLimited,
    InvitationUnavailable,
    deliver_issued_invitation,
    invitation_delivery_data,
    issue_staff_invitation,
    set_staff_password,
    validate_staff_invitation,
)


class StaffInvitationTokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=300, trim_whitespace=False)


class StaffPasswordSetupSerializer(StaffInvitationTokenSerializer):
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class StaffInvitationPublicThrottle(SimpleRateThrottle):
    rate = "20/minute"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": "staff-invitation", "ident": self.get_ident(request)}


def _unavailable_response():
    return Response(
        {
            "success": False,
            "error": {
                "code": "STAFF_INVITATION_INVALID",
                "message": "This invitation is invalid or no longer available.",
            },
        },
        status=status.HTTP_400_BAD_REQUEST,
    )


class StaffInvitationValidateView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (StaffInvitationPublicThrottle,)

    @extend_schema(request=StaffInvitationTokenSerializer)
    def post(self, request):
        serializer = StaffInvitationTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            invitation = validate_staff_invitation(serializer.validated_data["token"])
        except InvitationUnavailable:
            return _unavailable_response()
        return Response(
            {
                "success": True,
                "data": {"valid": True, "expiresAt": invitation.expires_at.isoformat()},
            }
        )


class StaffPasswordSetupView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (StaffInvitationPublicThrottle,)

    @extend_schema(request=StaffPasswordSetupSerializer)
    def post(self, request):
        serializer = StaffPasswordSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            set_staff_password(
                raw_token=serializer.validated_data["token"],
                password=serializer.validated_data["password"],
            )
        except InvitationUnavailable:
            return _unavailable_response()
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from None
        return Response({"success": True, "data": {"passwordSet": True}})


class StaffInvitationResendView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request, staff_id):
        profile = get_object_or_404(
            StaffProfile.objects.select_related("user", "institute"),
            pk=staff_id,
            institute=request.institute,
        )
        try:
            issued = issue_staff_invitation(
                staff_profile=profile,
                enforce_resend_limits=True,
            )
        except InvitationRateLimited:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "STAFF_INVITATION_RATE_LIMITED",
                        "message": "Please wait before sending another invitation.",
                    },
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except InvitationUnavailable:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "STAFF_INVITATION_NOT_PENDING",
                        "message": "This staff account no longer has a pending invitation.",
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )
        invitation = deliver_issued_invitation(issued)
        return Response(
            {
                "success": True,
                "data": {"inviteDelivery": invitation_delivery_data(invitation)},
            }
        )
