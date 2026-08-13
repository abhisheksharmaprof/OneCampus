from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
import logging
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
from modules.institutes.models import Institute, InstituteMembership
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
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
)

logger = logging.getLogger(__name__)


def deliver_otp_code(*, user, code):
    """Delivery boundary patched by tests and replaceable by a future provider adapter."""
    send_mail(
        subject="Your CampusOne verification code",
        message=f"Your CampusOne verification code is {code}. It expires in 5 minutes.",
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def deliver_password_reset(*, user, reset_url):
    logger.info(
        "password-reset smtp-send-start recipient=%s host=%s port=%s user=%s from=%s",
        _masked_email(user.email), settings.EMAIL_HOST, settings.EMAIL_PORT,
        settings.EMAIL_HOST_USER, settings.DEFAULT_FROM_EMAIL,
    )
    try:
        sent = send_mail(
            subject="Reset your CampusOne password",
            message=(
                "Use this link to choose a new CampusOne password:\n\n"
                f"{reset_url}\n\nThis link expires in 24 hours."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:
        logger.exception("password-reset smtp-send-failed recipient=%s", _masked_email(user.email))
        raise
    logger.info("password-reset smtp-send-success recipient=%s messages=%s", _masked_email(user.email), sent)


class PasswordResetRequestView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (DynamicScopedRateThrottle,)
    throttle_scope = "password-reset"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        requested_email = serializer.validated_data["email"].lower()
        User = get_user_model()
        now = timezone.now()
        matching_user = User.objects.filter(email__iexact=requested_email).first()
        active_user = User.objects.filter(email__iexact=requested_email, is_active=True).first()
        admin_membership = InstituteMembership.objects.filter(
            user__email__iexact=requested_email,
            user__is_active=True,
            is_active=True,
            institute__is_active=True,
            role__in=(InstituteMembership.Role.INSTITUTE_ADMIN, InstituteMembership.Role.BRANCH_ADMIN),
        ).filter(Q(valid_until__isnull=True) | Q(valid_until__gt=now)).first()
        user = active_user if admin_membership else None
        logger.info(
            "password-reset request email=%s user_exists=%s user_active=%s admin_membership=%s account_found=%s frontend_url=%s",
            _masked_email(requested_email), bool(matching_user), bool(active_user),
            bool(admin_membership), bool(user), settings.PASSWORD_RESET_URL,
        )
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_base = settings.PASSWORD_RESET_URL.rstrip("/")
            deliver_password_reset(user=user, reset_url=f"{reset_base}?uid={uid}&token={token}")
        return Response({"success": True, "data": {"message": "If an account exists for that email, a reset link has been sent."}})


class PasswordResetConfirmView(APIView):
    permission_classes = (AllowAny,)
    authentication_classes = ()
    throttle_classes = (DynamicScopedRateThrottle,)
    throttle_scope = "password-reset"

    def post(self, request):
        uid = str(request.data.get("uid", ""))
        try:
            from django.utils.http import urlsafe_base64_decode
            user_id = urlsafe_base64_decode(uid).decode()
            user = get_user_model().objects.get(pk=user_id, is_active=True)
        except (TypeError, ValueError, OverflowError, get_user_model().DoesNotExist):
            return Response({"success": False, "error": {"code": "RESET_LINK_INVALID", "message": "This password reset link is invalid or expired."}}, status=status.HTTP_400_BAD_REQUEST)
        if not default_token_generator.check_token(user, request.data.get("token", "")):
            return Response({"success": False, "error": {"code": "RESET_LINK_INVALID", "message": "This password reset link is invalid or expired."}}, status=status.HTTP_400_BAD_REQUEST)
        serializer = PasswordResetConfirmSerializer(data=request.data, context={"user": user})
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=("password", "updated_at"))
        return Response({"success": True, "data": {"message": "Your password has been reset. You can now sign in."}})


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
