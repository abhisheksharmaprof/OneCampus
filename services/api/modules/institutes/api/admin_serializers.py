from secrets import token_hex
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils.text import slugify
from rest_framework import serializers

from modules.institutes.models import Branch, Institute, InstituteAssociation, InstituteMembership


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError(
                {field: ["This field is not accepted."] for field in sorted(unknown)}
            )
        return super().to_internal_value(data)


def short_branch_code(name, institute):
    """Return a readable, unique 3–4 character branch code."""
    words = re.findall(r"[A-Za-z0-9]+", name.upper())
    initials = "".join(word[0] for word in words)
    compact = "".join(words)
    base = (initials if len(initials) >= 3 else compact)[:4]
    base = (base + "XXX")[:4]
    if len(base) < 3:
        base = (base + "XXX")[:3]
    if base == "MAIN":
        base = "MCA"
    code = base
    suffix = 0
    while Branch.objects.filter(institute=institute, code=code).exists():
        suffix += 1
        code = f"{base[:3]}{suffix % 10}"
    return code


class TimezoneField(serializers.CharField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise serializers.ValidationError("Enter a valid IANA timezone.") from exc
        return value


class InstituteSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(read_only=True)
    publicUrl = serializers.SerializerMethodField()
    logoUrl = serializers.URLField(source="logo_url", allow_blank=True)
    brandColor = serializers.CharField(source="brand_color")
    isActive = serializers.BooleanField(source="is_active")
    legalName = serializers.CharField(source="name")
    displayName = serializers.CharField(source="display_name")
    instituteType = serializers.CharField(source="institute_type")
    boardAffiliation = serializers.CharField(source="board_affiliation")
    boardAffiliationNo = serializers.CharField(source="board_affiliation_number")
    udiseCode = serializers.CharField(source="udise_code")
    estYear = serializers.IntegerField(source="establishment_year", allow_null=True)
    medium = serializers.CharField(source="medium_of_instruction")
    entityType = serializers.CharField(source="registered_entity_type")
    registrationNo = serializers.CharField(source="registration_number")
    panNo = serializers.CharField(source="pan_number")
    gstNo = serializers.CharField(source="gst_number")
    postalCode = serializers.CharField(source="postal_code")
    country = serializers.CharField()
    primaryEmail = serializers.EmailField(source="primary_email")
    primaryPhone = serializers.CharField(source="primary_phone")
    alternatePhone = serializers.CharField(source="alternate_phone")
    websiteUrl = serializers.URLField(source="website_url", allow_blank=True)
    contactName = serializers.CharField(source="contact_name")
    contactDesignation = serializers.CharField(source="contact_designation")
    contactPhone = serializers.CharField(source="contact_phone")
    contactEmail = serializers.EmailField(source="contact_email", allow_blank=True)

    def get_publicUrl(self, obj):
        return f"https://{obj.slug}.arkailabs.com" if obj.slug else None

    class Meta:
        model = Institute
        fields = ("id", "name", "slug", "publicUrl", "logoUrl", "brandColor", "code", "isActive", "legalName", "displayName", "instituteType", "boardAffiliation", "boardAffiliationNo", "udiseCode", "estYear", "medium", "entityType", "registrationNo", "panNo", "gstNo", "address_line_1", "address_line_2", "city", "state", "postalCode", "country", "primaryEmail", "primaryPhone", "alternatePhone", "websiteUrl", "contactName", "contactDesignation", "contactPhone", "contactEmail")


class InstituteUpdateSerializer(StrictSerializer):
    logoUrl = serializers.URLField(source="logo_url", required=False, allow_blank=True)
    brandColor = serializers.RegexField(r"^#[0-9A-Fa-f]{6}$", source="brand_color", required=False)
    name = serializers.CharField(min_length=2, max_length=200, required=False)
    legalName = serializers.CharField(source="name", min_length=2, max_length=200, required=False)
    displayName = serializers.CharField(source="display_name", max_length=200, required=False, allow_blank=True)
    instituteType = serializers.CharField(source="institute_type", max_length=40, required=False)
    boardAffiliation = serializers.CharField(source="board_affiliation", max_length=80, required=False, allow_blank=True)
    boardAffiliationNo = serializers.CharField(source="board_affiliation_number", max_length=100, required=False, allow_blank=True)
    udiseCode = serializers.CharField(source="udise_code", max_length=50, required=False, allow_blank=True)
    estYear = serializers.IntegerField(source="establishment_year", required=False, allow_null=True)
    medium = serializers.CharField(source="medium_of_instruction", max_length=100, required=False)
    entityType = serializers.CharField(source="registered_entity_type", max_length=80, required=False, allow_blank=True)
    registrationNo = serializers.CharField(source="registration_number", max_length=100, required=False, allow_blank=True)
    panNo = serializers.CharField(source="pan_number", max_length=20, required=False, allow_blank=True)
    gstNo = serializers.CharField(source="gst_number", max_length=30, required=False, allow_blank=True)
    address_line_1 = serializers.CharField(max_length=200, required=False, allow_blank=True)
    address_line_2 = serializers.CharField(max_length=200, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    postalCode = serializers.CharField(source="postal_code", max_length=20, required=False, allow_blank=True)
    country = serializers.CharField(max_length=100, required=False)
    primaryEmail = serializers.EmailField(source="primary_email", required=False, allow_blank=True)
    primaryPhone = serializers.CharField(source="primary_phone", max_length=32, required=False, allow_blank=True)
    alternatePhone = serializers.CharField(source="alternate_phone", max_length=32, required=False, allow_blank=True)
    websiteUrl = serializers.URLField(source="website_url", required=False, allow_blank=True)
    contactName = serializers.CharField(source="contact_name", max_length=200, required=False, allow_blank=True)
    contactDesignation = serializers.CharField(source="contact_designation", max_length=120, required=False, allow_blank=True)
    contactPhone = serializers.CharField(source="contact_phone", max_length=32, required=False, allow_blank=True)
    contactEmail = serializers.EmailField(source="contact_email", required=False, allow_blank=True)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError({"nonFieldErrors": ["Provide at least one field."]})
        return attrs


class InstituteSuccessSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = InstituteSerializer()


class PeerInstituteSerializer(serializers.ModelSerializer):
    """Deliberately compact: a peer link never exposes another tenant's data."""

    associationId = serializers.UUIDField(source="association_id", read_only=True)
    displayName = serializers.CharField(source="display_name")
    instituteType = serializers.CharField(source="institute_type")
    primaryEmail = serializers.EmailField(source="primary_email")
    email = serializers.EmailField(source="primary_email")
    primaryPhone = serializers.CharField(source="primary_phone")
    isActive = serializers.BooleanField(source="is_active")

    class Meta:
        model = Institute
        fields = (
            "associationId", "id", "name", "code", "displayName", "instituteType",
            "city", "state", "country", "email", "primaryEmail", "primaryPhone", "isActive",
        )


class PeerInstituteListDataSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    items = PeerInstituteSerializer(many=True)


class PeerInstituteListSuccessSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = PeerInstituteListDataSerializer()


class CreatePeerInstituteSerializer(StrictSerializer):
    name = serializers.CharField(min_length=2, max_length=200)
    displayName = serializers.CharField(max_length=200, required=False, allow_blank=True)
    instituteType = serializers.CharField(source="institute_type", max_length=40, default="School")
    email = serializers.EmailField(source="primary_email", required=False, allow_blank=True)
    primaryPhone = serializers.CharField(source="primary_phone", max_length=32, required=False, allow_blank=True)
    address_line_1 = serializers.CharField(max_length=200, required=False, allow_blank=True)
    address_line_2 = serializers.CharField(max_length=200, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    country = serializers.CharField(max_length=100, default="India")
    postalCode = serializers.CharField(source="postal_code", max_length=20, required=False, allow_blank=True)
    headOfficeName = serializers.CharField(min_length=2, max_length=200, default="Main Campus")
    timezone = TimezoneField(default="Asia/Kolkata", max_length=64)

    def create(self, validated_data):
        actor = validated_data.pop("actor")
        source_institute = validated_data.pop("source_institute")
        head_office_name = validated_data.pop("headOfficeName")
        timezone = validated_data.pop("timezone")
        display_name = validated_data.pop("display_name", "")
        prefix = slugify(validated_data["name"]).upper()[:19] or "INSTITUTE"
        institute = Institute.objects.create(
            code=f"{prefix}-{token_hex(6).upper()}",
            display_name=display_name or validated_data["name"],
            **validated_data,
        )
        Branch.objects.create(
            institute=institute,
            name=head_office_name,
            code="MAIN",
            is_head_office=True,
            timezone=timezone,
        )
        InstituteMembership.objects.create(
            user=actor,
            institute=institute,
            role=InstituteMembership.Role.INSTITUTE_ADMIN,
        )
        association, _ = InstituteAssociation.link(source_institute, institute)
        institute.association_id = association.id
        return institute


class LinkPeerInstituteSerializer(StrictSerializer):
    instituteId = serializers.UUIDField()

    def validate_instituteId(self, value):
        try:
            institute = Institute.objects.get(id=value, is_active=True)
        except Institute.DoesNotExist as exc:
            raise serializers.ValidationError("No active registered institute was found.") from exc
        return institute


class BranchSerializer(serializers.ModelSerializer):
    isHeadOffice = serializers.BooleanField(source="is_head_office")
    isActive = serializers.BooleanField(source="is_active")
    studentCount = serializers.IntegerField(source="student_count", read_only=True, default=0)
    staffCount = serializers.IntegerField(source="staff_count", read_only=True, default=0)
    sectionCount = serializers.IntegerField(source="section_count", read_only=True, default=0)
    instituteSlug = serializers.CharField(source="institute.slug", read_only=True, allow_null=True)
    instituteUrl = serializers.SerializerMethodField()

    def get_instituteUrl(self, obj):
        return f"https://{obj.institute.slug}.arkailabs.com" if obj.institute.slug else None

    class Meta:
        model = Branch
        fields = (
            "id", "instituteSlug", "instituteUrl",
            "name",
            "code",
            "isHeadOffice",
            "isActive",
            "timezone",
            "address_line_1",
            "address_line_2",
            "city",
            "state",
            "postal_code",
            "phone",
            "email",
            "branch_admin_name",
            "studentCount",
            "staffCount",
            "sectionCount",
        )


class BranchCreateSerializer(StrictSerializer):
    name = serializers.CharField(min_length=2, max_length=200)
    timezone = TimezoneField(default="Asia/Kolkata", max_length=64)
    address_line_1 = serializers.CharField(max_length=200, required=False, allow_blank=True)
    address_line_2 = serializers.CharField(max_length=200, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    branch_admin_name = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def create(self, validated_data):
        institute = validated_data.pop("institute")
        return Branch.objects.create(
            institute=institute,
            code=short_branch_code(validated_data["name"], institute),
            **validated_data,
        )


class BranchUpdateSerializer(StrictSerializer):
    name = serializers.CharField(min_length=2, max_length=200, required=False)
    timezone = TimezoneField(max_length=64, required=False)
    isActive = serializers.BooleanField(source="is_active", required=False)
    address_line_1 = serializers.CharField(max_length=200, required=False, allow_blank=True)
    address_line_2 = serializers.CharField(max_length=200, required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    state = serializers.CharField(max_length=100, required=False, allow_blank=True)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    branch_admin_name = serializers.CharField(max_length=200, required=False, allow_blank=True)

    def validate(self, attrs):
        if self.instance.is_head_office and attrs.get("is_active") is False:
            raise serializers.ValidationError(
                {"isActive": ["The head-office branch cannot be deactivated."]}
            )
        if not attrs:
            raise serializers.ValidationError({"nonFieldErrors": ["Provide at least one field."]})
        return attrs

    def update(self, instance, validated_data):
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save(update_fields=(*validated_data.keys(), "updated_at"))
        return instance


class BranchListDataSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    items = BranchSerializer(many=True)


class BranchListSuccessSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = BranchListDataSerializer()


class BranchSuccessSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = BranchSerializer()
