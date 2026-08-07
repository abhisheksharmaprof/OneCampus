import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


def authenticate_admin(api_client, admin):
    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['data']['accessToken']}")


@pytest.mark.django_db
def test_admin_can_create_and_list_tenant_scoped_staff(api_client):
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
    hidden = User.objects.create_user(email="hidden@other.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=hidden, institute=other, branch=other_branch, role=InstituteMembership.Role.TEACHER
    )
    authenticate_admin(api_client, admin)

    created = api_client.post(
        "/api/v1/admin/staff",
        {
            "fullName": "Meera Iyer",
            "email": "meera@northstar.test",
            "branchId": str(branch.id),
            "role": "TEACHER",
            "employeeCode": "NSA-T-001",
            "employmentType": "PART_TIME",
            "availableDays": ["MON", "WED", "FRI"],
            "maxPeriodsPerDay": 3,
            "maxPeriodsPerWeek": 12,
            "availableStartTime": "08:00",
            "availableEndTime": "13:00",
        },
        format="json",
    )

    assert created.status_code == 201
    assert created.json()["data"]["fullName"] == "Meera Iyer"
    assert created.json()["data"]["status"] == "PENDING_INVITE"
    assert created.json()["data"]["branch"]["id"] == str(branch.id)
    assert created.json()["data"]["employmentType"] == "PART_TIME"
    assert created.json()["data"]["availableDays"] == ["MON", "WED", "FRI"]
    assert created.json()["data"]["maxPeriodsPerDay"] == 3
    assert created.json()["data"]["maxPeriodsPerWeek"] == 12
    assert created.json()["data"]["availableStartTime"] == "08:00:00"
    assert created.json()["data"]["availableEndTime"] == "13:00:00"
    assert User.objects.get(email="meera@northstar.test").has_usable_password() is False

    listed = api_client.get("/api/v1/admin/staff")
    assert listed.status_code == 200
    assert [row["email"] for row in listed.json()["data"]["items"]] == ["meera@northstar.test"]


@pytest.mark.django_db
def test_staff_create_rejects_invalid_teacher_availability(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    authenticate_admin(api_client, admin)

    response = api_client.post(
        "/api/v1/admin/staff",
        {
            "fullName": "Meera Iyer",
            "email": "meera@northstar.test",
            "branchId": str(branch.id),
            "role": "TEACHER",
            "availableDays": ["BAD"],
            "maxPeriodsPerDay": 0,
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["error"]["fieldErrors"]["availableDays"]
    assert response.json()["error"]["fieldErrors"]["maxPeriodsPerDay"]


@pytest.mark.django_db
def test_staff_create_rejects_foreign_branch(api_client):
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
        "/api/v1/admin/staff",
        {
            "fullName": "Meera Iyer",
            "email": "meera@northstar.test",
            "branchId": str(other_branch.id),
            "role": "TEACHER",
        },
        format="json",
    )

    assert response.status_code == 404
