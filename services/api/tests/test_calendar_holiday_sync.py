from unittest.mock import patch

import pytest
from django.test import override_settings

from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.school_calendar.models import AcademicCalendarEvent
from platform_core.models import AuditEvent
from tests.test_admin_console_api import authenticate


@pytest.fixture
def calendar_admin(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="MAIN", is_head_office=True
    )
    from django.contrib.auth import get_user_model

    admin = get_user_model().objects.create_user(email="calendar@northstar.test")
    membership = InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    authenticate(api_client, admin, membership)
    return api_client, institute, branch


@pytest.mark.django_db
def test_sync_national_holidays_is_idempotent_and_audited(calendar_admin):
    client, institute, _ = calendar_admin
    first = client.post(
        "/api/v1/admin/calendar/sync-holidays",
        {"country": "IN", "year": 2026},
        format="json",
    )
    assert first.status_code == 200
    assert first.json()["success"] is True
    assert first.json()["data"]["count"] > 0
    assert all(event["eventType"] == "HOLIDAY" for event in first.json()["data"]["added"])

    second = client.post(
        "/api/v1/admin/calendar/sync-holidays",
        {"country": "IN", "year": 2026},
        format="json",
    )
    assert second.status_code == 200
    assert second.json()["data"]["count"] == 0
    event_count = AcademicCalendarEvent.objects.filter(
        institute=institute, event_type="HOLIDAY"
    ).count()
    assert event_count == first.json()["data"]["count"]
    assert AuditEvent.objects.filter(institute=institute, event_type="API_POST").exists()


@pytest.mark.django_db
def test_sync_ical_parses_date_and_datetime_and_ignores_duplicate(calendar_admin):
    client, institute, _ = calendar_admin
    feed = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "SUMMARY:Founders Day",
        "DTSTART;VALUE=DATE:20261225", "DTEND;VALUE=DATE:20261226", "END:VEVENT",
        "BEGIN:VEVENT", "SUMMARY:Evening Celebration", "DTSTART:20261231T180000Z",
        "DTEND:20261231T200000Z", "END:VEVENT", "END:VCALENDAR", "",
    ])
    public_dns = patch(
        "modules.school_calendar.api.views.socket.getaddrinfo",
        return_value=[(None, None, None, None, ("93.184.216.34", 443))],
    )
    with override_settings(ALLOWED_HOSTS=["calendar.example", "testserver"]):
        with public_dns:
            with patch("modules.school_calendar.api.views._PinnedHTTPSConnection") as connection:
                connection.return_value.getresponse.return_value.status = 200
                connection.return_value.getresponse.return_value.read.return_value = feed.encode()
                response = client.post(
                    "/api/v1/admin/calendar/sync-holidays",
                    {"icalUrl": "https://calendar.example/public.ics"},
                    format="json",
                )
    assert response.status_code == 200, response.json()
    assert response.json()["data"]["count"] == 2
    imported_titles = {event["title"] for event in response.json()["data"]["added"]}
    assert imported_titles == {"Founders Day", "Evening Celebration"}
    assert AcademicCalendarEvent.objects.filter(
        institute=institute,
        title="Founders Day",
        starts_on="2026-12-25",
        ends_on="2026-12-25",
    ).exists()

    public_dns = patch(
        "modules.school_calendar.api.views.socket.getaddrinfo",
        return_value=[(None, None, None, None, ("93.184.216.34", 443))],
    )
    with override_settings(ALLOWED_HOSTS=["calendar.example", "testserver"]):
        with public_dns:
            with patch("modules.school_calendar.api.views._PinnedHTTPSConnection") as connection:
                connection.return_value.getresponse.return_value.status = 200
                connection.return_value.getresponse.return_value.read.return_value = feed.encode()
                duplicate = client.post(
                    "/api/v1/admin/calendar/sync-holidays",
                    {"icalUrl": "https://calendar.example/public.ics"},
                    format="json",
                )
    assert duplicate.status_code == 200
    assert duplicate.json()["data"]["count"] == 0


@pytest.mark.django_db
def test_ical_fetch_pins_public_ip_and_rejects_redirects(calendar_admin):
    client, _, _ = calendar_admin
    public_dns = patch(
        "modules.school_calendar.api.views.socket.getaddrinfo",
        return_value=[(None, None, None, None, ("93.184.216.34", 443))],
    )
    with override_settings(ALLOWED_HOSTS=["calendar.example", "testserver"]):
        with public_dns, patch(
            "modules.school_calendar.api.views._PinnedHTTPSConnection"
        ) as connection:
            connection.return_value.getresponse.return_value.status = 302
            response = client.post(
                "/api/v1/admin/calendar/sync-holidays",
                {"icalUrl": "https://calendar.example/private.ics"},
                format="json",
            )
    connection.assert_called_once_with("calendar.example", "93.184.216.34", timeout=10)
    assert response.status_code == 400
    assert AcademicCalendarEvent.objects.count() == 0


@pytest.mark.django_db
def test_sync_holidays_rejects_non_public_and_invalid_inputs(calendar_admin):
    client, _, _ = calendar_admin
    response = client.post(
        "/api/v1/admin/calendar/sync-holidays",
        {"icalUrl": "http://127.0.0.1/private.ics"},
        format="json",
    )
    assert response.status_code == 400
