import pytest

from modules.finance.models import InvoiceTemplate
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


@pytest.mark.django_db
def test_first_list_seeds_presets(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = api_client.get("/api/v1/admin/fees/templates")

    items = response.json()["data"]["items"]
    names = {item["name"] for item in items}
    assert names == {"Classic letterhead", "Modern colour band", "Compact counter receipt"}
    assert sum(1 for item in items if item["isDefault"]) == 2  # one default per kind
    kinds = {item["kind"] for item in items}
    assert kinds == {"INVOICE", "RECEIPT"}
    # Second call does not duplicate.
    api_client.get("/api/v1/admin/fees/templates")
    assert InvoiceTemplate.objects.filter(institute=institute).count() == 3


@pytest.mark.django_db
def test_create_update_and_default_switching(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    api_client.get("/api/v1/admin/fees/templates")  # seed

    created = api_client.post(
        "/api/v1/admin/fees/templates",
        {
            "name": "My template",
            "kind": "INVOICE",
            "isDefault": True,
            "layout": {"header": {"title": "TAX INVOICE"}},
        },
        format="json",
    )
    template_id = created.json()["data"]["id"]
    renamed = api_client.patch(
        f"/api/v1/admin/fees/templates/{template_id}", {"name": "Renamed"}, format="json"
    )

    assert created.status_code == 201
    assert renamed.json()["data"]["name"] == "Renamed"
    defaults = InvoiceTemplate.objects.filter(
        institute=institute, kind="INVOICE", is_default=True
    )
    assert list(defaults.values_list("id", flat=True)) == [defaults.first().id]
    assert str(defaults.first().id) == template_id


@pytest.mark.django_db
def test_delete_blocked_for_default_template_and_foreign_access(api_client):
    institute, token = make_admin(api_client)
    other_institute, _ = make_admin(api_client, code="OTHER")
    foreign = InvoiceTemplate.objects.create(
        institute=other_institute, name="Foreign", kind="INVOICE"
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    api_client.get("/api/v1/admin/fees/templates")  # seed
    default = InvoiceTemplate.objects.filter(
        institute=institute, kind="INVOICE", is_default=True
    ).first()
    extra = InvoiceTemplate.objects.create(institute=institute, name="Extra", kind="INVOICE")

    delete_default = api_client.delete(f"/api/v1/admin/fees/templates/{default.id}")
    delete_extra = api_client.delete(f"/api/v1/admin/fees/templates/{extra.id}")
    delete_foreign = api_client.delete(f"/api/v1/admin/fees/templates/{foreign.id}")

    assert delete_default.status_code == 400
    assert delete_extra.status_code == 204
    assert delete_foreign.status_code == 404


@pytest.mark.django_db
def test_layout_must_be_object_and_default_kind_locked(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    api_client.get("/api/v1/admin/fees/templates")  # seed
    default = InvoiceTemplate.objects.get(
        institute=institute, kind="INVOICE", is_default=True
    )

    bad_layout = api_client.post(
        "/api/v1/admin/fees/templates",
        {"name": "Bad", "kind": "INVOICE", "layout": ["not", "a", "dict"]},
        format="json",
    )
    kind_change = api_client.patch(
        f"/api/v1/admin/fees/templates/{default.id}", {"kind": "RECEIPT"}, format="json"
    )

    assert bad_layout.status_code == 400
    assert kind_change.status_code == 400
    assert InvoiceTemplate.objects.filter(
        institute=institute, kind="INVOICE", is_default=True
    ).count() == 1
