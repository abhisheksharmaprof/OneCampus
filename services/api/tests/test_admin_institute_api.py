import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteAssociation, InstituteMembership


def authenticate_admin(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    head_office = Branch.objects.create(
        institute=institute,
        name="Main Campus",
        code="MAIN",
        is_head_office=True,
    )
    user = User.objects.create_user(
        email="admin@northstar.test",
        password="StrongPass123!",
        first_name="Aarav",
        last_name="Sharma",
    )
    InstituteMembership.objects.create(
        user=user,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": user.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")
    return user, institute, head_office


@pytest.mark.django_db
def test_admin_can_read_and_update_only_the_current_institute(api_client):
    user, institute, head_office = authenticate_admin(api_client)
    other = Institute.objects.create(name="Other Institute", code="OTHER")

    response = api_client.get("/api/v1/admin/institute")

    assert response.status_code == 200
    res_data = response.json()
    assert res_data["success"] is True
    assert res_data["data"]["id"] == str(institute.id)
    assert res_data["data"]["name"] == "Northstar Academy"
    assert res_data["data"]["code"] == "NSA"
    assert res_data["data"]["isActive"] is True

    response = api_client.patch(
        "/api/v1/admin/institute",
        {"name": "Northstar International Academy"},
        format="json",
    )

    assert response.status_code == 200
    institute.refresh_from_db()
    other.refresh_from_db()
    assert institute.name == "Northstar International Academy"
    assert other.name == "Other Institute"


@pytest.mark.django_db
def test_admin_cannot_write_system_owned_institute_fields(api_client):
    user, institute, head_office = authenticate_admin(api_client)

    response = api_client.patch(
        "/api/v1/admin/institute",
        {"code": "TAKEOVER", "isActive": False},
        format="json",
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    institute.refresh_from_db()
    assert institute.code == "NSA"
    assert institute.is_active is True

    response = api_client.patch("/api/v1/admin/institute", {}, format="json")
    assert response.status_code == 400


@pytest.mark.django_db
def test_admin_lists_only_current_institute_branches(api_client):
    user, institute, head_office = authenticate_admin(api_client)
    second = Branch.objects.create(institute=institute, name="North Campus", code="NORTH")
    other = Institute.objects.create(name="Other Institute", code="OTHER")
    Branch.objects.create(institute=other, name="Hidden Campus", code="HIDDEN")

    response = api_client.get("/api/v1/admin/branches")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["count"] == 2
    assert {item["id"] for item in payload["items"]} == {
        str(head_office.id),
        str(second.id),
    }
    assert all("instituteId" not in item for item in payload["items"])


@pytest.mark.django_db
def test_admin_creates_branch_with_server_generated_code(api_client):
    user, institute, head_office = authenticate_admin(api_client)

    response = api_client.post(
        "/api/v1/admin/branches",
        {"name": "East Campus", "timezone": "Asia/Kolkata"},
        format="json",
    )

    assert response.status_code == 201
    created = response.json()["data"]
    assert created["name"] == "East Campus"
    assert created["code"].startswith("EAST-CAMPUS-")
    assert len(created["code"]) <= 32
    branch = Branch.objects.get(id=created["id"])
    assert branch.institute_id == institute.id
    assert branch.is_head_office is False


@pytest.mark.django_db
def test_admin_cannot_supply_branch_code_or_head_office_status(api_client):
    user, institute, head_office = authenticate_admin(api_client)

    response = api_client.post(
        "/api/v1/admin/branches",
        {"name": "East Campus", "code": "CUSTOM", "isHeadOffice": True},
        format="json",
    )

    assert response.status_code == 400
    assert Branch.objects.filter(institute=institute).count() == 1


@pytest.mark.django_db
def test_branch_update_is_tenant_scoped_and_head_office_cannot_be_deactivated(api_client):
    user, institute, head_office = authenticate_admin(api_client)
    branch = Branch.objects.create(institute=institute, name="North Campus", code="NORTH")
    other = Institute.objects.create(name="Other Institute", code="OTHER")
    foreign_branch = Branch.objects.create(
        institute=other,
        name="Foreign Campus",
        code="FOREIGN",
    )

    response = api_client.patch(
        f"/api/v1/admin/branches/{foreign_branch.id}",
        {"name": "Compromised"},
        format="json",
    )
    assert response.status_code == 404

    response = api_client.patch(
        f"/api/v1/admin/branches/{branch.id}",
        {"name": "North City Campus", "isActive": False},
        format="json",
    )
    assert response.status_code == 200
    branch.refresh_from_db()
    assert branch.name == "North City Campus"
    assert branch.is_active is False

    response = api_client.patch(
        f"/api/v1/admin/branches/{head_office.id}",
        {"isActive": False},
        format="json",
    )
    assert response.status_code == 400
    head_office.refresh_from_db()
    assert head_office.is_active is True


@pytest.mark.django_db
def test_admin_links_existing_peer_symmetrically_without_tenant_data_access(api_client):
    user, institute, _ = authenticate_admin(api_client)
    peer = Institute.objects.create(
        name="Independent Academy", code="INDEPENDENT", city="Bengaluru"
    )
    Branch.objects.create(institute=peer, name="Main Campus", code="MAIN", is_head_office=True)

    response = api_client.post(
        "/api/v1/admin/institute-associations",
        {"action": "link", "instituteId": str(peer.id)},
        format="json",
    )

    assert response.status_code == 201
    assert InstituteAssociation.objects.count() == 1
    assert InstituteMembership.objects.filter(user=user, institute=peer).exists() is False
    assert response.json()["data"]["id"] == str(peer.id)
    assert "studentCount" not in response.json()["data"]

    response = api_client.get("/api/v1/admin/institute-associations")
    assert response.status_code == 200
    assert response.json()["data"]["items"][0]["id"] == str(peer.id)

    # The same link in the reverse direction is still one symmetric association.
    association = InstituteAssociation.objects.get()
    assert association.other_institute(institute) == peer


@pytest.mark.django_db
def test_admin_creates_a_peer_as_an_independent_institute(api_client):
    user, institute, _ = authenticate_admin(api_client)

    response = api_client.post(
        "/api/v1/admin/institute-associations",
        {
            "action": "create",
            "name": "Greenwood International School",
            "city": "Hyderabad",
            "state": "Telangana",
            "email": "office@greenwood.test",
        },
        format="json",
    )

    assert response.status_code == 201
    peer = Institute.objects.get(id=response.json()["data"]["id"])
    assert peer.id != institute.id
    assert peer.code.startswith("GREENWOOD-INTERNATI-")
    assert peer.branches.filter(is_head_office=True, name="Main Campus").exists()
    assert InstituteAssociation.objects.filter(
        institute_one__in=(institute, peer), institute_two__in=(institute, peer)
    ).count() == 1
    assert InstituteMembership.objects.filter(
        user=user, institute=peer, role=InstituteMembership.Role.INSTITUTE_ADMIN
    ).exists()
