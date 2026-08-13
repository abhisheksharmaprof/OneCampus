from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from modules.institutes.models import Institute

from .models import (
    AcademicYear,
    ClassSection,
    StudentEnrollment,
    SubjectTeacherAssignment,
    _validate_teacher,
)


class AcademicsValidationError(Exception):
    def __init__(self, field_errors):
        self.field_errors = field_errors
        super().__init__("Academic structure validation failed.")


def _field_errors(exc):
    if hasattr(exc, "message_dict"):
        return exc.message_dict
    return {"nonFieldErrors": exc.messages}


@transaction.atomic
def save_academic_year(*, academic_year, make_current=None):
    Institute.objects.select_for_update().get(pk=academic_year.institute_id)
    if make_current is not None:
        academic_year.is_current = make_current
    if academic_year.is_current:
        AcademicYear.objects.filter(
            institute_id=academic_year.institute_id, is_current=True
        ).exclude(pk=academic_year.pk).update(is_current=False)
    try:
        academic_year.save()
    except DjangoValidationError as exc:
        raise AcademicsValidationError(_field_errors(exc)) from exc
    return academic_year


@transaction.atomic
def set_current_academic_year(*, institute, academic_year):
    Institute.objects.select_for_update().get(pk=institute.pk)
    AcademicYear.objects.filter(institute=institute, is_current=True).exclude(
        pk=academic_year.pk
    ).update(is_current=False)
    academic_year.is_current = True
    academic_year.save(update_fields=("is_current", "updated_at"))
    return academic_year


@transaction.atomic
def save_class_section(*, section):
    if section.max_strength is None:
        section.max_strength = 100
    if section.pk:
        ClassSection.objects.select_for_update().filter(pk=section.pk).exists()
    active_enrollment_count = 0
    if section.pk:
        active_enrollment_count = section.student_enrollments.filter(left_at__isnull=True).count()
    if section.max_strength is not None and section.max_strength < active_enrollment_count:
        raise AcademicsValidationError(
            {
                "maxStrength": [
                    "Maximum strength cannot be below the "
                    f"{active_enrollment_count} active enrollments."
                ]
            }
        )
    try:
        section.save()
    except DjangoValidationError as exc:
        raise AcademicsValidationError(_field_errors(exc)) from exc
    return section


@transaction.atomic
def create_enrollment(*, student, class_section, roll_number):
    section = ClassSection.objects.select_for_update().get(pk=class_section.pk)
    if section.max_strength is None:
        section.max_strength = 100
        section.save(update_fields=("max_strength", "updated_at"))
    max_cap = section.max_strength
    enrollment_count = section.student_enrollments.filter(left_at__isnull=True).exclude(student=student).count()
    if enrollment_count >= max_cap:
        raise AcademicsValidationError(
            {"classSectionId": [f"This section has reached its maximum strength ({max_cap})."]}
        )
    enrollment = StudentEnrollment(
        student=student,
        class_section=section,
        academic_year=section.academic_year,
        roll_number=roll_number,
    )
    try:
        enrollment.save()
    except DjangoValidationError as exc:
        raise AcademicsValidationError(_field_errors(exc)) from exc
    return enrollment


@transaction.atomic
def update_enrollment(
    *,
    enrollment,
    class_section=None,
    roll_number=None,
    left_at_marker=False,
    left_at=None,
):
    locked = (
        StudentEnrollment.objects.select_for_update()
        .select_related("student", "class_section__branch", "academic_year")
        .get(pk=enrollment.pk)
    )
    target_section = class_section or locked.class_section
    if target_section.pk != locked.class_section_id and left_at is None:
        section = ClassSection.objects.select_for_update().get(pk=target_section.pk)
        if section.max_strength is not None:
            count = section.student_enrollments.filter(left_at__isnull=True).count()
            if count >= section.max_strength:
                raise AcademicsValidationError(
                    {"classSectionId": ["This section has reached its maximum strength."]}
                )
        locked.class_section = section
        locked.academic_year = section.academic_year
    if roll_number is not None:
        locked.roll_number = roll_number
    if left_at_marker:
        locked.left_at = left_at
    try:
        locked.save()
    except DjangoValidationError as exc:
        raise AcademicsValidationError(_field_errors(exc)) from exc
    return locked


def validate_assignment_sections(*, sections, subject, teacher, combined_slot_label, assignment_id):
    """Set-level rules for SubjectTeacherAssignment that clean() can't express (M2M).

    Raises a Django ValidationError with a field-keyed dict.

    ``combined_slot_label`` is accepted but intentionally unvalidated here:
    label-based parallel-option rules are enforced at a later layer, and the
    parameter is reserved so callers pass the full write payload.
    """
    if not sections:
        raise DjangoValidationError({"classSectionIds": "Select at least one section."})
    grades = {s.grade_id for s in sections}
    branches = {s.branch_id for s in sections}
    years = {s.academic_year_id for s in sections}
    if len(grades) > 1 or len(branches) > 1 or len(years) > 1:
        raise DjangoValidationError(
            {"classSectionIds": "All sections must belong to the same class, branch, and academic year."}
        )
    institute_id = sections[0].branch.institute_id
    if subject.institute_id != institute_id:
        raise DjangoValidationError({"subjectId": "Subject must belong to the sections' institute."})
    _validate_teacher(
        teacher=teacher,
        institute_id=institute_id,
        branch_id=sections[0].branch_id,
        field_name="teacherId",
    )
    # One assignment per subject per exact section set (regardless of teacher).
    target = {s.id for s in sections}
    candidates = (
        SubjectTeacherAssignment.objects.filter(subject=subject, class_sections__in=list(target))
        .exclude(id=assignment_id)
        .prefetch_related("class_sections")
        .distinct()
    )
    for other in candidates:
        if {s.id for s in other.class_sections.all()} == target:
            raise DjangoValidationError(
                {"subjectId": "This subject is already mapped for the selected sections."}
            )
