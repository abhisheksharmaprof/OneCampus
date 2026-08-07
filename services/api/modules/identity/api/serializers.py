from django.contrib.auth import authenticate
from rest_framework import serializers


class SessionCreateSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(trim_whitespace=False, write_only=True)
    client = serializers.ChoiceField(choices=("admin-web", "parent-mobile", "staff-mobile", "platform-admin"))
    instituteId = serializers.UUIDField(required=False)

    def validate(self, attrs):
        user = authenticate(
            request=self.context.get("request"),
            email=attrs["email"].lower(),
            password=attrs["password"],
        )
        if user is None or not user.is_active:
            raise serializers.ValidationError({"credentials": ["Email or password is incorrect."]})
        attrs["user"] = user
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
