import pytest

from modules.access_control.models import Permission, Role, RolePermission
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


def admin_session(api_client, code="API"):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    branch = Branch.objects.create(
        institute=institute, name="Main", code="MAIN", is_head_office=True
    )
    user = User.objects.create_user(email=f"admin@{code.lower()}.test", password="pass")
    membership = InstituteMembership.objects.create(
        user=user,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    api_client.force_authenticate(
        user=user, token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    return user, institute, branch


def add_permission(key):
    return Permission.objects.get(permission_key=key)


@pytest.mark.django_db
def test_role_api_is_paginated_wrapped_and_tenant_scoped(api_client):
    user, institute, branch = admin_session(api_client)
    other = Institute.objects.create(name="Other", code="OTHERAPI")
    Role.objects.create(institute=institute, name="Visible")
    Role.objects.create(institute=other, name="Hidden")
    Role.objects.create(is_system_role=True, name="System role")

    response = api_client.get("/api/v1/admin/roles")

    assert response.status_code == 200
    assert response.json()["success"] is True
    data = response.json()["data"]
    assert data["count"] == 6
    assert "Visible" in {item["name"] for item in data["items"]}
    assert "System role" in {item["name"] for item in data["items"]}
    assert "Hidden" not in {item["name"] for item in data["items"]}
    assert data["page"] == 1
    assert data["totalPages"] == 1


@pytest.mark.django_db
def test_role_create_rejects_foreign_branch_without_disclosing_or_writing(api_client):
    user, institute, branch = admin_session(api_client, "TENANTAPI")
    other = Institute.objects.create(name="Other", code="FOREIGNAPI")
    foreign = Branch.objects.create(
        institute=other, name="Foreign", code="MAIN", is_head_office=True
    )
    add_permission("role.create")

    response = api_client.post(
        "/api/v1/admin/roles",
        {
            "name": "Cross tenant",
            "branchId": str(foreign.id),
            "permissionKeys": ["role.create"],
        },
        format="json",
    )

    assert response.status_code == 404
    assert response.json()["success"] is False
    assert not Role.objects.filter(name="Cross tenant").exists()


@pytest.mark.django_db
def test_system_role_is_read_only_but_can_be_cloned(api_client):
    user, institute, branch = admin_session(api_client, "SYSTEMAPI")
    role_create = add_permission("role.create")
    system = Role.objects.create(is_system_role=True, name="Test system role")
    RolePermission.objects.create(role=system, permission=role_create)

    response = api_client.patch(
        f"/api/v1/admin/roles/{system.id}", {"name": "Changed"}, format="json"
    )
    assert response.status_code == 400
    system.refresh_from_db()
    assert system.name == "Test system role"

    response = api_client.post(
        f"/api/v1/admin/roles/{system.id}/clone", {"name": "Custom Teacher"}, format="json"
    )
    assert response.status_code == 201
    assert response.json()["data"]["permissionGrants"][0]["permissionKey"] == "role.create"
    assert Role.objects.get(name="Custom Teacher").institute == institute


@pytest.mark.django_db
def test_assignment_endpoints_never_cross_tenant_and_revoke_is_wrapped(api_client):
    actor, institute, branch = admin_session(api_client, "ASSIGNAPI")
    add_permission("role.assign")
    target = User.objects.create_user(email="target@assign-api.test", password="pass")
    InstituteMembership.objects.create(
        user=target,
        institute=institute,
        branch=branch,
        role=InstituteMembership.Role.STAFF,
    )
    role = Role.objects.create(institute=institute, branch=branch, name="Coordinator")

    response = api_client.post(
        "/api/v1/admin/role-assignments",
        {"userId": str(target.id), "roleId": str(role.id), "branchId": str(branch.id)},
        format="json",
    )
    assert response.status_code == 201
    assignment_id = response.json()["data"]["id"]

    other = Institute.objects.create(name="Other", code="OTHERASSIGN")
    other_branch = Branch.objects.create(
        institute=other, name="Other main", code="MAIN", is_head_office=True
    )
    foreign_role = Role.objects.create(institute=other, branch=other_branch, name="Foreign")
    response = api_client.post(
        "/api/v1/admin/role-assignments",
        {
            "userId": str(target.id),
            "roleId": str(foreign_role.id),
            "branchId": str(branch.id),
        },
        format="json",
    )
    assert response.status_code == 404

    response = api_client.post(f"/api/v1/admin/role-assignments/{assignment_id}/revoke", {}, format="json")
    assert response.status_code == 200
    assert response.json()["success"] is True
    assert response.json()["data"]["isActive"] is False


@pytest.mark.django_db
def test_delete_custom_role(api_client):
    user, institute, branch = admin_session(api_client, "DELETEAPI")
    add_permission("role.manage_permissions")
    role = Role.objects.create(institute=institute, name="Custom To Delete")

    response = api_client.delete(f"/api/v1/admin/roles/{role.id}")
    assert response.status_code == 204
    assert not Role.objects.filter(id=role.id).exists()

