from datetime import date

import pytest
from django.core.exceptions import ValidationError

from modules.academics.models import (
    AcademicYear,
    ClassSection,
    Grade,
    Subject,
    SubjectTeacherAssignment,
)
from modules.academics.services import (
    AcademicsValidationError,
    create_enrollment,
    set_current_academic_year,
)
from modules.identity.models import User
from modules.institutes.models import Branch, Institute
from modules.people.models import Student


def _build_assignment_fixtures():
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    grade = Grade.objects.create(institute=institute, name="Class 8")
    year = AcademicYear.objects.create(
        institute=institute,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
    )
    section_a = ClassSection.objects.create(
        branch=branch, grade=grade, academic_year=year, section_name="A"
    )
    section_b = ClassSection.objects.create(
        branch=branch, grade=grade, academic_year=year, section_name="B"
    )
    subject = Subject.objects.create(institute=institute, name="French")
    teacher = User.objects.create_user(
        email="teacher@campusone.test", password="StrongPass123!"
    )
    return section_a, section_b, subject, teacher


@pytest.mark.django_db
def test_setting_current_year_is_atomic_and_institute_scoped():
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    old = AcademicYear.objects.create(
        institute=institute,
        name="2025-26",
        start_date=date(2025, 4, 1),
        end_date=date(2026, 3, 31),
        is_current=True,
    )
    new = AcademicYear.objects.create(
        institute=institute,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
    )
    other_current = AcademicYear.objects.create(
        institute=other,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_current=True,
    )

    set_current_academic_year(institute=institute, academic_year=new)

    old.refresh_from_db()
    new.refresh_from_db()
    other_current.refresh_from_db()
    assert old.is_current is False
    assert new.is_current is True
    assert other_current.is_current is True


@pytest.mark.django_db
def test_section_rejects_cross_tenant_grade_and_year():
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_grade = Grade.objects.create(institute=other, name="Class 8")
    foreign_year = AcademicYear.objects.create(
        institute=other,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
    )

    with pytest.raises(ValidationError) as exc_info:
        ClassSection.objects.create(
            branch=branch,
            grade=foreign_grade,
            academic_year=foreign_year,
            section_name="A",
        )

    assert "grade" in exc_info.value.message_dict
    assert "academic_year" in exc_info.value.message_dict


@pytest.mark.django_db
def test_enrollment_enforces_branch_consistency_and_capacity():
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    main = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    annex = Branch.objects.create(institute=institute, name="Annex", code="ANNEX")
    grade = Grade.objects.create(institute=institute, name="Class 8")
    year = AcademicYear.objects.create(
        institute=institute,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
    )
    section = ClassSection.objects.create(
        branch=main,
        grade=grade,
        academic_year=year,
        section_name="A",
        max_strength=1,
    )
    first = Student.objects.create(
        institute=institute,
        branch=main,
        admission_number="NSA-001",
        first_name="Diya",
    )
    wrong_branch = Student.objects.create(
        institute=institute,
        branch=annex,
        admission_number="NSA-002",
        first_name="Kabir",
    )
    second = Student.objects.create(
        institute=institute,
        branch=main,
        admission_number="NSA-003",
        first_name="Mira",
    )

    with pytest.raises(AcademicsValidationError) as branch_error:
        create_enrollment(student=wrong_branch, class_section=section, roll_number="1")
    assert "same branch" in str(branch_error.value.field_errors)

    created = create_enrollment(student=first, class_section=section, roll_number="1")
    assert created.academic_year == year

    with pytest.raises(AcademicsValidationError) as exc_info:
        create_enrollment(student=second, class_section=section, roll_number="2")
    assert "maximum strength" in str(exc_info.value.field_errors)


@pytest.mark.django_db
def test_assignment_supports_multiple_sections():
    section_a, section_b, subject, teacher = _build_assignment_fixtures()

    assignment = SubjectTeacherAssignment.objects.create(
        subject=subject, teacher=teacher, combined_slot_label="Second Language"
    )
    assignment.class_sections.set([section_a, section_b])

    assert assignment.class_sections.count() == 2
    assert assignment.combined_slot_label == "Second Language"


@pytest.mark.django_db
def test_assignment_label_defaults_blank():
    section_a, _section_b, subject, teacher = _build_assignment_fixtures()

    assignment = SubjectTeacherAssignment.objects.create(subject=subject, teacher=teacher)
    assignment.class_sections.set([section_a])

    assert assignment.combined_slot_label == ""
