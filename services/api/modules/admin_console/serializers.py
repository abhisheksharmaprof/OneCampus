import json

from rest_framework import serializers

from modules.institutes.models import Branch

from .models import AdminRecord


class StrictSerializer(serializers.Serializer):
    """Reject misspelled input instead of silently discarding it."""

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            unknown = set(data.keys()) - set(self.fields)
            if unknown:
                raise serializers.ValidationError(
                    {field: ["Unknown field."] for field in sorted(unknown)}
                )
        return super().to_internal_value(data)


class BranchSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ("id", "name", "code")


class CreatedBySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)


class AdminRecordSerializer(serializers.ModelSerializer):
    screenId = serializers.CharField(source="screen_id", read_only=True)
    recordType = serializers.CharField(source="record_type", read_only=True)
    branchId = serializers.UUIDField(source="branch_id", read_only=True, allow_null=True)
    branch = BranchSummarySerializer(read_only=True)
    createdBy = CreatedBySerializer(source="created_by", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    isActive = serializers.BooleanField(source="is_active", read_only=True)

    class Meta:
        model = AdminRecord
        fields = (
            "id",
            "screenId",
            "recordType",
            "title",
            "status",
            "data",
            "branchId",
            "branch",
            "createdBy",
            "createdAt",
            "updatedAt",
            "version",
            "isActive",
        )


class RecordFieldsMixin(StrictSerializer):
    recordType = serializers.RegexField(
        r"^[A-Za-z0-9][A-Za-z0-9_.-]*$", max_length=64, trim_whitespace=True
    )
    title = serializers.CharField(max_length=240, trim_whitespace=True)
    status = serializers.RegexField(
        r"^[A-Za-z0-9][A-Za-z0-9_.-]*$", max_length=64, trim_whitespace=True
    )
    data = serializers.JSONField()
    branchId = serializers.UUIDField(allow_null=True)

    def validate_data(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Data must be a JSON object.")
        if len(value) > 100:
            raise serializers.ValidationError("Data cannot contain more than 100 fields.")
        if len(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")) > 65536:
            raise serializers.ValidationError("Data cannot exceed 64 KB.")
        return value


class AdminRecordCreateSerializer(RecordFieldsMixin):
    data = serializers.JSONField(required=False, default=dict)
    branchId = serializers.UUIDField(required=False, allow_null=True, default=None)


class AdminRecordUpdateSerializer(RecordFieldsMixin):
    recordType = serializers.RegexField(
        r"^[A-Za-z0-9][A-Za-z0-9_.-]*$",
        max_length=64,
        trim_whitespace=True,
        required=False,
    )
    title = serializers.CharField(max_length=240, trim_whitespace=True, required=False)
    status = serializers.RegexField(
        r"^[A-Za-z0-9][A-Za-z0-9_.-]*$",
        max_length=64,
        trim_whitespace=True,
        required=False,
    )
    data = serializers.JSONField(required=False)
    branchId = serializers.UUIDField(required=False, allow_null=True)
    version = serializers.IntegerField(min_value=1, required=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if set(attrs) == {"version"}:
            raise serializers.ValidationError("At least one record field must be supplied.")
        return attrs


class AdminRecordDeleteSerializer(StrictSerializer):
    version = serializers.IntegerField(min_value=1)


class AdminRecordQuerySerializer(StrictSerializer):
    page = serializers.IntegerField(min_value=1, required=False, default=1)
    pageSize = serializers.IntegerField(min_value=1, max_value=100, required=False, default=25)
    search = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    status = serializers.CharField(max_length=64, required=False, allow_blank=False)
    branchId = serializers.UUIDField(required=False)
    order = serializers.ChoiceField(
        choices=(
            "updatedAt",
            "-updatedAt",
            "createdAt",
            "-createdAt",
            "title",
            "-title",
            "status",
            "-status",
        ),
        required=False,
        default="-updatedAt",
    )
