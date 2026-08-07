import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from modules.people.models import StaffProfile

from . import delivery
from .models import StaffInvitation

logger = logging.getLogger(__name__)


class InvitationUnavailable(Exception):
    pass


class InvitationRateLimited(Exception):
    pass


@dataclass(frozen=True)
class IssuedInvitation:
    invitation: StaffInvitation
    raw_token: str


def _duration_setting(name, default):
    value = getattr(settings, name, default)
    return value if isinstance(value, timedelta) else timedelta(seconds=int(value))


def _parse_token(raw_token):
    try:
        selector, secret = raw_token.split(".", 1)
        invitation_id = uuid.UUID(selector)
    except (AttributeError, TypeError, ValueError):
        return None, ""
    if not secret or len(secret) > 200:
        return None, ""
    return invitation_id, secret


@transaction.atomic
def issue_staff_invitation(*, staff_profile, enforce_resend_limits=False):
    profile = (
        StaffProfile.objects.select_for_update()
        .select_related("user", "institute")
        .get(pk=staff_profile.pk)
    )
    if not profile.invite_pending or profile.user.is_active:
        raise InvitationUnavailable

    now = timezone.now()
    if enforce_resend_limits:
        cooldown = _duration_setting("STAFF_INVITATION_RESEND_COOLDOWN", 60)
        latest = profile.staff_invitations.order_by("-created_at").first()
        if latest and latest.created_at > now - cooldown:
            raise InvitationRateLimited

        window = _duration_setting("STAFF_INVITATION_RESEND_WINDOW", 3600)
        maximum = int(getattr(settings, "STAFF_INVITATION_MAX_PER_WINDOW", 5))
        if profile.staff_invitations.filter(created_at__gte=now - window).count() >= maximum:
            raise InvitationRateLimited

    profile.staff_invitations.filter(
        consumed_at__isnull=True,
        invalidated_at__isnull=True,
    ).update(invalidated_at=now, updated_at=now)

    secret = secrets.token_urlsafe(32)
    invitation = StaffInvitation(
        staff_profile=profile,
        expires_at=now + _duration_setting("STAFF_INVITATION_TTL", 48 * 60 * 60),
        max_attempts=int(getattr(settings, "STAFF_INVITATION_MAX_ATTEMPTS", 5)),
    )
    invitation.token_hash = invitation.hash_secret(secret)
    invitation.save()
    return IssuedInvitation(invitation=invitation, raw_token=f"{invitation.id}.{secret}")


def deliver_issued_invitation(issued):
    invitation = issued.invitation
    attempted_at = timezone.now()
    try:
        delivery.deliver_staff_setup_invitation(
            invitation=invitation,
            raw_token=issued.raw_token,
        )
    except Exception:
        logger.exception("Staff invitation delivery failed", extra={"invitation_id": invitation.id})
        status = StaffInvitation.DeliveryStatus.FAILED
        delivered_at = None
    else:
        status = StaffInvitation.DeliveryStatus.SENT
        delivered_at = attempted_at

    StaffInvitation.objects.filter(pk=invitation.pk).update(
        delivery_status=status,
        delivery_attempted_at=attempted_at,
        delivered_at=delivered_at,
        updated_at=attempted_at,
    )
    invitation.delivery_status = status
    invitation.delivery_attempted_at = attempted_at
    invitation.delivered_at = delivered_at
    return invitation


def invitation_delivery_data(invitation):
    if invitation is None:
        return None
    return {
        "status": invitation.delivery_status,
        "attemptedAt": (
            invitation.delivery_attempted_at.isoformat()
            if invitation.delivery_attempted_at
            else None
        ),
        "deliveredAt": invitation.delivered_at.isoformat() if invitation.delivered_at else None,
    }


def _locked_invitation(raw_token):
    invitation_id, secret = _parse_token(raw_token)
    if invitation_id is None:
        return None, ""
    invitation = (
        StaffInvitation.objects.select_for_update()
        .select_related("staff_profile__user")
        .filter(pk=invitation_id)
        .first()
    )
    return invitation, secret


def _is_available(invitation, secret, now):
    if invitation is None or not invitation.is_available(now):
        return False
    if not invitation.secret_matches(secret):
        invitation.attempts += 1
        invitation.save(update_fields=("attempts", "updated_at"))
        return False
    if not invitation.staff_profile.invite_pending or invitation.staff_profile.user.is_active:
        return False
    return True


def validate_staff_invitation(raw_token):
    with transaction.atomic():
        invitation, secret = _locked_invitation(raw_token)
        available = _is_available(invitation, secret, timezone.now())
    if not available:
        raise InvitationUnavailable
    return invitation


def set_staff_password(*, raw_token, password):
    unavailable = False
    with transaction.atomic():
        invitation, secret = _locked_invitation(raw_token)
        now = timezone.now()
        if not _is_available(invitation, secret, now):
            unavailable = True
        else:
            user = invitation.staff_profile.user
            validate_password(password, user=user)
            user.set_password(password)
            user.is_active = True
            user.save(update_fields=("password", "is_active", "updated_at"))

            profile = invitation.staff_profile
            profile.invite_pending = False
            profile.save(update_fields=("invite_pending", "updated_at"))

            invitation.consumed_at = now
            invitation.save(update_fields=("consumed_at", "updated_at"))
    if unavailable:
        raise InvitationUnavailable
    return invitation
