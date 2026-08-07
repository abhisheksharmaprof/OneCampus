from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.conf import settings
from django.core.mail import send_mail


def _setup_url(raw_token):
    base_url = getattr(settings, "STAFF_SETUP_URL", "http://localhost:5173/setup-password")
    parts = urlsplit(base_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["token"] = raw_token
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def deliver_staff_setup_invitation(*, invitation, raw_token):
    """Patchable synchronous delivery boundary for the configured email backend."""
    profile = invitation.staff_profile
    send_mail(
        subject=f"Set up your {profile.institute.name} CampusOne account",
        message=(
            f"You have been invited to join {profile.institute.name} on CampusOne.\n\n"
            f"Set your password: {_setup_url(raw_token)}\n\n"
            f"This link expires at {invitation.expires_at.isoformat()} and can be used once. "
            "If you were not expecting this invitation, you can ignore this email."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[profile.user.email],
        fail_silently=False,
    )
