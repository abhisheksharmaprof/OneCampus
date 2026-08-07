import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel

TEACHER_WORKING_DAYS = ("MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN")


def default_teacher_available_days():
    return list(TEACHER_WORKING_DAYS)


def default_teacher_available_periods():
    return [1, 2, 3, 4, 5, 6, 7, 8]


class Student(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="students"
    )
    branch = models.ForeignKey(
        "institutes.Branch", on_delete=models.PROTECT, related_name="students"
    )
    admission_number = models.CharField(max_length=64)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    father_name = models.CharField(max_length=200, blank=True)
    mother_name = models.CharField(max_length=200, blank=True)
    student_nic_id = models.CharField(max_length=64, blank=True)
    sr_number = models.CharField(max_length=64, blank=True)
    aadhar_number = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, blank=True)
    social_category = models.CharField(max_length=40, blank=True)
    religion = models.CharField(max_length=60, blank=True)
    mother_tongue = models.CharField(max_length=60, blank=True)
    rural_urban = models.CharField(max_length=10, blank=True)
    habitation_locality = models.CharField(max_length=200, blank=True)
    date_of_admission = models.DateField(null=True, blank=True)
    belongs_to_bpl = models.BooleanField(null=True, blank=True)
    belongs_to_disadvantaged_group = models.BooleanField(null=True, blank=True)
    getting_free_education = models.BooleanField(null=True, blank=True)
    previous_class = models.CharField(max_length=50, blank=True)
    previous_year_status = models.CharField(max_length=100, blank=True)
    previous_year_attendance_days = models.PositiveIntegerField(null=True, blank=True)
    medium_of_instruction = models.CharField(max_length=60, blank=True)
    disability_type = models.CharField(max_length=100, blank=True)
    cwsn_facilities = models.CharField(max_length=200, blank=True)
    uniform_sets = models.PositiveSmallIntegerField(null=True, blank=True)
    free_text_books = models.BooleanField(null=True, blank=True)
    free_transport = models.BooleanField(null=True, blank=True)
    free_escort = models.BooleanField(null=True, blank=True)
    mdm_beneficiary = models.BooleanField(null=True, blank=True)
    free_hostel_facility = models.BooleanField(null=True, blank=True)
    attended_special_training = models.BooleanField(null=True, blank=True)
    last_examination_appeared = models.BooleanField(null=True, blank=True)
    last_examination_passed = models.BooleanField(null=True, blank=True)
    last_examination_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True
    )
    stream = models.CharField(max_length=100, blank=True)
    trade_sector = models.CharField(max_length=100, blank=True)
    iron_folic_acid_tablets = models.BooleanField(null=True, blank=True)
    deworming_tablets = models.BooleanField(null=True, blank=True)
    vitamin_a_supplement = models.BooleanField(null=True, blank=True)
    mobile_number = models.CharField(max_length=20, blank=True)
    email_address = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("first_name", "last_name", "admission_number")
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "admission_number"),
                condition=Q(is_active=True),
                name="uq_student_admission_number_per_institute",
            ),
            models.UniqueConstraint(
                fields=("institute", "sr_number"),
                condition=~Q(sr_number=""),
                name="uq_student_sr_number_per_institute",
            ),
            models.UniqueConstraint(
                fields=("institute", "student_nic_id"),
                condition=~Q(student_nic_id=""),
                name="uq_student_nic_id_per_institute",
            ),
        ]
        indexes = [models.Index(fields=("institute", "branch", "is_active"))]

    def clean(self):
        if self.branch_id and self.branch.institute_id != self.institute_id:
            raise ValidationError({"branch": "Branch must belong to the selected institute."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()


class StaffProfile(TimeStampedModel):
    class EmploymentType(models.TextChoices):
        FULL_TIME = "FULL_TIME", "Full-time"
        PART_TIME = "PART_TIME", "Part-time"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="staff_profiles"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="staff_profiles"
    )
    employee_code = models.CharField(max_length=64, blank=True)
    department = models.CharField(max_length=120, blank=True)
    invite_pending = models.BooleanField(default=True)
    employment_type = models.CharField(
        max_length=16, choices=EmploymentType.choices, default=EmploymentType.FULL_TIME
    )
    available_days = models.JSONField(default=default_teacher_available_days)
    available_periods = models.JSONField(default=default_teacher_available_periods)
    max_periods_per_day = models.PositiveSmallIntegerField(default=6)
    max_periods_per_week = models.PositiveSmallIntegerField(default=36)
    availability_start_time = models.TimeField(null=True, blank=True)
    availability_end_time = models.TimeField(null=True, blank=True)
    monthly_salary = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    salary_currency = models.CharField(max_length=3, default="INR")
    pay_frequency = models.CharField(max_length=16, default="MONTHLY")
    bank_name = models.CharField(max_length=120, blank=True)
    bank_account_last4 = models.CharField(max_length=4, blank=True)
    bank_ifsc = models.CharField(max_length=20, blank=True)
    date_of_joining = models.DateField(null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=32, blank=True)
    blood_group = models.CharField(max_length=12, blank=True)
    qualification = models.CharField(max_length=160, blank=True)
    experience_years = models.PositiveSmallIntegerField(null=True, blank=True)
    marital_status = models.CharField(max_length=32, blank=True)
    father_name = models.CharField(max_length=160, blank=True)
    mother_name = models.CharField(max_length=160, blank=True)
    pan_or_id_number = models.CharField(max_length=64, blank=True)
    current_address = models.TextField(blank=True)
    permanent_address = models.TextField(blank=True)
    previous_school_name = models.CharField(max_length=200, blank=True)
    previous_school_address = models.TextField(blank=True)
    previous_school_phone = models.CharField(max_length=20, blank=True)
    bank_branch = models.CharField(max_length=120, blank=True)
    shift = models.CharField(max_length=64, blank=True)
    work_location = models.CharField(max_length=160, blank=True)
    social_links = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("user__first_name", "user__last_name", "user__email")
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "user"), name="uq_staff_profile_per_institute"
            ),
            models.UniqueConstraint(
                fields=("institute", "employee_code"),
                condition=~models.Q(employee_code=""),
                name="uq_staff_employee_code_per_institute",
            ),
        ]
        indexes = [models.Index(fields=("institute", "invite_pending"))]

    def clean(self):
        errors = {}
        if not isinstance(self.available_days, list) or not self.available_days:
            errors["available_days"] = "Choose at least one available working day."
        elif any(day not in TEACHER_WORKING_DAYS for day in self.available_days):
            errors["available_days"] = "Available days must use MON through SUN."
        elif len(set(self.available_days)) != len(self.available_days):
            errors["available_days"] = "Available days cannot contain duplicates."
        if self.max_periods_per_day < 1:
            errors["max_periods_per_day"] = "Maximum periods per day must be at least 1."
        if self.max_periods_per_week < 1:
            errors["max_periods_per_week"] = "Maximum periods per week must be at least 1."
        if self.employment_type == self.EmploymentType.PART_TIME:
            if (
                self.availability_start_time
                and self.availability_end_time
                and self.availability_start_time >= self.availability_end_time
            ):
                errors["availability"] = "Availability end time must be after the start time."
        if errors:
            raise ValidationError(errors)


class ParentProfile(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="parent_profiles"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="parent_profiles"
    )

    class Meta:
        ordering = ("user__first_name", "user__last_name", "user__email")
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "user"), name="uq_parent_profile_per_institute"
            )
        ]


class StudentGuardian(TimeStampedModel):
    class Relationship(models.TextChoices):
        FATHER = "FATHER", "Father"
        MOTHER = "MOTHER", "Mother"
        GUARDIAN = "GUARDIAN", "Guardian"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    parent = models.ForeignKey(
        ParentProfile, on_delete=models.CASCADE, related_name="student_links"
    )
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="guardian_links")
    relationship = models.CharField(max_length=16, choices=Relationship.choices)
    is_primary_contact = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("parent", "student"), name="uq_parent_student_link")
        ]
        indexes = [models.Index(fields=("student", "is_primary_contact"))]
