import pytest

from modules.documents.models import DocumentTemplate
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


def valid_layout(pages=1):
    return {
        "version": 2,
        "page": {"sizeId": "A4P" if pages == 1 else "CR80", "marginMm": 10, "background": "#FFFFFF"},
        "zones": {"headerMm": 24, "footerMm": 18, "repeatHeader": True, "repeatFooter": True, "hideHeaderOnFirstPage": False},
        "watermark": {"enabled": False, "mode": "text", "text": "SAMPLE", "imageUrl": "", "opacity": 0.07},
        "pages": [{"elements": []} for _ in range(pages)],
    }


@pytest.mark.django_db
def test_create_list_patch_default_switch_and_category_filter(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    created = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "My invoice", "category": "FEE_INVOICE", "layout": valid_layout(), "isDefault": True},
        format="json",
    )
    other_category = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "My card", "category": "ID_CARD", "layout": valid_layout(pages=2), "isDefault": True},
        format="json",
    )
    template_id = created.json()["data"]["id"]
    listed = api_client.get("/api/v1/admin/documents/templates?category=FEE_INVOICE")
    renamed = api_client.patch(
        f"/api/v1/admin/documents/templates/{template_id}", {"name": "Renamed"}, format="json"
    )
    second_default = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Newer invoice", "category": "FEE_INVOICE", "layout": valid_layout(), "isDefault": True},
        format="json",
    )

    assert created.status_code == 201
    assert other_category.status_code == 201
    assert [item["name"] for item in listed.json()["data"]["items"]] == ["My invoice"]
    assert renamed.json()["data"]["name"] == "Renamed"
    assert second_default.status_code == 201
    defaults = DocumentTemplate.objects.filter(
        institute=institute, category="FEE_INVOICE", is_default=True
    )
    assert defaults.count() == 1 and defaults.first().name == "Newer invoice"


@pytest.mark.django_db
def test_layout_validation_delete_rules_and_tenant_isolation(api_client):
    institute, token = make_admin(api_client)
    other_institute, _ = make_admin(api_client, code="OTHER")
    foreign = DocumentTemplate.objects.create(
        institute=other_institute, name="Foreign", category="FEE_INVOICE", layout=valid_layout()
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    bad_layout = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Bad", "category": "FEE_INVOICE", "layout": {"version": 1}},
        format="json",
    )
    two_page_invoice = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Bad pages", "category": "FEE_INVOICE", "layout": valid_layout(pages=2)},
        format="json",
    )
    default = DocumentTemplate.objects.create(
        institute=institute, name="Default", category="MARKSHEET",
        layout=valid_layout(), is_default=True,
    )
    extra = DocumentTemplate.objects.create(
        institute=institute, name="Extra", category="MARKSHEET", layout=valid_layout()
    )
    delete_default = api_client.delete(f"/api/v1/admin/documents/templates/{default.id}")
    delete_extra = api_client.delete(f"/api/v1/admin/documents/templates/{extra.id}")
    foreign_get = api_client.get(f"/api/v1/admin/documents/templates/{foreign.id}")
    foreign_delete = api_client.delete(f"/api/v1/admin/documents/templates/{foreign.id}")

    assert bad_layout.status_code == 400
    assert two_page_invoice.status_code == 400
    assert delete_default.status_code == 400
    assert delete_extra.status_code == 204
    assert foreign_get.status_code == 404
    assert foreign_delete.status_code == 404
    assert DocumentTemplate.objects.filter(id=foreign.id).exists()
