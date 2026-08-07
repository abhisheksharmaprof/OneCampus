import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import ParentProfile, Student, StudentGuardian


def authenticate_admin(api_client, admin):
    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['data']['accessToken']}")


@pytest.mark.django_db
def test_admin_can_create_and_list_only_current_institute_students(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="MAIN", is_head_office=True
    )
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    other_branch = Branch.objects.create(
        institute=other, name="Other Campus", code="OTHER-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    Student.objects.create(
        institute=other, branch=other_branch, admission_number="OTHER-001", first_name="Hidden"
    )
    authenticate_admin(api_client, admin)

    create = api_client.post(
        "/api/v1/admin/students",
        {
            "branchId": str(branch.id),
            "firstName": "Diya",
            "lastName": "Patel",
            "fatherName": "Rajesh Patel",
            "motherName": "Priya Patel",
            "dateOfBirth": "2013-03-14",
            "gender": "Female",
            "dateOfAdmission": "2026-04-01",
            "mobileNumber": "9876543210",
            "emailAddress": "diya@example.com",
        },
        format="json",
    )

    assert create.status_code == 201
    item = create.json()["data"]
    assert item["admissionNumber"].startswith("NSA-")
    assert item["firstName"] == "Diya"
    assert item["branch"]["id"] == str(branch.id)
    assert item["fatherName"] == "Rajesh Patel"
    assert item["motherName"] == "Priya Patel"
    assert item["dateOfBirth"] == "2013-03-14"
    assert item["gender"] == "Female"
    assert item["mobileNumber"] == "9876543210"

    listed = api_client.get("/api/v1/admin/students")
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()["data"]["items"]] == [item["id"]]


@pytest.mark.django_db
def test_student_create_cannot_use_foreign_branch(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    Branch.objects.create(institute=institute, name="Main Campus", code="MAIN", is_head_office=True)
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    other_branch = Branch.objects.create(
        institute=other, name="Other Campus", code="OTHER-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    authenticate_admin(api_client, admin)

    response = api_client.post(
        "/api/v1/admin/students",
        {"branchId": str(other_branch.id), "firstName": "Diya"},
        format="json",
    )

    assert response.status_code == 404


@pytest.mark.django_db
def test_admin_can_reuse_admission_number_from_inactive_student(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    Student.objects.create(
        institute=institute,
        branch=branch,
        admission_number="NSA-001",
        first_name="Former",
        is_active=False,
    )
    authenticate_admin(api_client, admin)

    response = api_client.post(
        "/api/v1/admin/students",
        {
            "branchId": str(branch.id),
            "admissionNumber": "NSA-001",
            "firstName": "Current",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data"]["admissionNumber"] == "NSA-001"


@pytest.mark.django_db
def test_deleting_student_removes_parent_link(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    parent_user = User.objects.create_user(
        email="parent@northstar.test", password=None, first_name="Anita", phone="9876543210"
    )
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    InstituteMembership.objects.create(
        user=parent_user,
        institute=institute,
        branch=branch,
        role=InstituteMembership.Role.PARENT,
    )
    parent = ParentProfile.objects.create(institute=institute, user=parent_user)
    student = Student.objects.create(
        institute=institute, branch=branch, admission_number="NSA-001", first_name="Diya"
    )
    StudentGuardian.objects.create(
        parent=parent,
        student=student,
        relationship=StudentGuardian.Relationship.MOTHER,
    )
    authenticate_admin(api_client, admin)

    response = api_client.delete(f"/api/v1/admin/students/{student.id}")

    assert response.status_code == 204
    assert not StudentGuardian.objects.filter(student=student).exists()
    parent_response = api_client.get("/api/v1/admin/parents")
    assert parent_response.status_code == 200
    assert parent_response.json()["data"]["items"][0]["children"] == []
