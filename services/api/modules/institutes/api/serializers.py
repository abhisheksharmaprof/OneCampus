from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from datetime import timedelta
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers

from modules.identity.models import User
from modules.institutes.models import (Branch, Institute, InstituteConsentRecord,
    InstituteDocument, InstituteMembership, InstituteSubscription, SubscriptionPlan)
from .admin_serializers import short_branch_code


class InstituteApplicationSerializer(serializers.Serializer):
    """Public, final onboarding submission. Drafts stay client-side until verified."""
    account = serializers.DictField()
    identity = serializers.DictField(required=False, default=dict)
    institute = serializers.DictField(required=False, default=dict)
    compliance = serializers.DictField(required=False, default=dict)
    contact = serializers.DictField(required=False, default=dict)
    scale = serializers.DictField(required=False, default=dict)
    hasBranches = serializers.BooleanField(required=False, default=False)
    branch = serializers.DictField(required=False, default=dict)
    documents = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    consents = serializers.DictField()

    def validate(self, attrs):
        account, identity, contact, consents = (attrs[key] for key in ("account", "identity", "contact", "consents"))
        minimal = bool(attrs.get("institute"))
        if minimal:
            institute_input = attrs["institute"]
            identity = attrs["identity"] = {
                "legalName": institute_input.get("legalName") or institute_input.get("name"),
                "displayName": institute_input.get("displayName") or institute_input.get("legalName") or institute_input.get("name"),
                "slug": institute_input.get("slug"),
            }
            contact = attrs["contact"] = {
                "primaryEmail": account.get("email", ""),
                "primaryPhone": account.get("phone", ""),
                "contactName": account.get("fullName", ""),
                "contactPhone": account.get("phone", ""),
            }
        branch = attrs["branch"]
        errors = {}
        required_fields = [(account, "fullName", "account.fullName"), (identity, "legalName", "identity.legalName"), (identity, "displayName", "identity.displayName")]
        if not minimal:
            required_fields.extend([(account, "phone", "account.phone"), (contact, "primaryEmail", "contact.primaryEmail"), (contact, "primaryPhone", "contact.primaryPhone"), (contact, "contactName", "contact.contactName"), (contact, "contactPhone", "contact.contactPhone")])
        else:
            required_fields.extend([(account, "email", "account.email"), (account, "password", "account.password"), (identity, "slug", "identity.slug")])
            try:
                validate_password(account.get("password", ""))
            except DjangoValidationError as exc:
                errors["account.password"] = list(exc.messages)
        if attrs["hasBranches"]:
            required_fields.extend([(branch, "name", "branch.name"), (branch, "addressLine1", "branch.addressLine1"), (branch, "city", "branch.city"), (branch, "state", "branch.state")])
        for group, field, label in required_fields:
            if not str(group.get(field, "")).strip(): errors[label] = ["This field is required."]
        if not consents.get("authorized") or not consents.get("terms"):
            errors["consents"] = ["Both acknowledgments are required."]
        email = str(account.get("email") or contact.get("primaryEmail") or "").strip().lower()
        if User.objects.filter(email__iexact=email).exists(): errors["account.email"] = ["An account with this email already exists."]
        slug = str(identity.get("slug") or slugify(identity.get("displayName") or identity.get("legalName") or "")).strip().lower()
        if not slug or len(slug) < 3:
            errors["identity.slug"] = ["Choose a URL name with at least 3 characters."]
        elif Institute.objects.filter(slug__iexact=slug).exists():
            errors["identity.slug"] = ["This URL name is already taken."]
        elif slug in {"admin", "api", "app", "auth", "help", "support", "www", "platform"}:
            errors["identity.slug"] = ["This URL name is reserved."]
        if errors: raise serializers.ValidationError(errors)
        return attrs

    @transaction.atomic
    def create(self, data):
        from secrets import token_hex
        account, identity, contact = data["account"], data["identity"], data["contact"]
        compliance, branch_data, scale = data["compliance"], data["branch"], data["scale"]
        code_prefix = slugify(identity["legalName"]).upper()[:19] or "INSTITUTE"
        slug = slugify(identity.get("slug") or identity["displayName"] or identity["legalName"])
        institute = Institute.objects.create(name=identity["legalName"], slug=slug, display_name=identity["displayName"], code=f"{code_prefix}-{token_hex(6).upper()}", onboarding_status=Institute.OnboardingStatus.PENDING_REVIEW,
            institute_type=identity.get("type", "School"), board_affiliation=identity.get("board", ""), board_affiliation_number=identity.get("boardNumber", ""), udise_code=identity.get("udise", ""), establishment_year=identity.get("establishmentYear") or None, medium_of_instruction=identity.get("medium", "English"),
            registered_entity_type=compliance.get("entityType", ""), registration_number=compliance.get("registrationNumber", ""), pan_number=compliance.get("pan", ""), gst_number=compliance.get("gst", ""),
            address_line_1=contact.get("addressLine1", ""), address_line_2=contact.get("addressLine2", ""), city=contact.get("city", ""), state=contact.get("state", ""), country=contact.get("country", "India"), postal_code=contact.get("postalCode", ""), primary_email=contact["primaryEmail"], primary_phone=contact["primaryPhone"], alternate_phone=contact.get("alternatePhone", ""), website_url=contact.get("website", ""), contact_name=contact["contactName"], contact_designation=contact.get("contactDesignation", ""), contact_phone=contact["contactPhone"], contact_email=contact.get("contactEmail", ""))
        if data["hasBranches"]:
            Branch.objects.create(institute=institute, name=branch_data["name"], code=short_branch_code(branch_data["name"], institute), is_head_office=True, address_line_1=branch_data["addressLine1"], address_line_2=branch_data.get("addressLine2", ""), city=branch_data["city"], state=branch_data["state"], country=branch_data.get("country", "India"), postal_code=branch_data.get("postalCode", ""), phone=branch_data.get("phone", ""), email=branch_data.get("email", ""), timezone=branch_data.get("timezone", "Asia/Kolkata"))
        parts = account["fullName"].split(maxsplit=1)
        user = User.objects.create_user(email=str(account.get("email") or contact.get("primaryEmail")).lower(), password=account.get("password") or None, first_name=parts[0], last_name=parts[1] if len(parts) > 1 else "", phone=account.get("phone", ""), phone_verified_at=timezone.now() if account.get("phone") else None, user_type="institute_admin")
        membership = InstituteMembership.objects.create(user=user, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN)
        for document in data["documents"]:
            if document.get("fileName"):
                InstituteDocument.objects.create(institute=institute, document_type=document.get("type", "other"), file_name=document["fileName"])
        plan = SubscriptionPlan.objects.filter(id=scale.get("planId"), is_active=True).first() or SubscriptionPlan.objects.filter(is_active=True).first()
        if plan:
            InstituteSubscription.objects.create(institute=institute, plan=plan, trial_ends_at=timezone.now() + timedelta(days=14))
        InstituteConsentRecord.objects.create(institute=institute, accepted_by=user, authorized_to_register=True, terms_accepted=True, ip_address=self.context["request"].META.get("REMOTE_ADDR"))
        return {"user": user, "membership": membership, "institute": institute}


class InstituteOnboardingSerializer(serializers.Serializer):
    instituteName = serializers.CharField(min_length=2, max_length=200, trim_whitespace=True)
    branchName = serializers.CharField(min_length=2, max_length=200, trim_whitespace=True)
    adminName = serializers.CharField(min_length=2, max_length=300, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(
        min_length=8, max_length=128, trim_whitespace=False, write_only=True
    )

    def validate_email(self, value):
        email = User.objects.normalize_email(value).lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return email

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value

    @transaction.atomic
    def create(self, validated_data):
        from secrets import token_hex

        institute_name = validated_data["instituteName"]
        code_prefix = slugify(institute_name).upper()[:19] or "SCHOOL"
        institute = Institute.objects.create(
            name=institute_name,
            code=f"{code_prefix}-{token_hex(6).upper()}",
        )
        branch = Branch.objects.create(
            institute=institute,
            name=validated_data["branchName"],
            code=short_branch_code(validated_data["branchName"], institute),
            is_head_office=True,
        )
        name_parts = validated_data["adminName"].split(maxsplit=1)
        user = User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=name_parts[0],
            last_name=name_parts[1] if len(name_parts) > 1 else "",
        )
        membership = InstituteMembership.objects.create(
            user=user,
            institute=institute,
            role=InstituteMembership.Role.INSTITUTE_ADMIN,
        )
        return {
            "user": user,
            "institute": institute,
            "branch": branch,
            "membership": membership,
        }


class InstituteOnboardingDataSerializer(serializers.Serializer):
    accessToken = serializers.CharField()
    refreshToken = serializers.CharField()
    user = serializers.DictField()
    onboarding = serializers.DictField()


class InstituteOnboardingSuccessSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = InstituteOnboardingDataSerializer()
