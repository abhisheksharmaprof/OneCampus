import re

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db.models import Q
from rest_framework import serializers


class SessionCreateSerializer(serializers.Serializer):
    identifier = serializers.CharField(required=False, allow_blank=False, trim_whitespace=True)
    email = serializers.EmailField(required=False)
    password = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False, write_only=True)
    client = serializers.ChoiceField(choices=("admin-web", "parent-mobile", "staff-mobile", "platform-admin"))
    instituteId = serializers.UUIDField(required=False)

    def validate(self, attrs):
        identifier = (attrs.get("identifier") or attrs.get("email") or "").strip()
        if not identifier:
            raise serializers.ValidationError({"identifier": ["Enter your registered email or mobile number."]})
        User = get_user_model()
        if "@" in identifier:
            lookup = Q(email__iexact=identifier)
        else:
            normalized_phone = re.sub(r"\D", "", identifier)
            lookup = Q(phone=identifier)
            if normalized_phone:
                lookup |= (
                    Q(phone=normalized_phone)
                    | Q(phone=f"+{normalized_phone}")
                    | Q(phone__endswith=normalized_phone)
                )
        user = User.objects.filter(lookup).first()
        if user is None:
            raise serializers.ValidationError({"identifier": ["This user is not registered. Please use your registered email or mobile number."]})
        pending_account = not user.is_active and not user.has_usable_password()
        if not pending_account:
            user = authenticate(request=self.context.get("request"), email=user.email, password=attrs.get("password", ""))
            if user is None or not user.is_active:
                raise serializers.ValidationError({"credentials": ["Email/mobile or password is incorrect."]})
        attrs["user"] = user
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirmPassword = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        if attrs["password"] != attrs["confirmPassword"]:
            raise serializers.ValidationError({"confirmPassword": ["Passwords do not match."]})
        user = self.context.get("user")
        validate_password(attrs["password"], user=user)
        return attrs


class PasswordSetupSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    confirmPassword = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        if attrs["password"] != attrs["confirmPassword"]:
            raise serializers.ValidationError({"confirmPassword": ["Passwords do not match."]})
        validate_password(attrs["password"], user=self.context.get("user"))
        return attrs


class OtpChallengeSerializer(serializers.Serializer):
    challengeId = serializers.UUIDField()
    code = serializers.RegexField(r"^\d{6}$", trim_whitespace=True)


class OtpResendSerializer(serializers.Serializer):
    challengeId = serializers.UUIDField()


class SessionUserSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    displayName = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())
    activeRole = serializers.CharField()
    instituteId = serializers.UUIDField(allow_null=True)
    branchIds = serializers.ListField(child=serializers.UUIDField())


class SessionDataSerializer(serializers.Serializer):
    accessToken = serializers.CharField()
    refreshToken = serializers.CharField()
    user = SessionUserSerializer()


class SessionSuccessSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = SessionDataSerializer()


class SessionRefreshSerializer(serializers.Serializer):
    refreshToken = serializers.CharField(trim_whitespace=False, write_only=True)


class SessionCurrentDataSerializer(serializers.Serializer):
    user = SessionUserSerializer()


class SessionCurrentSuccessSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = SessionCurrentDataSerializer()


class SessionLogoutSerializer(serializers.Serializer):
    refreshToken = serializers.CharField(trim_whitespace=False, write_only=True)


class SessionLogoutSuccessSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = serializers.DictField()


class AccountProfileSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    firstName = serializers.CharField(source="first_name", allow_blank=True)
    lastName = serializers.CharField(source="last_name", allow_blank=True)
    displayName = serializers.CharField()
    phone = serializers.CharField(allow_blank=True)
    twoFactorEnabled = serializers.BooleanField(source="otp_required")
    userType = serializers.CharField(source="user_type", allow_blank=True)
    activeRole = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())
    instituteId = serializers.UUIDField(allow_null=True)
    branchIds = serializers.ListField(child=serializers.UUIDField())
    permissions = serializers.ListField(child=serializers.CharField(), required=False)


class AccountUpdateSerializer(serializers.Serializer):
    firstName = serializers.CharField(required=False, allow_blank=True, max_length=150)
    lastName = serializers.CharField(required=False, allow_blank=True, max_length=150)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    currentPassword = serializers.CharField(required=False, allow_blank=True, write_only=True)
    newPassword = serializers.CharField(required=False, allow_blank=True, write_only=True)
    confirmPassword = serializers.CharField(required=False, allow_blank=True, write_only=True)
    twoFactorEnabled = serializers.BooleanField(required=False)

    def validate(self, attrs):
        user = self.context.get("user")
        new_password = attrs.get("newPassword")
        current_password = attrs.get("currentPassword")
        confirm_password = attrs.get("confirmPassword")

        if new_password:
            if not current_password:
                raise serializers.ValidationError({"currentPassword": ["Current password is required to set a new password."]})
            if not user or not user.check_password(current_password):
                raise serializers.ValidationError({"currentPassword": ["Current password is incorrect."]})
            if new_password != confirm_password:
                raise serializers.ValidationError({"confirmPassword": ["Passwords do not match."]})
            validate_password(new_password, user=user)

        return attrs

