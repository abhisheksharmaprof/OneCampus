import base64
import hashlib
import json
import urllib.parse
import urllib.request
from datetime import timedelta

from cryptography.fernet import Fernet
from django.conf import settings
from django.utils import timezone

from .models import AcademicCalendarEvent, CalendarIntegrationConnection


def _cipher():
    key = settings.CALENDAR_TOKEN_ENCRYPTION_KEY or settings.SECRET_KEY
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest()))


def seal(value):
    return _cipher().encrypt(value.encode()).decode()


def unseal(value):
    return _cipher().decrypt(value.encode()).decode()


def provider_config(provider):
    if provider == "google":
        return settings.CALENDAR_GOOGLE_CLIENT_ID, settings.CALENDAR_GOOGLE_CLIENT_SECRET
    if provider == "microsoft":
        return settings.CALENDAR_MICROSOFT_CLIENT_ID, settings.CALENDAR_MICROSOFT_CLIENT_SECRET
    raise ValueError("Unsupported calendar provider")


def authorization_url(provider, state):
    client_id, _ = provider_config(provider)
    if not client_id:
        raise ValueError(f"{provider.title()} Calendar is not configured on the server.")
    if provider == "google":
        base = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {"client_id": client_id, "redirect_uri": settings.CALENDAR_OAUTH_CALLBACK_URL, "response_type": "code", "scope": "openid email https://www.googleapis.com/auth/calendar.readonly", "access_type": "offline", "prompt": "consent", "state": state}
    else:
        base = f"https://login.microsoftonline.com/{settings.CALENDAR_MICROSOFT_TENANT}/oauth2/v2.0/authorize"
        params = {"client_id": client_id, "redirect_uri": settings.CALENDAR_OAUTH_CALLBACK_URL, "response_type": "code", "scope": "openid email offline_access Calendars.Read", "state": state}
    return f"{base}?{urllib.parse.urlencode(params)}"


def _request(url, data=None, headers=None):
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    request = urllib.request.Request(url, data=body, headers=headers or {})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode())


def exchange_code(provider, code):
    client_id, client_secret = provider_config(provider)
    data = {"code": code, "client_id": client_id, "client_secret": client_secret, "redirect_uri": settings.CALENDAR_OAUTH_CALLBACK_URL, "grant_type": "authorization_code"}
    url = "https://oauth2.googleapis.com/token" if provider == "google" else f"https://login.microsoftonline.com/{settings.CALENDAR_MICROSOFT_TENANT}/oauth2/v2.0/token"
    return _request(url, data)


def refresh_access_token(connection):
    if not connection.encrypted_refresh_token:
        return unseal(connection.encrypted_access_token)
    refresh_token = unseal(connection.encrypted_refresh_token)
    client_id, client_secret = provider_config(connection.provider)
    if connection.provider == "google":
        url = "https://oauth2.googleapis.com/token"
    else:
        url = f"https://login.microsoftonline.com/{settings.CALENDAR_MICROSOFT_TENANT}/oauth2/v2.0/token"
    tokens = _request(url, {"client_id": client_id, "client_secret": client_secret, "refresh_token": refresh_token, "grant_type": "refresh_token"})
    connection.encrypted_access_token = seal(tokens["access_token"])
    if tokens.get("refresh_token"):
        connection.encrypted_refresh_token = seal(tokens["refresh_token"])
    connection.token_expires_at = timezone.now() + timedelta(seconds=int(tokens.get("expires_in", 3600)))
    connection.save(update_fields=("encrypted_access_token", "encrypted_refresh_token", "token_expires_at", "updated_at"))
    return tokens["access_token"]


def _events(connection, access_token):
    now = timezone.now()
    if connection.provider == "google":
        params = {"timeMin": (now - timedelta(days=365)).isoformat(), "timeMax": (now + timedelta(days=730)).isoformat(), "singleEvents": "true", "orderBy": "startTime", "maxResults": "2500"}
        url = f"https://www.googleapis.com/calendar/v3/calendars/{urllib.parse.quote(connection.calendar_id or 'primary', safe='')}/events?{urllib.parse.urlencode(params)}"
        payload = _request(url, headers={"Authorization": f"Bearer {access_token}"})
        return payload.get("items", [])
    params = {"startDateTime": (now - timedelta(days=365)).isoformat(), "endDateTime": (now + timedelta(days=730)).isoformat(), "$top": "1000"}
    url = f"https://graph.microsoft.com/v1.0/me/calendarView?{urllib.parse.urlencode(params)}"
    return _request(url, headers={"Authorization": f"Bearer {access_token}", "Prefer": 'outlook.timezone="UTC"'}).get("value", [])


def sync_connection(connection):
    access_token = refresh_access_token(connection) if not connection.token_expires_at or connection.token_expires_at <= timezone.now() + timedelta(minutes=2) else unseal(connection.encrypted_access_token)
    imported = 0
    for item in _events(connection, access_token):
        if item.get("status") == "cancelled" or item.get("isCancelled"):
            continue
        if connection.provider == "google":
            start = item.get("start", {}).get("date") or item.get("start", {}).get("dateTime", "")[:10]
            end = item.get("end", {}).get("date") or item.get("end", {}).get("dateTime", "")[:10]
            if item.get("start", {}).get("date") and end:
                from datetime import date
                end = (date.fromisoformat(end) - timedelta(days=1)).isoformat()
            external_id, title = item.get("id", ""), item.get("summary") or "Untitled event"
        else:
            start = item.get("start", {}).get("dateTime", "")[:10]
            end = item.get("end", {}).get("dateTime", "")[:10]
            external_id, title = item.get("id", ""), item.get("subject") or "Untitled event"
        if not start or not end or not external_id:
            continue
        AcademicCalendarEvent.objects.update_or_create(
            institute=connection.institute, source_provider=connection.provider, source_event_id=external_id,
            defaults={"title": title[:250], "event_type": AcademicCalendarEvent.EventType.EVENT, "starts_on": start, "ends_on": end},
        )
        imported += 1
    connection.last_synced_at = timezone.now()
    connection.last_error = ""
    connection.save(update_fields=("last_synced_at", "last_error", "updated_at"))
    return imported
