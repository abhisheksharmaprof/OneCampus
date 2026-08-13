import pytest

from modules.documents.models import DocumentTemplate
from modules.documents.presets import PRESETS
from modules.documents.validators import validate_layout
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


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


def test_every_preset_layout_is_valid():
    for category, presets in PRESETS.items():
        assert len(presets) == 3, f"{category} must ship exactly 3 presets"
        assert sum(1 for preset in presets if preset["is_default"]) == 1
        for preset in presets:
            validate_layout(preset["layout"], category=category)
            ids = [
                element["id"]
                for page in preset["layout"]["pages"]
                for element in page["elements"]
            ]
            assert len(ids) == len(set(ids)), f"duplicate element ids in {preset['name']}"


@pytest.mark.django_db
def test_first_list_seeds_presets_per_category(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    invoices = api_client.get("/api/v1/admin/documents/templates?category=FEE_INVOICE")
    invoices_again = api_client.get("/api/v1/admin/documents/templates?category=FEE_INVOICE")
    everything = api_client.get("/api/v1/admin/documents/templates?pageSize=100")

    assert len(invoices.json()["data"]["items"]) == 3
    assert len(invoices_again.json()["data"]["items"]) == 3  # idempotent
    assert len(everything.json()["data"]["items"]) == len(PRESETS) * 3
    for category in PRESETS:
        assert DocumentTemplate.objects.filter(
            institute=institute, category=category, is_default=True
        ).count() == 1
