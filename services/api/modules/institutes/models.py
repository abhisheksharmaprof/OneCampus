import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel


class Institute(TimeStampedModel):
    class OnboardingStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        PENDING_REVIEW = "pending_review", "Pending review"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=80, unique=True, null=True, blank=True)
    code = models.CharField(max_length=32, unique=True)
    is_active = models.BooleanField(default=True)
    display_name = models.CharField(max_length=200, blank=True)
    institute_type = models.CharField(max_length=40, default="School")
    board_affiliation = models.CharField(max_length=80, blank=True)
    board_affiliation_number = models.CharField(max_length=100, blank=True)
    udise_code = models.CharField(max_length=50, blank=True)
    establishment_year = models.PositiveIntegerField(null=True, blank=True)
    medium_of_instruction = models.CharField(max_length=100, default="English")
    registered_entity_type = models.CharField(max_length=80, blank=True)
    registration_number = models.CharField(max_length=100, blank=True)
    pan_number = models.CharField(max_length=20, blank=True)
    gst_number = models.CharField(max_length=30, blank=True)
    address_line_1 = models.CharField(max_length=200, blank=True)
    address_line_2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default="India")
    postal_code = models.CharField(max_length=20, blank=True)
    primary_email = models.EmailField(blank=True)
    primary_phone = models.CharField(max_length=32, blank=True)
    alternate_phone = models.CharField(max_length=32, blank=True)
    website_url = models.URLField(blank=True)
    contact_name = models.CharField(max_length=200, blank=True)
    contact_designation = models.CharField(max_length=120, blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    contact_email = models.EmailField(blank=True)
    onboarding_status = models.CharField(max_length=20, choices=OnboardingStatus.choices, default=OnboardingStatus.DRAFT)
    rejection_reason = models.TextField(blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_institutes",
    )
    logo_url = models.URLField(blank=True)
    brand_color = models.CharField(max_length=7, default="#2457D6")

    class Meta:
        ordering = ("name",)

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class InstituteAssociation(TimeStampedModel):
    """A peer relationship between two autonomous institutes.

    The stored pair is canonicalised so one row represents the relationship in
    both directions.  It deliberately carries no tenant data or permissions.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute_one = models.ForeignKey(
        Institute, on_delete=models.CASCADE, related_name="peer_associations_as_one"
    )
    institute_two = models.ForeignKey(
        Institute, on_delete=models.CASCADE, related_name="peer_associations_as_two"
    )

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("institute_one", "institute_two"),
                name="uq_institute_peer_association",
            ),
            models.CheckConstraint(
                condition=~Q(institute_one=models.F("institute_two")),
                name="ck_institute_peer_association_distinct",
            ),
        ]

    @classmethod
    def canonical_pair(cls, first, second):
        """Return a stable ordering for an unordered pair of institutes."""
        return (first, second) if first.pk.hex < second.pk.hex else (second, first)

    @classmethod
    def link(cls, first, second):
        one, two = cls.canonical_pair(first, second)
        return cls.objects.get_or_create(institute_one=one, institute_two=two)

    def clean(self):
        if self.institute_one_id == self.institute_two_id:
            raise ValidationError({"institute_two": "An institute cannot be associated with itself."})

    def save(self, *args, **kwargs):
        if self.institute_one_id and self.institute_two_id:
            one, two = self.canonical_pair(self.institute_one, self.institute_two)
            self.institute_one, self.institute_two = one, two
        self.clean()
        return super().save(*args, **kwargs)

    def other_institute(self, institute):
        if institute.pk == self.institute_one_id:
            return self.institute_two
        if institute.pk == self.institute_two_id:
            return self.institute_one
        raise ValueError("Institute is not part of this association.")


class Branch(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(Institute, on_delete=models.PROTECT, related_name="branches")
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=32)
    is_head_office = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    address_line_1 = models.CharField(max_length=200, blank=True)
    address_line_2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, default="India")
    postal_code = models.CharField(max_length=20, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    email = models.EmailField(blank=True)
    branch_admin_name = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ("institute_id", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "code"), name="uq_branch_code_per_institute"
            ),
            models.UniqueConstraint(
                fields=("institute",),
                condition=Q(is_head_office=True),
                name="uq_one_head_office_per_institute",
            ),
        ]

    def save(self, *args, **kwargs):
        self.code = self.code.strip().upper()
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.institute.name} · {self.name}"


class InstituteDocument(TimeStampedModel):
    class DocumentType(models.TextChoices):
        AFFILIATION = "affiliation_certificate", "Affiliation Certificate"
        REGISTRATION = "registration_certificate", "Registration Certificate"
        PAN = "pan_card", "PAN Card"
        GST = "gst_certificate", "GST Certificate"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(Institute, on_delete=models.CASCADE, related_name="documents")
    document_type = models.CharField(max_length=40, choices=DocumentType.choices)
    file_name = models.CharField(max_length=255)
    verified = models.BooleanField(default=False)


class SubscriptionPlan(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    price_per_student = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    flat_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_branches = models.PositiveIntegerField(default=1)
    max_students = models.PositiveIntegerField(default=100)
    features_json = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)


class InstituteSubscription(TimeStampedModel):
    class Status(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(Institute, on_delete=models.CASCADE, related_name="subscriptions")
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TRIAL)
    trial_ends_at = models.DateTimeField()


class InstituteConsentRecord(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(Institute, on_delete=models.CASCADE, related_name="onboarding_consents")
    accepted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    authorized_to_register = models.BooleanField()
    terms_accepted = models.BooleanField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)


class InstituteMembership(TimeStampedModel):
    class Role(models.TextChoices):
        INSTITUTE_ADMIN = "INSTITUTE_ADMIN", "Institute Admin"
        BRANCH_ADMIN = "BRANCH_ADMIN", "Branch Admin"
        TEACHER = "TEACHER", "Teacher"
        STAFF = "STAFF", "Staff"
        PARENT = "PARENT", "Parent"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="institute_memberships"
    )
    institute = models.ForeignKey(Institute, on_delete=models.CASCADE, related_name="memberships")
    branch = models.ForeignKey(
        Branch, on_delete=models.CASCADE, related_name="memberships", null=True, blank=True
    )
    role = models.CharField(max_length=32, choices=Role.choices)
    is_active = models.BooleanField(default=True)
    valid_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("institute_id", "user_id", "role")
        constraints = [
            models.UniqueConstraint(
                fields=("user", "institute", "role"),
                condition=Q(branch__isnull=True),
                name="uq_institute_membership_role",
            ),
            models.UniqueConstraint(
                fields=("user", "institute", "branch", "role"),
                condition=Q(branch__isnull=False),
                name="uq_branch_membership_role",
            ),
        ]

    def clean(self):
        errors = {}
        if self.branch_id and self.branch.institute_id != self.institute_id:
            errors["branch"] = "Branch must belong to the selected institute."
        if self.role == self.Role.INSTITUTE_ADMIN and self.branch_id:
            errors["branch"] = "Institute administrators must have institute-wide scope."
        if self.role in {self.Role.BRANCH_ADMIN, self.Role.TEACHER, self.Role.STAFF} and not self.branch_id:
            errors["branch"] = "Branch Admin, teacher, and staff roles require a branch."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} · {self.role} · {self.institute}"
