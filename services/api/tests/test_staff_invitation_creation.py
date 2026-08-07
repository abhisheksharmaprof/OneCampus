import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.invitations import delivery
from modules.people.invitations.models import StaffInvitation


def _authenticate_admin(api_client, admin):
    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['data']['accessToken']}")


@pytest.mark.django_db
def test_staff_creation_issues_hashed_token_and_reports_delivery(api_client, monkeypatch):
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
    delivered = {}

    def capture_delivery(*, invitation, raw_token):
        delivered.update(invitation=invitation, raw_token=raw_token)

    monkeypatch.setattr(delivery, "deliver_staff_setup_invitation", capture_delivery)
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
    assert body["inviteDelivery"]["status"] == "SENT"
    assert "token" not in str(response.json()).lower()

    invitation = StaffInvitation.objects.get()
    _, secret = delivered["raw_token"].split(".", 1)
    assert invitation.token_hash != delivered["raw_token"]
    assert invitation.token_hash != secret
    assert invitation.secret_matches(secret)
    assert invitation.expires_at > invitation.created_at


@pytest.mark.django_db
def test_staff_creation_survives_delivery_failure_and_reports_it(api_client, monkeypatch):
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

    def fail_delivery(**kwargs):
        raise RuntimeError("provider unavailable")

    monkeypatch.setattr(delivery, "deliver_staff_setup_invitation", fail_delivery)
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
    assert response.json()["data"]["inviteDelivery"]["status"] == "FAILED"
    assert StaffInvitation.objects.get().delivery_status == "FAILED"
    assert User.objects.get(email="meera@northstar.test").is_active is False
