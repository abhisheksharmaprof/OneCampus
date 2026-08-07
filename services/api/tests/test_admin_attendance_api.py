import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student


@pytest.mark.django_db
def test_attendance_overview_rejects_foreign_branch_filter(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="MAIN", is_head_office=True
    )
    other_institute = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_branch = Branch.objects.create(
        institute=other_institute, name="Other Campus", code="OTHER-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    Student.objects.create(
        institute=institute, branch=branch, admission_number="NSA-0001", first_name="Diya"
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")

    response = api_client.get(f"/api/v1/admin/attendance/overview?branchId={foreign_branch.id}")

    assert response.status_code == 404
