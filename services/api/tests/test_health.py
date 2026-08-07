import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_liveness_uses_stable_success_envelope(client):
    response = client.get(reverse("health"))

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"status": "ok", "service": "campusone-api"},
    }


@pytest.mark.django_db
def test_readiness_checks_database_and_reports_redis_policy(client):
    response = client.get(reverse("readiness"))

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["status"] == "ready"
    assert payload["data"]["services"]["database"] == "ok"
    assert payload["data"]["services"]["redis"] in {"ok", "skipped"}
