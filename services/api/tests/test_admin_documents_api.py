import pytest

from modules.documents.models import DocumentTemplate, DocumentTemplateVersion
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


@pytest.mark.django_db
def test_category_change_revalidates_stored_layout(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    card = DocumentTemplate.objects.create(
        institute=institute, name="Card", category="ID_CARD", layout=valid_layout(pages=2)
    )

    response = api_client.patch(
        f"/api/v1/admin/documents/templates/{card.id}", {"category": "FEE_INVOICE"}, format="json"
    )

    assert response.status_code == 400
    card.refresh_from_db()
    assert card.category == "ID_CARD"


@pytest.mark.django_db
def test_create_v3_template_accepts_multiple_tables(api_client):
    _, token = make_admin(api_client, code="V3DOC")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4P",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 10, "right": 10, "bottom": 10, "left": 10},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "page-1", "elements": [
            {
                "id": "a", "type": "table", "xMm": 10, "yMm": 10,
                "widthMm": 80, "heightMm": 20, "mode": "static", "cells": [],
            },
            {
                "id": "b", "type": "table", "xMm": 10, "yMm": 40,
                "widthMm": 80, "heightMm": 20, "mode": "dynamic",
                "datasetId": "marks", "columns": [],
            },
        ]}],
        "watermark": {"mode": "none"},
    }

    response = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "V3 marksheet", "category": "MARKSHEET", "layout": layout},
        format="json",
    )

    assert response.status_code == 201
    assert response.json()["data"]["layout"] == layout
    assert response.json()["data"]["revision"] == 1


@pytest.mark.django_db
def test_v3_layout_save_requires_current_revision(api_client):
    _, token = make_admin(api_client, code="V3REV")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4P",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "page-1", "elements": []}],
        "watermark": {"mode": "none"},
    }
    created = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Revisioned", "category": "MARKSHEET", "layout": layout},
        format="json",
    )
    template_id = created.json()["data"]["id"]
    update = api_client.patch(
        f"/api/v1/admin/documents/templates/{template_id}",
        {"layout": {**layout, "zones": {"headerMm": 5, "footerMm": 0}}, "expectedRevision": 1},
        format="json",
    )
    stale = api_client.patch(
        f"/api/v1/admin/documents/templates/{template_id}",
        {"layout": layout, "expectedRevision": 1},
        format="json",
    )

    assert created.status_code == 201
    assert update.status_code == 200
    assert update.json()["data"]["revision"] == 2
    assert stale.status_code == 409
    assert stale.json()["data"]["revision"] == 2


@pytest.mark.django_db
def test_v3_letterhead_publication_is_an_immutable_version(api_client):
    _, token = make_admin(api_client, code="V3MASTER")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4P",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        },
        "zones": {"headerMm": 20, "footerMm": 0},
        "pages": [{"id": "page-1", "elements": []}],
        "watermark": {"mode": "none"},
    }
    created = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Master draft", "category": "LETTERHEAD", "layout": layout},
        format="json",
    )
    template_id = created.json()["data"]["id"]
    published = api_client.post(
        f"/api/v1/admin/documents/templates/{template_id}/publish", {}, format="json"
    )
    edited = api_client.patch(
        f"/api/v1/admin/documents/templates/{template_id}",
        {"layout": {**layout, "zones": {"headerMm": 25, "footerMm": 0}}, "expectedRevision": 1},
        format="json",
    )

    assert created.status_code == 201
    assert published.status_code == 200
    assert published.json()["data"]["publishedVersion"]["layout"] == layout
    assert edited.status_code == 200
    assert edited.json()["data"]["publishedVersion"]["layout"] == layout


@pytest.mark.django_db
def test_v3_cannot_link_a_letterhead_from_another_institute(api_client):
    institute, token = make_admin(api_client, code="V3CHILD")
    other_institute, _ = make_admin(api_client, code="V3FOREIGN")
    foreign_master = DocumentTemplate.objects.create(
        institute=other_institute,
        name="Foreign master",
        category="LETTERHEAD",
        layout=valid_layout(),
    )
    published = DocumentTemplateVersion.objects.create(
        template=foreign_master,
        institute=other_institute,
        version=1,
        name="Foreign master v1",
        layout=valid_layout(),
        published_by=User.objects.get(email="admin@v3foreign.test"),
    )
    foreign_master.published_version = published
    foreign_master.save(update_fields=["published_version"])
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4P",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 10, "right": 10, "bottom": 10, "left": 10},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "page-1", "elements": []}],
        "watermark": {"mode": "none"},
        "masterLetterhead": {
            "templateId": str(foreign_master.id),
            "mode": "followDraft",
        },
    }

    response = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Linked marksheet", "category": "MARKSHEET", "layout": layout},
        format="json",
    )

    assert response.status_code == 400
    assert DocumentTemplate.objects.filter(institute=institute, name="Linked marksheet").count() == 0


@pytest.mark.django_db
def test_v3_rejects_malformed_master_letterhead_id(api_client):
    _, token = make_admin(api_client, code="V3BADID")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4P",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "page-1", "elements": []}],
        "watermark": {"mode": "none"},
        "masterLetterhead": {"templateId": "not-a-uuid", "mode": "followDraft"},
    }

    response = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Bad link", "category": "MARKSHEET", "layout": layout},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_convert_copy_creates_v3_template_without_mutating_v2_original(api_client):
    institute, token = make_admin(api_client, code="CONVERT")
    other_institute, _ = make_admin(api_client, code="OTHERCONVERT")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    v2_layout = valid_layout()
    original = DocumentTemplate.objects.create(
        institute=institute,
        name="Legacy marksheet",
        category="MARKSHEET",
        layout=v2_layout,
        is_default=True,
    )

    # 1. Preview conversion
    preview = api_client.post(
        f"/api/v1/admin/documents/templates/{original.id}/convert-copy",
        {"preview": True},
        format="json",
    )
    assert preview.status_code == 200
    assert preview.json()["data"]["layout"]["version"] == 3
    assert "diagnostics" in preview.json()["data"]
    assert DocumentTemplate.objects.filter(institute=institute).count() == 1

    # 2. Convert and create copy
    created = api_client.post(
        f"/api/v1/admin/documents/templates/{original.id}/convert-copy",
        {"name": "Modern marksheet"},
        format="json",
    )
    assert created.status_code == 201
    created_data = created.json()["data"]
    assert created_data["template"]["name"] == "Modern marksheet"
    assert created_data["template"]["category"] == "MARKSHEET"
    assert created_data["template"]["layout"]["version"] == 3
    assert created_data["template"]["isDefault"] is False
    assert "diagnostics" in created_data

    # 3. Verify original is completely untouched
    original.refresh_from_db()
    assert original.name == "Legacy marksheet"
    assert original.layout["version"] == 2
    assert original.is_default is True

    # 4. Tenant isolation check: other institute cannot convert this template
    other_admin = User.objects.get(email="admin@otherconvert.test")
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": other_admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")
    foreign_resp = api_client.post(
        f"/api/v1/admin/documents/templates/{original.id}/convert-copy",
        {},
        format="json",
    )
    assert foreign_resp.status_code == 404

