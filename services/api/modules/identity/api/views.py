from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from modules.identity.models import OtpChallenge
from modules.institutes.models import Institute
from modules.identity.services import (
    eligible_session_memberships,
    issue_session_tokens,
    resolve_session_context,
)
from platform_core.api.throttles import DynamicScopedRateThrottle

from .errors import SessionContextInactive
from .serializers import (
    OtpChallengeSerializer,
    OtpResendSerializer,
    SessionCreateSerializer,
    SessionCurrentSuccessSerializer,
    SessionLogoutSerializer,
    SessionLogoutSuccessSerializer,
    SessionRefreshSerializer,
    SessionSuccessSerializer,
)


def deliver_otp_code(*, user, code):
    """Delivery boundary patched by tests and replaceable by a future provider adapter."""
    send_mail(
        subject="Your CampusOne verification code",
        message=f"Your CampusOne verification code is {code}. It expires in 5 minutes.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def _masked_email(email):
    local, domain = email.rsplit("@", 1)
    visible = local[:1]
    return f"{visible}{'*' * max(3, len(local) - 1)}@{domain}"


def _challenge_details(challenge):
    return {
        "challengeId": str(challenge.id),
        "expiresAt": challenge.expires_at.isoformat(),
        "destination": _masked_email(challenge.user.email),
    }


def _with_onboarding_state(session_data, institute_id):
    """Keep pending/declined institutes out of the administrative shell on every login."""
    if not institute_id:
        return session_data
    institute = Institute.objects.filter(id=institute_id).only(
        "onboarding_status", "display_name", "name", "rejection_reason", "slug"
    ).first()
    if institute and institute.onboarding_status != Institute.OnboardingStatus.APPROVED:
        session_data["onboarding"] = {
            "completed": False,
            "status": institute.onboarding_status,
            "instituteName": institute.display_name or institute.name,
            "slug": institute.slug,
            "publicUrl": f"https://{institute.slug}.arkailabs.com" if institute.slug else None,
            "rejectionReason": institute.rejection_reason,
        }
    return session_data


def _otp_error(code, message, *, http_status, details=None):
    error = {"code": code, "message": message}
    if details:
        error["details"] = details
    return Response({"success": False, "error": error}, status=http_status)


def _issue_challenge(*, user, client, institute_id=None):
    with transaction.atomic():
        now = timezone.now()
        # Use select_for_update() to prevent concurrent OTP issuance from
        # creating multiple valid challenges for the same (user, client).
        OtpChallenge.objects.select_for_update().filter(
            user=user,
            client=client,
            consumed_at__isnull=True,
        ).update(consumed_at=now)
        challenge, code = OtpChallenge.issue(
            user=user,
            client=client,
            institute_id=institute_id,
        )
        deliver_otp_code(user=user, code=code)
    return challenge


class SessionCreateView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (DynamicScopedRateThrottle,)
    throttle_scope = "identity-login"

    @extend_schema(
        request=SessionCreateSerializer,
        responses={status.HTTP_200_OK: SessionSuccessSerializer},
    )
    def post(self, request):
        serializer = SessionCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        client = serializer.validated_data["client"]
        institute_id = serializer.validated_data.get("instituteId")

        if client == "platform-admin":
            context = resolve_session_context(user=user, client=client)
            if context is None:
                return Response({"success": False, "error": {"code": "ROLE_NOT_ALLOWED_FOR_CLIENT", "message": "This account cannot sign in to the platform console."}}, status=status.HTTP_403_FORBIDDEN)
            return Response({"success": True, "data": issue_session_tokens(user=user, context=context, client=client)})

        eligible = eligible_session_memberships(user=user, client=client)
        institutes = {membership.institute_id: membership.institute for membership in eligible}
        if len(institutes) > 1 and institute_id is None:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "INSTITUTE_SELECTION_REQUIRED",
                        "message": "Select the institute you want to access.",
                        "details": {
                            "institutes": [
                                {"id": str(institute.id), "name": institute.name}
                                for institute in sorted(
                                    institutes.values(), key=lambda item: item.name
                                )
                            ]
                        },
                    },
                },
                status=status.HTTP_409_CONFLICT,
            )

        context = resolve_session_context(user=user, client=client, institute_id=institute_id)
        if context is None:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "ROLE_NOT_ALLOWED_FOR_CLIENT",
                        "message": "This account cannot sign in to this application.",
                    },
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if user.otp_required:
            challenge = _issue_challenge(
                user=user,
                client=client,
                institute_id=context.membership.institute_id,
            )
            return _otp_error(
                "OTP_REQUIRED",
                "Enter the verification code sent to your email.",
                http_status=status.HTTP_409_CONFLICT,
                details=_challenge_details(challenge),
            )

        return Response(
            {
                "success": True,
                "data": _with_onboarding_state(
                    issue_session_tokens(user=user, context=context, client=client),
                    context.membership.institute_id,
                ),
            }
        )


class SessionOtpVerifyView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (DynamicScopedRateThrottle,)
    throttle_scope = "identity-login"

    @extend_schema(
        request=OtpChallengeSerializer,
        responses={status.HTTP_200_OK: SessionSuccessSerializer},
    )
    def post(self, request):
        serializer = OtpChallengeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            challenge = (
                OtpChallenge.objects.select_for_update()
                .select_related("user")
                .filter(id=serializer.validated_data["challengeId"])
                .first()
            )
            if challenge is None:
                return _otp_error(
                    "OTP_CHALLENGE_INVALID",
                    "This verification request is invalid.",
                    http_status=status.HTTP_400_BAD_REQUEST,
                )
            if challenge.consumed_at is not None:
                return _otp_error(
                    "OTP_CHALLENGE_CONSUMED",
                    "This verification code has already been used.",
                    http_status=status.HTTP_409_CONFLICT,
                )
            if challenge.is_expired:
                return _otp_error(
                    "OTP_CHALLENGE_EXPIRED",
                    "This verification code has expired. Request a new code.",
                    http_status=status.HTTP_410_GONE,
                )
            if challenge.attempts_exhausted:
                return _otp_error(
                    "OTP_ATTEMPTS_EXCEEDED",
                    "Too many incorrect attempts. Request a new code.",
                    http_status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            if not challenge.code_matches(serializer.validated_data["code"]):
                challenge.attempts += 1
                challenge.save(update_fields=("attempts",))
                remaining = challenge.max_attempts - challenge.attempts
                if remaining == 0:
                    return _otp_error(
                        "OTP_ATTEMPTS_EXCEEDED",
                        "Too many incorrect attempts. Request a new code.",
                        http_status=status.HTTP_429_TOO_MANY_REQUESTS,
                    )
                return _otp_error(
                    "OTP_INVALID_CODE",
                    "The verification code is incorrect.",
                    http_status=status.HTTP_400_BAD_REQUEST,
                    details={"attemptsRemaining": remaining},
                )

            user = challenge.user
            context = (
                resolve_session_context(
                    user=user,
                    client=challenge.client,
                    institute_id=challenge.institute_id,
                )
                if user.is_active
                else None
            )
            if context is None:
                return _otp_error(
                    "SESSION_CONTEXT_INACTIVE",
                    "This account can no longer sign in to this application.",
                    http_status=status.HTTP_403_FORBIDDEN,
                )
            challenge.consumed_at = timezone.now()
            challenge.save(update_fields=("consumed_at",))
            session_data = _with_onboarding_state(
                issue_session_tokens(user=user, context=context, client=challenge.client),
                context.membership.institute_id,
            )

        return Response({"success": True, "data": session_data})


class SessionOtpResendView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (DynamicScopedRateThrottle,)
    throttle_scope = "identity-login"

    @extend_schema(request=OtpResendSerializer)
    def post(self, request):
        serializer = OtpResendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            challenge = (
                OtpChallenge.objects.select_for_update()
                .select_related("user")
                .filter(id=serializer.validated_data["challengeId"])
                .first()
            )
            if challenge is None or challenge.consumed_at is not None:
                return _otp_error(
                    "OTP_CHALLENGE_INVALID",
                    "This verification request is no longer active.",
                    http_status=status.HTTP_409_CONFLICT,
                )
            if not challenge.user.is_active or not challenge.user.otp_required:
                return _otp_error(
                    "OTP_CHALLENGE_INVALID",
                    "This verification request is no longer active.",
                    http_status=status.HTTP_409_CONFLICT,
                )
            replacement = _issue_challenge(
                user=challenge.user,
                client=challenge.client,
                institute_id=challenge.institute_id,
            )

        return Response({"success": True, "data": _challenge_details(replacement)})


class SessionRefreshView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = (JWTAuthentication,)
    throttle_classes = (DynamicScopedRateThrottle,)
    throttle_scope = "identity-refresh"

    @extend_schema(
        request=SessionRefreshSerializer,
        responses={status.HTTP_200_OK: SessionSuccessSerializer},
    )
    def post(self, request):
        request_serializer = SessionRefreshSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        raw_refresh = request_serializer.validated_data["refreshToken"]
        try:
            refresh = RefreshToken(raw_refresh)
        except TokenError as exc:
            raise AuthenticationFailed("Refresh token is invalid or expired.") from exc

        user = get_user_model().objects.filter(id=refresh.get("user_id"), is_active=True).first()
        context = (
            resolve_session_context(
                user=user,
                client=refresh.get("client"),
                membership_id=refresh.get("membership_id"),
            )
            if user and refresh.get("client") and (refresh.get("membership_id") or refresh.get("client") == "platform-admin")
            else None
        )
        if context is None:
            raise SessionContextInactive()

        token_serializer = TokenRefreshSerializer(data={"refresh": raw_refresh})
        token_serializer.is_valid(raise_exception=True)
        tokens = token_serializer.validated_data
        return Response(
            {
                "success": True,
                "data": {
                    "accessToken": tokens["access"],
                    "refreshToken": tokens.get("refresh", raw_refresh),
                    "user": context.profile,
                },
            }
        )


class SessionCurrentView(APIView):
    @extend_schema(responses={status.HTTP_200_OK: SessionCurrentSuccessSerializer})
    def get(self, request):
        if request.auth.get("client") == "platform-admin":
            context = resolve_session_context(user=request.user, client="platform-admin")
            if context is None:
                raise SessionContextInactive()
            return Response({"success": True, "data": {"user": context.profile}})
        if not request.auth.get("client") or not request.auth.get("membership_id"):
            raise SessionContextInactive()
        context = resolve_session_context(
            user=request.user,
            client=request.auth.get("client"),
            membership_id=request.auth.get("membership_id"),
        )
        if context is None:
            raise SessionContextInactive()
        return Response({"success": True, "data": {"user": context.profile}})

    @extend_schema(
        request=SessionLogoutSerializer,
        responses={status.HTTP_200_OK: SessionLogoutSuccessSerializer},
    )
    def delete(self, request):
        serializer = SessionLogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            refresh = RefreshToken(serializer.validated_data["refreshToken"])
        except TokenError as exc:
            raise AuthenticationFailed("Refresh token is invalid or expired.") from exc
        if str(refresh.get("user_id")) != str(request.user.id):
            raise AuthenticationFailed("Refresh token does not belong to this session.")
        refresh.blacklist()
        return Response({"success": True, "data": {"signedOut": True}})
