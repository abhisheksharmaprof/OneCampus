from datetime import date

import pytest

from modules.academics.models import (
    AcademicOperation,
    AcademicYear,
    ClassSection,
    Grade,
    Subject,
)
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import StaffProfile, Student

pytestmark = [pytest.mark.django_db, pytest.mark.urls("modules.academics.api.urls")]


def authenticate_admin(api_client, *, institute, email):
    admin = User.objects.create_user(email=email, password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=admin,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    api_client.force_authenticate(
        user=admin,
        token={"client": "admin-web", "membership_id": str(membership.id)},
    )


def create_year(institute, name="2026-27"):
    return AcademicYear.objects.create(
        institute=institute,
        name=name,
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
    )


def test_academic_year_api_is_paginated_tenant_scoped_and_sets_current(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    hidden = create_year(other)
    old = AcademicYear.objects.create(
        institute=institute,
        name="2025-26",
        start_date=date(2025, 4, 1),
        end_date=date(2026, 3, 31),
        is_current=True,
    )
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    created = api_client.post(
        "/academic-years",
        {
            "name": "2026-27",
            "startDate": "2026-04-01",
            "endDate": "2027-03-31",
        },
        format="json",
    )
    assert created.status_code == 201
    created_id = created.json()["data"]["id"]

    listed = api_client.get("/academic-years?pageSize=25")
    assert listed.status_code == 200
    assert listed.json()["data"]["count"] == 2
    assert hidden.id not in {row["id"] for row in listed.json()["data"]["items"]}

    current = api_client.post(f"/academic-years/{created_id}/set-current", {}, format="json")
    assert current.status_code == 200
    assert current.json()["data"]["isCurrent"] is True
    old.refresh_from_db()
    assert old.is_current is False


def test_section_api_rejects_foreign_scope_and_reports_active_enrollment_count(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    grade = Grade.objects.create(institute=institute, name="Class 8", sort_order=8)
    year = create_year(institute)
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_grade = Grade.objects.create(institute=other, name="Class 8")
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    rejected = api_client.post(
        "/sections",
        {
            "branchId": str(branch.id),
            "gradeId": str(foreign_grade.id),
            "academicYearId": str(year.id),
            "sectionName": "A",
            "maxStrength": 1,
        },
        format="json",
    )
    assert rejected.status_code == 404

    created = api_client.post(
        "/sections",
        {
            "branchId": str(branch.id),
            "gradeId": str(grade.id),
            "academicYearId": str(year.id),
            "sectionName": "A",
            "maxStrength": 1,
        },
        format="json",
    )
    assert created.status_code == 201
    section_id = created.json()["data"]["id"]
    student = Student.objects.create(
        institute=institute,
        branch=branch,
        admission_number="NSA-001",
        first_name="Diya",
    )
    enrollment = api_client.post(
        "/enrollments",
        {
            "studentId": str(student.id),
            "classSectionId": section_id,
            "rollNumber": "8-a-01",
        },
        format="json",
    )
    assert enrollment.status_code == 201
    assert enrollment.json()["data"]["rollNumber"] == "8-A-01"

    section = api_client.get(f"/sections/{section_id}")
    assert section.status_code == 200
    assert section.json()["data"]["enrollmentCount"] == 1

    second = Student.objects.create(
        institute=institute,
        branch=branch,
        admission_number="NSA-002",
        first_name="Mira",
    )
    full = api_client.post(
        "/enrollments",
        {
            "studentId": str(second.id),
            "classSectionId": section_id,
            "rollNumber": "2",
        },
        format="json",
    )
    assert full.status_code == 400
    assert full.json()["error"]["fieldErrors"]["classSectionId"]


def test_enrollment_list_filters_by_branch_without_leaking_other_tenants(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    grade = Grade.objects.create(institute=institute, name="Class 8")
    year = create_year(institute)
    section = ClassSection.objects.create(
        branch=branch, grade=grade, academic_year=year, section_name="A"
    )
    student = Student.objects.create(
        institute=institute,
        branch=branch,
        admission_number="NSA-001",
        first_name="Diya",
    )
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")
    api_client.post(
        "/enrollments",
        {
            "studentId": str(student.id),
            "classSectionId": str(section.id),
            "rollNumber": "1",
        },
        format="json",
    )

    listed = api_client.get(f"/enrollments?branchId={branch.id}&active=true")

    assert listed.status_code == 200
    assert listed.json()["data"]["count"] == 1
    assert listed.json()["data"]["items"][0]["student"]["admissionNumber"] == "NSA-001"


def test_academic_operations_are_persisted_tenant_scoped_and_editable(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    AcademicOperation.objects.create(
        institute=other,
        kind=AcademicOperation.Kind.LESSON_PLAN,
        title="Hidden plan",
    )
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    created = api_client.post(
        "/operations",
        {
            "kind": "LESSON_PLAN",
            "title": "Linear equations",
            "status": "SUBMITTED",
            "payload": {"subject": "Mathematics", "className": "Class 8"},
        },
        format="json",
    )
    assert created.status_code == 201
    operation_id = created.json()["data"]["id"]
    assert AcademicOperation.objects.filter(id=operation_id).exists()

    listed = api_client.get("/operations?kind=LESSON_PLAN&pageSize=25")
    assert listed.status_code == 200
    assert listed.json()["data"]["count"] == 1
    assert listed.json()["data"]["items"][0]["title"] == "Linear equations"

    approved = api_client.patch(
        f"/operations/{operation_id}", {"status": "APPROVED"}, format="json"
    )
    assert approved.status_code == 200
    assert approved.json()["data"]["status"] == "APPROVED"

    rejected_kind_change = api_client.patch(
        f"/operations/{operation_id}", {"kind": "EXAM"}, format="json"
    )
    assert rejected_kind_change.status_code == 400


def build_assignment_fixtures():
    """Two same-grade sections, one other-grade section, a subject, and a teacher
    that passes the staff-profile/membership checks in views._teacher."""
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    grade = Grade.objects.create(institute=institute, name="Class 8", sort_order=8)
    other_grade = Grade.objects.create(institute=institute, name="Class 9", sort_order=9)
    year = create_year(institute)
    section_a = ClassSection.objects.create(
        branch=branch, grade=grade, academic_year=year, section_name="A"
    )
    section_b = ClassSection.objects.create(
        branch=branch, grade=grade, academic_year=year, section_name="B"
    )
    other_grade_section = ClassSection.objects.create(
        branch=branch, grade=other_grade, academic_year=year, section_name="A"
    )
    subject = Subject.objects.create(institute=institute, name="Hindi")
    teacher = User.objects.create_user(
        email="teacher@northstar.test", password="StrongPass123!"
    )
    StaffProfile.objects.create(institute=institute, user=teacher)
    InstituteMembership.objects.create(
        user=teacher,
        institute=institute,
        branch=branch,
        role=InstituteMembership.Role.TEACHER,
        is_active=True,
    )
    return institute, section_a, section_b, other_grade_section, subject, teacher


def test_create_assignment_with_multiple_sections(api_client):
    institute, section_a, section_b, _other, subject, teacher = build_assignment_fixtures()
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    response = api_client.post(
        "/section-subject-teachers",
        {
            "classSectionIds": [str(section_a.id), str(section_b.id)],
            "subjectId": str(subject.id),
            "teacherId": str(teacher.id),
            "combinedSlotLabel": "Second Language",
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()["data"]
    assert sorted(body["classSectionIds"]) == sorted([str(section_a.id), str(section_b.id)])
    assert body["combinedSlotLabel"] == "Second Language"
    assert body["classSectionId"] in {str(section_a.id), str(section_b.id)}  # legacy field
    assert body["classSectionLabel"] == "Class 8 A/B"


def test_create_assignment_legacy_single_section_still_works(api_client):
    institute, section_a, _section_b, _other, subject, teacher = build_assignment_fixtures()
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    response = api_client.post(
        "/section-subject-teachers",
        {
            "classSectionId": str(section_a.id),
            "subjectId": str(subject.id),
            "teacherId": str(teacher.id),
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data"]["classSectionIds"] == [str(section_a.id)]


def test_patch_assignment_expands_section_set(api_client):
    institute, section_a, section_b, _other, subject, teacher = build_assignment_fixtures()
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")
    created = api_client.post(
        "/section-subject-teachers",
        {
            "classSectionIds": [str(section_a.id)],
            "subjectId": str(subject.id),
            "teacherId": str(teacher.id),
        },
        format="json",
    )
    assert created.status_code == 201
    assignment_id = created.json()["data"]["id"]

    response = api_client.patch(
        f"/section-subject-teachers/{assignment_id}",
        {"classSectionIds": [str(section_a.id), str(section_b.id)]},
        format="json",
    )

    assert response.status_code == 200
    assert sorted(response.json()["data"]["classSectionIds"]) == sorted(
        [str(section_a.id), str(section_b.id)]
    )


def test_create_assignment_rejects_cross_grade(api_client):
    institute, section_a, _section_b, other_grade_section, subject, teacher = (
        build_assignment_fixtures()
    )
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    response = api_client.post(
        "/section-subject-teachers",
        {
            "classSectionIds": [str(section_a.id), str(other_grade_section.id)],
            "subjectId": str(subject.id),
            "teacherId": str(teacher.id),
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["error"]["fieldErrors"]["classSectionIds"]
