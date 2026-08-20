import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.invitations.models import StaffInvitation


def _authenticate_admin(api_client, admin):
    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['data']['accessToken']}")


@pytest.mark.django_db
def test_staff_creation_uses_otp_onboarding_without_invitation_table(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute,
        name="Main Campus",
        code="MAIN",
        is_head_office=True,
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    _authenticate_admin(api_client, admin)
    response = api_client.post(
        "/api/v1/admin/staff",
        {
            "fullName": "Meera Iyer",
            "email": "meera@northstar.test",
            "branchId": str(branch.id),
            "role": "TEACHER",
        },
        format="json",
    )

    assert response.status_code == 201
    body = response.json()["data"]
    assert body["userId"]
    assert body["inviteDelivery"]["status"] == "PENDING_OTP"
    assert "token" not in str(response.json()).lower()
    assert not StaffInvitation.objects.exists()
    user = User.objects.get(email="meera@northstar.test")
    assert user.is_active is False
    assert user.otp_required is True


@pytest.mark.django_db
def test_staff_creation_does_not_require_email_delivery(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute,
        name="Main Campus",
        code="MAIN",
        is_head_office=True,
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    _authenticate_admin(api_client, admin)

    response = api_client.post(
        "/api/v1/admin/staff",
        {
            "fullName": "Meera Iyer",
            "email": "meera@northstar.test",
            "branchId": str(branch.id),
            "role": "STAFF",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data"]["inviteDelivery"]["status"] == "PENDING_OTP"
    assert not StaffInvitation.objects.exists()
    assert User.objects.get(email="meera@northstar.test").is_active is False
