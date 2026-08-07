from datetime import timedelta

import pytest
from django.test import override_settings
from django.utils import timezone

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.invitations.models import StaffInvitation
from modules.people.invitations.services import issue_staff_invitation
from modules.people.models import StaffProfile


def _pending_staff():
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute,
        name="Main Campus",
        code="MAIN",
        is_head_office=True,
    )
    user = User.objects.create_user(
        email="meera@northstar.test",
        password=None,
        is_active=False,
    )
    InstituteMembership.objects.create(
        user=user,
        institute=institute,
        branch=branch,
        role=InstituteMembership.Role.TEACHER,
    )
    profile = StaffProfile.objects.create(institute=institute, user=user)
    return user, profile


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="modules.people.invitations.urls")
def test_public_validation_and_password_setup_are_single_use(api_client):
    user, profile = _pending_staff()
    issued = issue_staff_invitation(staff_profile=profile)

    validated = api_client.post(
        "/staff-invitations/validate",
        {"token": issued.raw_token},
        format="json",
    )
    assert validated.status_code == 200
    assert validated.json()["data"]["valid"] is True

    setup = api_client.post(
        "/staff-invitations/setup",
        {"token": issued.raw_token, "password": "A-New-Strong-Passphrase-2026!"},
        format="json",
    )
    assert setup.status_code == 200
    user.refresh_from_db()
    profile.refresh_from_db()
    issued.invitation.refresh_from_db()
    assert user.is_active is True
    assert user.check_password("A-New-Strong-Passphrase-2026!")
    assert profile.invite_pending is False
    assert issued.invitation.consumed_at is not None

    reused = api_client.post(
        "/staff-invitations/setup",
        {"token": issued.raw_token, "password": "Another-Strong-Passphrase-2026!"},
        format="json",
    )
    assert reused.status_code == 400
    assert reused.json()["error"]["code"] == "STAFF_INVITATION_INVALID"


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="modules.people.invitations.urls")
def test_invalid_expired_and_exhausted_tokens_use_same_generic_error(api_client):
    _, profile = _pending_staff()
    issued = issue_staff_invitation(staff_profile=profile)
    selector, _ = issued.raw_token.split(".", 1)
    wrong_token = f"{selector}.wrong-secret"

    wrong = api_client.post(
        "/staff-invitations/validate", {"token": wrong_token}, format="json"
    )
    malformed = api_client.post(
        "/staff-invitations/validate", {"token": "not-a-token"}, format="json"
    )
    assert wrong.status_code == malformed.status_code == 400
    assert wrong.json()["error"] == malformed.json()["error"]
    issued.invitation.refresh_from_db()
    assert issued.invitation.attempts == 1

    issued.invitation.expires_at = timezone.now() - timedelta(seconds=1)
    issued.invitation.save(update_fields=("expires_at", "updated_at"))
    expired = api_client.post(
        "/staff-invitations/validate", {"token": issued.raw_token}, format="json"
    )
    assert expired.json()["error"] == wrong.json()["error"]


@pytest.mark.django_db
@override_settings(
    ROOT_URLCONF="modules.people.invitations.urls",
    STAFF_INVITATION_RESEND_COOLDOWN=0,
)
def test_admin_resend_invalidates_previous_token_and_is_tenant_scoped(api_client):
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    _, profile = _pending_staff()
    membership = InstituteMembership.objects.create(
        user=admin,
        institute=profile.institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    first = issue_staff_invitation(staff_profile=profile)

    from rest_framework_simplejwt.tokens import AccessToken

    token = AccessToken.for_user(admin)
    token["client"] = "admin-web"
    token["membership_id"] = str(membership.id)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    with override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend"):
        resent = api_client.post(f"/admin/staff/{profile.id}/invitation/resend", format="json")
    assert resent.status_code == 200
    assert resent.json()["data"]["inviteDelivery"]["status"] == "SENT"
    first.invitation.refresh_from_db()
    assert first.invitation.invalidated_at is not None
    assert StaffInvitation.objects.filter(staff_profile=profile).count() == 2

    old = api_client.post(
        "/staff-invitations/validate", {"token": first.raw_token}, format="json"
    )
    assert old.status_code == 400
