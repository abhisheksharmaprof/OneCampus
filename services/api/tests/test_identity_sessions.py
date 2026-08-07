from datetime import timedelta

import pytest
from django.conf import settings
from django.core.cache import cache
from django.test import override_settings

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


@pytest.mark.django_db
def test_admin_login_returns_role_aware_session_profile(api_client):
    institute = Institute.objects.create(name="CampusOne Academy", code="COA")
    branch = Branch.objects.create(institute=institute, name="Central Campus", code="CENTRAL")
    user = User.objects.create_user(
        email="admin@campusone.test",
        password="StrongPass123!",
        first_name="Ananya",
        last_name="Mehta",
    )
    InstituteMembership.objects.create(
        user=user,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )

    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": user.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["accessToken"]
    assert payload["data"]["refreshToken"]
    assert payload["data"]["user"] == {
        "id": str(user.id),
        "displayName": "Ananya Mehta",
        "roles": ["INSTITUTE_ADMIN"],
        "activeRole": "INSTITUTE_ADMIN",
        "instituteId": str(institute.id),
        "branchIds": [str(branch.id)],
    }


@pytest.mark.django_db
def test_admin_credentials_are_rejected_from_staff_mobile(api_client):
    institute = Institute.objects.create(name="CampusOne Academy", code="COA")
    user = User.objects.create_user(email="admin@campusone.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=user,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )

    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": user.email, "password": "StrongPass123!", "client": "staff-mobile"},
        format="json",
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ROLE_NOT_ALLOWED_FOR_CLIENT"


@pytest.mark.django_db
def test_multi_institute_admin_must_select_an_authorized_institute(api_client):
    first = Institute.objects.create(name="First Academy", code="FIRST")
    second = Institute.objects.create(name="Second Academy", code="SECOND")
    user = User.objects.create_user(email="multi@campusone.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=user,
        institute=first,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    InstituteMembership.objects.create(
        user=user,
        institute=second,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )

    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": user.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "INSTITUTE_SELECTION_REQUIRED"
    assert {item["id"] for item in response.json()["error"]["details"]["institutes"]} == {
        str(first.id),
        str(second.id),
    }

    response = api_client.post(
        "/api/v1/identity/sessions",
        {
            "email": user.email,
            "password": "StrongPass123!",
            "client": "admin-web",
            "instituteId": str(second.id),
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["data"]["user"]["instituteId"] == str(second.id)


@pytest.mark.django_db
@override_settings(
    REST_FRAMEWORK={
        "DEFAULT_THROTTLE_RATES": {"identity-login": "2/minute"},
        "EXCEPTION_HANDLER": "platform_core.api.exceptions.api_exception_handler",
    }
)
def test_login_is_rate_limited(api_client):
    cache.clear()
    payload = {
        "email": "missing@campusone.test",
        "password": "WrongPass123!",
        "client": "admin-web",
    }

    assert api_client.post("/api/v1/identity/sessions", payload, format="json").status_code == 400
    assert api_client.post("/api/v1/identity/sessions", payload, format="json").status_code == 400
    response = api_client.post("/api/v1/identity/sessions", payload, format="json")

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "throttled"


def test_refresh_tokens_expire_after_one_day():
    assert settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"] == timedelta(days=1)


