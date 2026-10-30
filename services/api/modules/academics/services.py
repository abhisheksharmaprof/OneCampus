from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction

from modules.institutes.models import Branch, Institute
from modules.people.models import Student

from .models import AcademicYear, ClassSection, ExamTarget, Grade, StudentEnrollment


class AcademicsValidationError(Exception):
    def __init__(self, field_errors):
        self.field_errors = field_errors
        super().__init__("Academic structure validation failed.")


def lock_student_cohort(*, section_ids=(), student_ids=()):
    """Use section-then-student lock order shared with exam timetable publication."""
    list(ClassSection.objects.select_for_update().filter(id__in=set(section_ids)).order_by("id"))
    list(Student.objects.select_for_update().filter(id__in=set(student_ids)).order_by("id"))


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
def ensure_default_section(*, grade, branch, academic_year=None):
    """Return the fallback section for a class without a configured section."""
    if academic_year is None:
        academic_year = AcademicYear.objects.filter(
            institute_id=grade.institute_id, is_current=True
        ).first()
    if academic_year is None:
        raise AcademicsValidationError(
            {"academicYearId": ["A current academic year is required for class placement."]}
        )
    if branch.institute_id != grade.institute_id or academic_year.institute_id != grade.institute_id:
        raise AcademicsValidationError(
            {"classId": ["Class, branch, and academic year must belong to the same institute."]}
        )
    section, _ = ClassSection.objects.get_or_create(
        branch=branch, grade=grade, academic_year=academic_year,
        section_name="Default", defaults={"max_strength": 100},
    )
    return section


@transaction.atomic
def provision_default_sections(*, grade):
    """Create a Default section for every active branch in the current year."""
    academic_year = AcademicYear.objects.filter(
        institute_id=grade.institute_id, is_current=True
    ).first()
    if academic_year is None:
        return []
    return [
        ensure_default_section(grade=grade, branch=branch, academic_year=academic_year)
        for branch in Branch.objects.filter(institute_id=grade.institute_id, is_active=True)
    ]


@transaction.atomic
def set_current_academic_year(*, institute, academic_year):
    Institute.objects.select_for_update().get(pk=institute.pk)
    AcademicYear.objects.filter(institute=institute, is_current=True).exclude(
        pk=academic_year.pk
    ).update(is_current=False)
    academic_year.is_current = True
    academic_year.save(update_fields=("is_current", "updated_at"))
    for grade in Grade.objects.filter(institute_id=institute.pk):
        provision_default_sections(grade=grade)
    return academic_year


@transaction.atomic
def save_class_section(*, section):
    if section.max_strength is None:
        section.max_strength = 100
    if section.pk:
        original = ClassSection.objects.select_for_update().filter(pk=section.pk).values(
            "branch_id", "grade_id", "academic_year_id"
        ).first()
        if original and any(
            original[field] != getattr(section, field)
            for field in ("branch_id", "grade_id", "academic_year_id")
        ):
            exam_ids = list(
                ExamTarget.objects.filter(class_section_id=section.pk)
                .exclude(exam__status="CANCELLED")
                .values_list("exam_id", flat=True)
                .distinct()
            )
            if exam_ids:
                message = (
                    "Campus, class, and academic year cannot change while this "
                    "section is used by exams. "
                    "Resolve or cancel exams first: "
                    + ", ".join(str(item) for item in exam_ids)
                )
                raise AcademicsValidationError({
                    "classSection": [message]
                })
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
    lock_student_cohort(section_ids=[class_section.pk], student_ids=[student.pk])
    student = Student.objects.get(pk=student.pk)
    if not student.is_active:
        raise AcademicsValidationError({"studentId": ["Only active students can be enrolled."]})
    section = ClassSection.objects.get(pk=class_section.pk)
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
    initial = StudentEnrollment.objects.select_related("class_section").get(pk=enrollment.pk)
    target_section_id = (class_section or initial.class_section).pk
    section_ids = {initial.class_section_id, target_section_id}
    lock_student_cohort(section_ids=section_ids, student_ids=[initial.student_id])
    locked = (
        StudentEnrollment.objects.select_for_update()
        .select_related("student", "class_section__branch", "academic_year")
        .get(pk=enrollment.pk)
    )
    if locked.class_section_id not in section_ids:
        raise AcademicsValidationError(
            {"classSectionId": ["This enrollment changed. Reload it and try again."]}
        )
    if left_at_marker and left_at is None and not locked.student.is_active:
        raise AcademicsValidationError({"studentId": ["Only active students can be enrolled."]})
    target_section = ClassSection.objects.get(pk=target_section_id)
    if target_section.pk != locked.class_section_id and left_at is None:
        if target_section.max_strength is not None:
            count = target_section.student_enrollments.filter(left_at__isnull=True).count()
            if count >= target_section.max_strength:
                raise AcademicsValidationError(
                    {"classSectionId": ["This section has reached its maximum strength."]}
                )
        locked.class_section = target_section
        locked.academic_year = target_section.academic_year
    if roll_number is not None:
        locked.roll_number = roll_number
    if left_at_marker:
        locked.left_at = left_at
    try:
        locked.save()
    except DjangoValidationError as exc:
        raise AcademicsValidationError(_field_errors(exc)) from exc
    return locked


@transaction.atomic
def delete_enrollment(*, enrollment):
    current = StudentEnrollment.objects.get(pk=enrollment.pk)
    lock_student_cohort(
        section_ids=[current.class_section_id], student_ids=[current.student_id]
    )
    locked = StudentEnrollment.objects.select_for_update().get(pk=current.pk)
    locked.delete()
