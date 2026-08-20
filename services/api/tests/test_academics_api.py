from datetime import date

import pytest

from modules.academics.models import AcademicOperation, AcademicYear, ClassSection, Grade, Subject
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student

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


def test_subject_api_reports_duplicate_code_as_a_friendly_field_error(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    Subject.objects.create(institute=institute, branch=branch, name="Mathematics", subject_code="MATHS-PP3")
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    rejected = api_client.post(
        "/subjects",
        {"name": "Maths", "subjectCode": "Maths-pp3", "branchId": str(branch.id)},
        format="json",
    )

    assert rejected.status_code == 400
    payload = rejected.json()["error"]
    assert payload["fieldErrors"] == {
        "subjectCode": [
            "This subject code is already in use in this branch. Please choose a different code."
        ]
    }
    assert "uq_subject_code_per_institute" not in str(payload)


def test_subject_api_allows_duplicate_names_when_codes_are_unique(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    Subject.objects.create(institute=institute, branch=branch, name="Mathematics", subject_code="MATHS-PP3")
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    created = api_client.post(
        "/subjects",
        {"name": "Mathematics", "subjectCode": "MATHS-CLASS-8", "branchId": str(branch.id)},
        format="json",
    )

    assert created.status_code == 201
    assert created.json()["data"]["name"] == "Mathematics"
    assert created.json()["data"]["subjectCode"] == "MATHS-CLASS-8"


def test_subject_creation_can_assign_the_subject_to_a_class(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    grade = Grade.objects.create(institute=institute, name="Class 8")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    year = AcademicYear.objects.create(
        institute=institute, name="2026-27", start_date=date(2026, 4, 1), end_date=date(2027, 3, 31), is_current=True
    )
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    created = api_client.post(
        "/subjects",
        {"name": "Mathematics", "subjectCode": "MATHS-8", "branchId": str(branch.id)},
        format="json",
    )
    assert created.status_code == 201

    mapped = api_client.post(
        "/class-subjects",
        {
            "classId": str(grade.id),
            "subjectId": created.json()["data"]["id"],
            "branchId": str(branch.id),
            "periodsPerWeek": 5,
            "isElective": False,
            "isLab": False,
            "roomId": None,
        },
        format="json",
    )
    assert mapped.status_code == 201

    listed = api_client.get(f"/subjects?pageSize=100&branchId={branch.id}")
    assert listed.status_code == 200
    assert listed.json()["data"]["items"][0]["classesCount"] == 1

    curriculum = api_client.get(f"/class-subjects?branchId={branch.id}&pageSize=100")
    assert curriculum.status_code == 200
    assert curriculum.json()["data"]["items"][0]["sectionLabel"] == "Class 8 – Default"


def test_subject_delete_explains_mapping_dependency(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    grade = Grade.objects.create(institute=institute, name="Class 8")
    AcademicYear.objects.create(
        institute=institute,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_current=True,
    )
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    created = api_client.post(
        "/subjects",
        {"name": "Mathematics", "subjectCode": "MATHS-8", "branchId": str(branch.id)},
        format="json",
    )
    subject_id = created.json()["data"]["id"]
    mapped = api_client.post(
        "/class-subjects",
        {"classId": str(grade.id), "subjectId": subject_id, "branchId": str(branch.id)},
        format="json",
    )

    rejected = api_client.delete(f"/subjects/{subject_id}")
    assert rejected.status_code == 400
    assert rejected.json()["error"]["fieldErrors"] == {
        "nonFieldErrors": [
            "Remove this subject from all class and section mappings before deleting it."
        ]
    }

    assert api_client.delete(f"/class-subjects/{mapped.json()['data']['id']}").status_code == 204
    assert api_client.delete(f"/subjects/{subject_id}").status_code == 204


def test_subject_codes_are_unique_per_branch_not_institute(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    first = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    second = Branch.objects.create(institute=institute, name="West", code="WEST")
    authenticate_admin(api_client, institute=institute, email="admin@northstar.test")

    first_subject = api_client.post("/subjects", {"name": "Mathematics", "subjectCode": "MATH", "branchId": str(first.id)}, format="json")
    second_subject = api_client.post("/subjects", {"name": "Mathematics", "subjectCode": "MATH", "branchId": str(second.id)}, format="json")

    assert first_subject.status_code == 201
    assert second_subject.status_code == 201
