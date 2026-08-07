import pytest
from rest_framework_simplejwt.tokens import RefreshToken

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


def create_admin_session(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute,
        name="Main Campus",
        code="MAIN",
        is_head_office=True,
    )
    user = User.objects.create_user(
        email="owner@northstar.test",
        password="StrongPass123!",
        first_name="Aarav",
        last_name="Sharma",
    )
    membership = InstituteMembership.objects.create(
        user=user,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": user.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    return user, institute, branch, membership, response.json()["data"]


@pytest.mark.django_db
def test_current_session_revalidates_server_authoritative_tenant_context(api_client):
    user, institute, branch, membership, session = create_admin_session(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['accessToken']}")

    response = api_client.get("/api/v1/identity/sessions/current")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {
            "user": {
                "id": str(user.id),
                "displayName": "Aarav Sharma",
                "roles": ["INSTITUTE_ADMIN"],
                "activeRole": "INSTITUTE_ADMIN",
                "instituteId": str(institute.id),
                "branchIds": [str(branch.id)],
            }
        },
    }

    institute.is_active = False
    institute.save(update_fields=("is_active", "updated_at"))
    response = api_client.get("/api/v1/identity/sessions/current")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "SESSION_CONTEXT_INACTIVE"


@pytest.mark.django_db
def test_refresh_rotates_token_and_returns_same_session_profile(api_client):
    user, institute, branch, membership, session = create_admin_session(api_client)

    response = api_client.post(
        "/api/v1/identity/sessions/refresh",
        {"refreshToken": session["refreshToken"]},
        format="json",
    )

    assert response.status_code == 200
    refreshed = response.json()["data"]
    assert refreshed["accessToken"]
    assert refreshed["refreshToken"]
    assert refreshed["refreshToken"] != session["refreshToken"]
    assert refreshed["user"]["id"] == str(user.id)
    assert refreshed["user"]["instituteId"] == str(institute.id)

    replay = api_client.post(
        "/api/v1/identity/sessions/refresh",
        {"refreshToken": session["refreshToken"]},
        format="json",
    )
    assert replay.status_code == 401


@pytest.mark.django_db
def test_logout_blacklists_refresh_token(api_client):
    user, institute, branch, membership, session = create_admin_session(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['accessToken']}")

    response = api_client.delete(
        "/api/v1/identity/sessions/current",
        {"refreshToken": session["refreshToken"]},
        format="json",
    )

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"signedOut": True},
    }

    api_client.credentials()
    replay = api_client.post(
        "/api/v1/identity/sessions/refresh",
        {"refreshToken": session["refreshToken"]},
        format="json",
    )
    assert replay.status_code == 401


@pytest.mark.django_db
def test_login_rejects_inactive_institute(api_client):
    user, institute, branch, membership, session = create_admin_session(api_client)
    institute.is_active = False
    institute.save(update_fields=("is_active", "updated_at"))

    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": user.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ROLE_NOT_ALLOWED_FOR_CLIENT"


@pytest.mark.django_db
def test_current_session_rejects_token_without_server_selected_membership(api_client):
    user, institute, branch, membership, session = create_admin_session(api_client)
    legacy_access = RefreshToken.for_user(user).access_token
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {legacy_access}")

    response = api_client.get("/api/v1/identity/sessions/current")

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "SESSION_CONTEXT_INACTIVE"
