import pytest
from rest_framework_simplejwt.tokens import AccessToken

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


@pytest.mark.django_db
def test_institute_application_without_branches_does_not_create_a_branch(api_client):
    response = api_client.post(
        "/api/v1/institute-onboarding/applications",
        {
            "account": {"fullName": "Aarav Sharma", "phone": "+919876543210"},
            "identity": {"legalName": "Riverdale International School", "displayName": "Riverdale"},
            "contact": {
                "primaryEmail": "owner@riverdale.test",
                "primaryPhone": "+919876543210",
                "contactName": "Aarav Sharma",
                "contactPhone": "+919876543210",
            },
            "hasBranches": False,
            "consents": {"authorized": True, "terms": True},
        },
        format="json",
    )

    assert response.status_code == 201
    assert Institute.objects.count() == 1
    assert Branch.objects.count() == 0


@pytest.mark.django_db
def test_public_onboarding_atomically_creates_tenant_and_email_password_admin(api_client):
    response = api_client.post(
        "/api/v1/institute-onboarding/registrations",
        {
            "instituteName": "Riverdale International School",
            "branchName": "Main Campus",
            "adminName": "Aarav Sharma",
            "email": "Owner@Riverdale.Test",
            "password": "StrongPass123!",
        },
        format="json",
    )

    assert response.status_code == 201
    assert response.data["success"] is True
    assert response.data["data"]["accessToken"]
    assert response.data["data"]["refreshToken"]
    assert response.data["data"]["user"]["activeRole"] == "INSTITUTE_ADMIN"
    assert response.data["data"]["onboarding"]["completed"] is True

    user = User.objects.get()
    institute = Institute.objects.get()
    branch = Branch.objects.get()
    membership = InstituteMembership.objects.get()
    assert user.email == "owner@riverdale.test"
    assert user.first_name == "Aarav"
    assert user.last_name == "Sharma"
    assert user.check_password("StrongPass123!")
    assert institute.name == "Riverdale International School"
    assert institute.code.startswith("RIVERDALE-")
    assert len(institute.code) <= 32
    assert branch.institute == institute
    assert branch.name == "Main Campus"
    assert branch.code == "MAIN"
    assert branch.is_head_office is True
    assert membership.user == user
    assert membership.institute == institute
    assert membership.branch_id is None
    assert membership.role == InstituteMembership.Role.INSTITUTE_ADMIN

    access_token = AccessToken(response.data["data"]["accessToken"])
    assert access_token["membership_id"] == str(membership.id)
    assert access_token["client"] == "admin-web"

    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['data']['accessToken']}")
    current_session = api_client.get("/api/v1/identity/sessions/current")
    assert current_session.status_code == 200
    assert current_session.data["data"]["user"]["instituteId"] == str(institute.id)


@pytest.mark.django_db
def test_onboarding_rejects_existing_email_without_partial_tenant(api_client):
    User.objects.create_user(email="owner@riverdale.test", password="StrongPass123!")

    response = api_client.post(
        "/api/v1/institute-onboarding/registrations",
        {
            "instituteName": "Riverdale International School",
            "branchName": "Main Campus",
            "adminName": "Aarav Sharma",
            "email": "OWNER@RIVERDALE.TEST",
            "password": "StrongPass123!",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["success"] is False
    assert response.data["error"]["code"] == "VALIDATION_ERROR"
    assert "email" in response.data["error"]["fieldErrors"]
    assert Institute.objects.count() == 0
    assert Branch.objects.count() == 0
    assert InstituteMembership.objects.count() == 0


@pytest.mark.django_db
def test_onboarding_rejects_weak_password_with_inline_field_error(api_client):
    response = api_client.post(
        "/api/v1/institute-onboarding/registrations",
        {
            "instituteName": "Riverdale International School",
            "branchName": "Main Campus",
            "adminName": "Aarav Sharma",
            "email": "owner@riverdale.test",
            "password": "password",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "VALIDATION_ERROR"
    assert "password" in response.data["error"]["fieldErrors"]
    assert User.objects.count() == 0
