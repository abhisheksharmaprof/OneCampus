from rest_framework import serializers

from modules.identity.models import User

from ..models import Role, UserRoleAssignment


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError(
                {field: ["This field is not accepted."] for field in sorted(unknown)}
            )
        return super().to_internal_value(data)


class RoleSerializer(serializers.ModelSerializer):
    instituteId = serializers.UUIDField(source="institute_id", allow_null=True)
    branchId = serializers.UUIDField(source="branch_id", allow_null=True)
    isSystemRole = serializers.BooleanField(source="is_system_role")
    isActive = serializers.BooleanField(source="is_active")
    permissionCount = serializers.SerializerMethodField()
    userCount = serializers.SerializerMethodField()
    permissionGrants = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at")

    class Meta:
        model = Role
        fields = (
            "id",
            "instituteId",
            "branchId",
            "name",
            "description",
            "isSystemRole",
            "isActive",
            "permissionCount",
            "userCount",
            "permissionGrants",
            "createdAt",
        )

    def get_permissionCount(self, obj):
        value = getattr(obj, "permission_count", None)
        return value if value is not None else obj.permissions.filter(is_active=True).count()

    def get_userCount(self, obj):
        value = getattr(obj, "user_count", None)
        return value if value is not None else obj.user_assignments.filter(is_active=True).count()

    def get_permissionGrants(self, obj):
        grants = getattr(obj, "_prefetched_objects_cache", {}).get("permission_grants")
        if grants is None:
            grants = obj.permission_grants.select_related("permission").all()
        return [
            {
                "permissionKey": grant.permission.permission_key,
                "module": grant.permission.module,
                "description": grant.permission.description,
                "configuration": grant.configuration,
            }
            for grant in grants
            if grant.permission.is_active
        ]


class RoleWriteSerializer(StrictSerializer):
    name = serializers.CharField(min_length=2, max_length=100)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    branchId = serializers.UUIDField(required=False, allow_null=True)
    permissionKeys = serializers.ListField(
        child=serializers.CharField(max_length=100), allow_empty=True
    )
    permissionOptions = serializers.DictField(required=False, default=dict)

    def validate_permissionKeys(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Permission keys must not contain duplicates.")
        return value


class RoleUpdateSerializer(StrictSerializer):
    name = serializers.CharField(min_length=2, max_length=100, required=False)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    branchId = serializers.UUIDField(required=False, allow_null=True)
    permissionKeys = serializers.ListField(
        child=serializers.CharField(max_length=100), allow_empty=True, required=False
    )
    permissionOptions = serializers.DictField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError({"nonFieldErrors": ["Provide at least one field."]})
        if "permissionOptions" in attrs and "permissionKeys" not in attrs:
            raise serializers.ValidationError(
                {"permissionOptions": ["permissionKeys is required when changing options."]}
            )
        keys = attrs.get("permissionKeys")
        if keys is not None and len(keys) != len(set(keys)):
            raise serializers.ValidationError(
                {"permissionKeys": ["Permission keys must not contain duplicates."]}
            )
        return attrs


class RoleCloneSerializer(StrictSerializer):
    name = serializers.CharField(min_length=2, max_length=100)
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    branchId = serializers.UUIDField(required=False, allow_null=True)


class AssignmentSerializer(serializers.ModelSerializer):
    userId = serializers.UUIDField(source="user_id")
    userName = serializers.SerializerMethodField()
    roleId = serializers.UUIDField(source="role_id")
    roleName = serializers.CharField(source="role.name")
    instituteId = serializers.UUIDField(source="institute_id")
    branchId = serializers.UUIDField(source="branch_id", allow_null=True)
    assignedById = serializers.UUIDField(source="assigned_by_id", allow_null=True)
    assignedAt = serializers.DateTimeField(source="assigned_at")
    validFrom = serializers.DateTimeField(source="valid_from", allow_null=True)
    validUntil = serializers.DateTimeField(source="valid_until", allow_null=True)
    isActive = serializers.BooleanField(source="is_active")
    revokedAt = serializers.DateTimeField(source="revoked_at", allow_null=True)

    class Meta:
        model = UserRoleAssignment
        fields = (
            "id",
            "userId",
            "userName",
            "roleId",
            "roleName",
            "instituteId",
            "branchId",
            "assignedById",
            "assignedAt",
            "validFrom",
            "validUntil",
            "isActive",
            "revokedAt",
        )

    def get_userName(self, obj):
        return obj.user.get_full_name().strip() or obj.user.email


class UserOrStaffPkField(serializers.PrimaryKeyRelatedField):
    def to_internal_value(self, data):
        try:
            return super().to_internal_value(data)
        except serializers.ValidationError as exc:
            from modules.people.models import StaffProfile

            staff = StaffProfile.objects.filter(id=data).select_related("user").first()
            if staff and staff.user:
                return staff.user
            raise exc


class AssignmentCreateSerializer(StrictSerializer):
    userId = UserOrStaffPkField(source="user", queryset=User.objects.all())
    roleId = serializers.UUIDField()
    branchId = serializers.UUIDField(required=False, allow_null=True)
    validFrom = serializers.DateTimeField(required=False, allow_null=True)
    validUntil = serializers.DateTimeField(required=False, allow_null=True)

    def validate(self, attrs):
        valid_from = attrs.get("validFrom")
        valid_until = attrs.get("validUntil")
        if valid_from and valid_until and valid_until <= valid_from:
            raise serializers.ValidationError(
                {"validUntil": ["Expiry must be later than the validity start."]}
            )
        return attrs
