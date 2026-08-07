import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel


def _validate_teacher(*, teacher, institute_id, branch_id, field_name):
    if teacher is None:
        return
    if not teacher.staff_profiles.filter(institute_id=institute_id).exists():
        raise ValidationError({field_name: "Teacher must be staff of the section's institute."})
    if not teacher.institute_memberships.filter(
        institute_id=institute_id,
        branch_id=branch_id,
        role="TEACHER",
        is_active=True,
    ).exists():
        raise ValidationError(
            {field_name: "Teacher must have an active role in the section's branch."}
        )


class AcademicYear(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="academic_years"
    )
    name = models.CharField(max_length=20)
    start_date = models.DateField()
    end_date = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = "academic_years"
        ordering = ("-start_date", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "name"), name="uq_academic_year_name_per_institute"
            ),
            models.UniqueConstraint(
                fields=("institute",),
                condition=Q(is_current=True),
                name="uq_current_academic_year_per_institute",
            ),
            models.CheckConstraint(
                condition=Q(end_date__gte=models.F("start_date")),
                name="ck_academic_year_date_order",
            ),
        ]
        indexes = [models.Index(fields=("institute", "is_current", "start_date"))]

    def clean(self):
        self.name = self.name.strip()
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValidationError({"end_date": "End date must be on or after start date."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class AcademicTerm(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.CASCADE, related_name="terms"
    )
    name = models.CharField(max_length=80)
    start_date = models.DateField()
    end_date = models.DateField()
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "academic_terms"
        ordering = ("sort_order", "start_date", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("academic_year", "name"), name="uq_academic_term_name_per_year"
            ),
            models.CheckConstraint(
                condition=Q(end_date__gte=models.F("start_date")),
                name="ck_academic_term_date_order",
            ),
        ]

    def clean(self):
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValidationError({"end_date": "End date must be on or after start date."})
        if self.academic_year_id and self.start_date and self.end_date:
            if self.start_date < self.academic_year.start_date or self.end_date > self.academic_year.end_date:
                raise ValidationError({"start_date": "Term dates must fall within the academic year."})

    def save(self, *args, **kwargs):
        self.name = self.name.strip()
        self.full_clean()
        return super().save(*args, **kwargs)


class Grade(TimeStampedModel):
    """An institute-wide class/grade definition (for example, Class 8 or UKG)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="grades"
    )
    name = models.CharField(max_length=50)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "classes"
        ordering = ("sort_order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "name"), name="uq_class_name_per_institute"
            )
        ]
        indexes = [models.Index(fields=("institute", "sort_order", "name"))]

    def save(self, *args, **kwargs):
        self.name = self.name.strip()
        self.full_clean()
        return super().save(*args, **kwargs)


class Subject(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="subjects"
    )
    name = models.CharField(max_length=100)
    subject_code = models.CharField(max_length=20, blank=True)

    class Meta:
        db_table = "subjects"
        ordering = ("name", "subject_code")
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "name"), name="uq_subject_name_per_institute"
            ),
            models.UniqueConstraint(
                fields=("institute", "subject_code"),
                condition=~Q(subject_code=""),
                name="uq_subject_code_per_institute",
            ),
        ]
        indexes = [models.Index(fields=("institute", "name"))]

    def save(self, *args, **kwargs):
        self.name = self.name.strip()
        self.subject_code = self.subject_code.strip().upper()
        self.full_clean()
        return super().save(*args, **kwargs)


class Room(TimeStampedModel):
    """A bookable physical space used by timetable and institute operations."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("institutes.Institute", on_delete=models.CASCADE, related_name="rooms")
    branch = models.ForeignKey("institutes.Branch", on_delete=models.CASCADE, related_name="rooms")
    name = models.CharField(max_length=100)
    room_type = models.CharField(max_length=40, default="CLASSROOM")
    capacity = models.PositiveIntegerField(null=True, blank=True)
    floor = models.PositiveSmallIntegerField(default=1)
    equipment = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "rooms"
        ordering = ("branch__name", "name")
        constraints = [models.UniqueConstraint(fields=("branch", "name"), name="uq_room_name_per_branch")]
        indexes = [models.Index(fields=("institute", "branch", "is_active"))]

    def clean(self):
        self.name = self.name.strip()
        if self.branch_id and self.institute_id and self.branch.institute_id != self.institute_id:
            raise ValidationError({"branch": "Room branch must belong to the selected institute."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class ClassSubject(TimeStampedModel):
    """Curriculum assignment of a catalog subject to an institute class."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("institutes.Institute", on_delete=models.CASCADE, related_name="class_subjects")
    grade = models.ForeignKey(Grade, on_delete=models.CASCADE, related_name="curriculum_subjects")
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="class_curricula")
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, related_name="class_subjects", null=True, blank=True)
    is_lab = models.BooleanField(default=False)
    subject_code_override = models.CharField(max_length=20, blank=True)
    is_elective = models.BooleanField(default=False)
    periods_per_week = models.PositiveSmallIntegerField(null=True, blank=True)
    default_max_marks = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "class_subjects"
        ordering = ("sort_order", "subject__name")
        constraints = [models.UniqueConstraint(fields=("grade", "subject"), name="uq_class_subject")]
        indexes = [models.Index(fields=("institute", "grade"))]

    def clean(self):
        if self.grade_id and self.subject_id and self.grade.institute_id != self.subject.institute_id:
            raise ValidationError({"subject": "Subject must belong to the class's institute."})
        if self.institute_id and self.grade_id and self.institute_id != self.grade.institute_id:
            raise ValidationError({"grade": "Class must belong to the selected institute."})
        if self.room_id and not self.is_lab:
            raise ValidationError({"room": "Room allocation is only available for lab subjects."})
        if self.room_id and self.room.room_type.upper() not in {"LAB", "LABORATORY"}:
            raise ValidationError({"room": "Only laboratory rooms can be assigned to lab subjects."})

    def save(self, *args, **kwargs):
        self.subject_code_override = self.subject_code_override.strip().upper()
        self.full_clean()
        return super().save(*args, **kwargs)


class ClassSection(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    branch = models.ForeignKey(
        "institutes.Branch", on_delete=models.PROTECT, related_name="class_sections"
    )
    grade = models.ForeignKey(
        Grade, db_column="class_id", on_delete=models.PROTECT, related_name="sections"
    )
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name="class_sections"
    )
    section_name = models.CharField(max_length=20)
    class_teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="class_teacher_sections",
        null=True,
        blank=True,
    )
    max_strength = models.PositiveIntegerField(default=100, null=True, blank=True)

    class Meta:
        db_table = "class_sections"
        ordering = ("grade__sort_order", "grade__name", "section_name")
        constraints = [
            models.UniqueConstraint(
                fields=("branch", "grade", "academic_year", "section_name"),
                name="uq_class_section_scope",
            ),
            models.CheckConstraint(
                condition=Q(max_strength__isnull=True) | Q(max_strength__gt=0),
                name="ck_class_section_positive_capacity",
            ),
        ]
        indexes = [
            models.Index(fields=("branch", "academic_year")),
            models.Index(fields=("grade", "academic_year")),
        ]

    @property
    def institute_id(self):
        return self.branch.institute_id

    def clean(self):
        errors = {}
        self.section_name = self.section_name.strip()
        if self.branch_id and self.grade_id and self.branch.institute_id != self.grade.institute_id:
            errors["grade"] = "Class must belong to the branch's institute."
        if (
            self.branch_id
            and self.academic_year_id
            and self.branch.institute_id != self.academic_year.institute_id
        ):
            errors["academic_year"] = "Academic year must belong to the branch's institute."
        if self.max_strength is not None and self.max_strength < 1:
            errors["max_strength"] = "Maximum strength must be at least 1."
        if errors:
            raise ValidationError(errors)
        _validate_teacher(
            teacher=self.class_teacher,
            institute_id=self.branch.institute_id,
            branch_id=self.branch_id,
            field_name="class_teacher",
        )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class SubjectTeacherAssignment(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    class_section = models.ForeignKey(
        ClassSection, on_delete=models.CASCADE, related_name="subject_teacher_assignments"
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="section_teacher_assignments"
    )
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="subject_teacher_assignments",
    )

    class Meta:
        db_table = "subject_teacher_assignments"
        ordering = ("subject__name",)
        constraints = [
            models.UniqueConstraint(
                fields=("class_section", "subject"), name="uq_section_subject_teacher"
            )
        ]
        indexes = [
            models.Index(fields=("class_section", "teacher")),
            models.Index(fields=("teacher", "class_section")),
        ]

    def clean(self):
        if self.class_section_id and self.subject_id:
            institute_id = self.class_section.branch.institute_id
            if self.subject.institute_id != institute_id:
                raise ValidationError(
                    {"subject": "Subject must belong to the section's institute."}
                )
            _validate_teacher(
                teacher=self.teacher,
                institute_id=institute_id,
                branch_id=self.class_section.branch_id,
                field_name="teacher",
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class StudentEnrollment(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    student = models.ForeignKey(
        "people.Student", on_delete=models.CASCADE, related_name="academic_enrollments"
    )
    class_section = models.ForeignKey(
        ClassSection, on_delete=models.PROTECT, related_name="student_enrollments"
    )
    academic_year = models.ForeignKey(
        AcademicYear, on_delete=models.PROTECT, related_name="student_enrollments"
    )
    roll_number = models.CharField(max_length=20)
    enrolled_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "student_enrollments"
        ordering = ("class_section", "roll_number")
        constraints = [
            models.UniqueConstraint(
                fields=("class_section", "roll_number"), name="uq_section_roll_number"
            ),
            models.UniqueConstraint(
                fields=("student", "academic_year"), name="uq_student_academic_year"
            ),
            models.CheckConstraint(
                condition=Q(left_at__isnull=True) | Q(left_at__gte=models.F("enrolled_at")),
                name="ck_enrollment_left_after_enrolled",
            ),
        ]
        indexes = [
            models.Index(fields=("student",)),
            models.Index(fields=("class_section", "academic_year")),
            models.Index(fields=("academic_year", "left_at")),
        ]

    def clean(self):
        errors = {}
        self.roll_number = self.roll_number.strip().upper()
        if self.class_section_id and self.academic_year_id:
            if self.class_section.academic_year_id != self.academic_year_id:
                errors["academic_year"] = "Academic year must match the section's academic year."
        if self.student_id and self.class_section_id:
            if self.student.institute_id != self.class_section.branch.institute_id:
                errors["student"] = "Student and section must belong to the same institute."
            if self.student.branch_id != self.class_section.branch_id:
                errors["student"] = "Student and section must belong to the same branch."
        if self.left_at and self.enrolled_at and self.left_at < self.enrolled_at:
            errors["left_at"] = "Leaving time cannot be before enrollment time."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean(exclude=("enrolled_at",) if self._state.adding else ())
        return super().save(*args, **kwargs)


class AcademicOperation(TimeStampedModel):
    """Tenant-scoped persisted content for academic operational workflows."""

    class Kind(models.TextChoices):
        LESSON_PLAN = "LESSON_PLAN", "Lesson plan"
        HOMEWORK = "HOMEWORK", "Homework"
        EXAM = "EXAM", "Exam"
        QUESTION = "QUESTION", "Question"
        MARK = "MARK", "Mark"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="academic_operations"
    )
    branch = models.ForeignKey(
        "institutes.Branch", on_delete=models.CASCADE, related_name="academic_operations",
        null=True, blank=True,
    )
    kind = models.CharField(max_length=24, choices=Kind.choices)
    title = models.CharField(max_length=250)
    status = models.CharField(max_length=40, default="DRAFT")
    payload = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        related_name="created_academic_operations", null=True, blank=True,
    )

    class Meta:
        db_table = "academic_operations"
        ordering = ("-updated_at", "title")
        indexes = [
            models.Index(
                fields=("institute", "kind", "-updated_at"),
                name="academic_op_institu_63d585_idx",
            ),
            models.Index(
                fields=("branch", "kind", "status"),
                name="academic_op_branch__626d7c_idx",
            ),
        ]

    def clean(self):
        self.title = self.title.strip()
        self.status = self.status.strip().upper().replace(" ", "_")
        if not self.title:
            raise ValidationError({"title": "Title is required."})
        if not isinstance(self.payload, dict):
            raise ValidationError({"payload": "Payload must be an object."})
        if self.branch_id and self.branch.institute_id != self.institute_id:
            raise ValidationError({"branch": "Branch must belong to the selected institute."})

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)
