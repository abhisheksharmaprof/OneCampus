import pytest
from django.contrib.auth import get_user_model

from modules.institutes.models import Institute


@pytest.mark.django_db
def test_minimum_application_reserves_slug_without_creating_branch(api_client):
    response = api_client.post(
        "/api/v1/institute-onboarding/applications",
        {
            "account": {"fullName": "Aarav Sharma", "email": "owner@stepnext.test", "password": "StrongPass123!"},
            "institute": {"legalName": "Step Next Academy", "displayName": "Step Next", "slug": "stepnextacademy"},
            "consents": {"authorized": True, "terms": True},
        },
        format="json",
    )
    assert response.status_code == 201
    institute = Institute.objects.get(slug="stepnextacademy")
    assert institute.onboarding_status == Institute.OnboardingStatus.PENDING_REVIEW
    assert institute.branches.count() == 0
    assert response.data["data"]["onboarding"]["status"] == "pending_review"


@pytest.mark.django_db
def test_platform_admin_can_approve_and_expose_public_institute_config(api_client):
    application = api_client.post(
        "/api/v1/institute-onboarding/applications",
        {
            "account": {"fullName": "Maya Chen", "email": "owner@oakridge.test", "password": "StrongPass123!"},
            "institute": {"legalName": "Oakridge Public School", "displayName": "Oakridge", "slug": "oakridge"},
            "consents": {"authorized": True, "terms": True},
        },
        format="json",
    )
    institute = Institute.objects.get(slug="oakridge")
    admin = get_user_model().objects.create_superuser(email="platform@example.test", password="StrongPass123!")
    login = api_client.post("/api/v1/identity/sessions", {"email": admin.email, "password": "StrongPass123!", "client": "platform-admin"}, format="json")
    assert login.status_code == 200
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['data']['accessToken']}")
    queue = api_client.get("/api/v1/admin/platform/registrations")
    assert queue.status_code == 200
    approved = api_client.post(f"/api/v1/admin/platform/registrations/{institute.id}/approve", {}, format="json")
    assert approved.status_code == 200
    institute.refresh_from_db()
    assert institute.onboarding_status == Institute.OnboardingStatus.APPROVED
    public = api_client.get("/api/v1/institute-onboarding/public/oakridge")
    assert public.status_code == 200
    assert public.data["data"]["publicUrl"] == "https://oakridge.arkailabs.com"
