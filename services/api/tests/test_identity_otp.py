from datetime import timedelta

import pytest
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone

from modules.identity.models import OtpChallenge, User
from modules.institutes.models import Institute, InstituteMembership

PASSWORD = "StrongPass123!"


@pytest.fixture
def otp_user():
    institute = Institute.objects.create(name="OTP Academy", code="OTP")
    user = User.objects.create_user(
        email="mfa@campusone.test",
        password=PASSWORD,
        first_name="Mira",
        otp_required=True,
    )
    InstituteMembership.objects.create(
        user=user,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    return user


@pytest.fixture
def delivered_codes(monkeypatch):
    deliveries = []

    def capture(*, user, code):
        deliveries.append({"user": user, "code": code})

    monkeypatch.setattr("modules.identity.api.views.deliver_otp_code", capture)
    return deliveries


def request_challenge(api_client, user):
    return api_client.post(
        "/api/v1/identity/sessions",
        {"email": user.email, "password": PASSWORD, "client": "admin-web"},
        format="json",
    )


@pytest.mark.django_db
def test_password_login_requests_otp_without_exposing_raw_code(
    api_client, otp_user, delivered_codes
):
    response = request_challenge(api_client, otp_user)

    assert response.status_code == 409
    payload = response.json()
    assert payload["error"]["code"] == "OTP_REQUIRED"
    details = payload["error"]["details"]
    assert details["challengeId"]
    assert details["destination"] == "m***@campusone.test"
    challenge = OtpChallenge.objects.get(id=details["challengeId"])
    raw_code = delivered_codes[0]["code"]
    assert raw_code not in str(payload)
    assert raw_code.isdigit() and len(raw_code) == 6
    assert raw_code not in challenge.code_hash
    assert challenge.code_matches(raw_code)


@pytest.mark.django_db
def test_correct_otp_issues_session_and_challenge_cannot_be_reused(
    api_client, otp_user, delivered_codes
):
    challenge_response = request_challenge(api_client, otp_user).json()
    challenge_id = challenge_response["error"]["details"]["challengeId"]
    code = delivered_codes[-1]["code"]

    response = api_client.post(
        "/api/v1/identity/sessions/otp",
        {"challengeId": challenge_id, "code": code},
        format="json",
    )

    assert response.status_code == 200
    assert response.json()["data"]["accessToken"]
    assert response.json()["data"]["user"]["id"] == str(otp_user.id)
    assert OtpChallenge.objects.get(id=challenge_id).consumed_at is not None

    replay = api_client.post(
        "/api/v1/identity/sessions/otp",
        {"challengeId": challenge_id, "code": code},
        format="json",
    )
    assert replay.status_code == 409
    assert replay.json()["error"]["code"] == "OTP_CHALLENGE_CONSUMED"


@pytest.mark.django_db
def test_incorrect_otp_counts_attempts_and_locks_challenge(api_client, otp_user, delivered_codes):
    challenge_id = request_challenge(api_client, otp_user).json()["error"]["details"]["challengeId"]
    actual_code = delivered_codes[-1]["code"]
    wrong_code = "000000" if actual_code != "000000" else "111111"

    for expected_remaining in range(4, 0, -1):
        response = api_client.post(
            "/api/v1/identity/sessions/otp",
            {"challengeId": challenge_id, "code": wrong_code},
            format="json",
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "OTP_INVALID_CODE"
        assert response.json()["error"]["details"]["attemptsRemaining"] == expected_remaining

    locked = api_client.post(
        "/api/v1/identity/sessions/otp",
        {"challengeId": challenge_id, "code": wrong_code},
        format="json",
    )
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "OTP_ATTEMPTS_EXCEEDED"

    correct_after_lock = api_client.post(
        "/api/v1/identity/sessions/otp",
        {"challengeId": challenge_id, "code": actual_code},
        format="json",
    )
    assert correct_after_lock.status_code == 429
    assert OtpChallenge.objects.get(id=challenge_id).attempts == 5


@pytest.mark.django_db
def test_expired_otp_is_rejected(api_client, otp_user, delivered_codes):
    challenge_id = request_challenge(api_client, otp_user).json()["error"]["details"]["challengeId"]
    OtpChallenge.objects.filter(id=challenge_id).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )

    response = api_client.post(
        "/api/v1/identity/sessions/otp",
        {"challengeId": challenge_id, "code": delivered_codes[-1]["code"]},
        format="json",
    )

    assert response.status_code == 410
    assert response.json()["error"]["code"] == "OTP_CHALLENGE_EXPIRED"


@pytest.mark.django_db
def test_resend_consumes_old_challenge_and_delivers_new_code(api_client, otp_user, delivered_codes):
    first = request_challenge(api_client, otp_user).json()["error"]["details"]

    response = api_client.post(
        "/api/v1/identity/sessions/otp/resend",
        {"challengeId": first["challengeId"]},
        format="json",
    )

    assert response.status_code == 200
    replacement = response.json()["data"]
    assert replacement["challengeId"] != first["challengeId"]
    assert len(delivered_codes) == 2
    assert OtpChallenge.objects.get(id=first["challengeId"]).consumed_at is not None

    old_response = api_client.post(
        "/api/v1/identity/sessions/otp",
        {"challengeId": first["challengeId"], "code": delivered_codes[0]["code"]},
        format="json",
    )
    assert old_response.status_code == 409
    assert old_response.json()["error"]["code"] == "OTP_CHALLENGE_CONSUMED"

    verified = api_client.post(
        "/api/v1/identity/sessions/otp",
        {"challengeId": replacement["challengeId"], "code": delivered_codes[1]["code"]},
        format="json",
    )
    assert verified.status_code == 200


@pytest.mark.django_db
@override_settings(
    REST_FRAMEWORK={
        "DEFAULT_THROTTLE_RATES": {"identity-login": "2/minute"},
        "EXCEPTION_HANDLER": "platform_core.api.exceptions.api_exception_handler",
    }
)
def test_otp_verification_is_rate_limited(api_client):
    cache.clear()
    payload = {
        "challengeId": "00000000-0000-0000-0000-000000000000",
        "code": "123456",
    }

    first = api_client.post("/api/v1/identity/sessions/otp", payload, format="json")
    second = api_client.post("/api/v1/identity/sessions/otp", payload, format="json")
    assert first.status_code == 400
    assert second.status_code == 400
    response = api_client.post("/api/v1/identity/sessions/otp", payload, format="json")

    assert response.status_code == 429
    assert response.json()["error"]["code"] == "throttled"
