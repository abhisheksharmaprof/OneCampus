import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from platform_core.models import AuditEvent


def make_admin(api_client, *, code="NSA"):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    Branch.objects.create(
        institute=institute, name="Main Campus", code=f"{code}-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email=f"admin@{code.lower()}.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    return institute, login.json()["data"]["accessToken"]


@pytest.mark.django_db
def test_settings_get_creates_defaults_and_patch_updates(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    initial = api_client.get("/api/v1/admin/finance/settings")
    updated = api_client.patch(
        "/api/v1/admin/finance/settings",
        {"invoicePrefix": "FEE", "taxLabel": "GST", "taxPercent": "18.00",
         "invoiceFooter": "Pay within 15 days."},
        format="json",
    )
    bad_prefix = api_client.patch(
        "/api/v1/admin/finance/settings", {"invoicePrefix": "no spaces!"}, format="json"
    )
    bad_tax = api_client.patch(
        "/api/v1/admin/finance/settings", {"taxPercent": "180.00"}, format="json"
    )

    assert initial.json()["data"]["invoicePrefix"] == "INV"
    data = updated.json()["data"]
    assert data["invoicePrefix"] == "FEE"
    assert data["taxLabel"] == "GST"
    assert data["taxPercent"] == "18.00"
    assert bad_prefix.status_code == 400
    assert bad_tax.status_code == 400
    assert AuditEvent.objects.filter(
        institute=institute, target_type="finance_settings"
    ).exists()
