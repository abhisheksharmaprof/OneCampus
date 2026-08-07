from dataclasses import dataclass

from django.db.models import Q
from django.utils import timezone

from modules.institutes.models import InstituteMembership

CLIENT_ROLES = {
    "admin-web": {
        InstituteMembership.Role.INSTITUTE_ADMIN,
        InstituteMembership.Role.BRANCH_ADMIN,
    },
    "parent-mobile": {InstituteMembership.Role.PARENT},
    "staff-mobile": {InstituteMembership.Role.TEACHER, InstituteMembership.Role.STAFF},
    "platform-admin": set(),
}


@dataclass(frozen=True)
class SessionContext:
    membership: InstituteMembership | None
    profile: dict


def eligible_session_memberships(*, user, client=None, membership_id=None, institute_id=None):
    memberships = (
        user.institute_memberships.filter(
            is_active=True,
            institute__is_active=True,
        )
        .filter(Q(valid_until__isnull=True) | Q(valid_until__gt=timezone.now()))
        .filter(Q(branch__isnull=True) | Q(branch__is_active=True))
        .select_related("institute", "branch")
        .order_by("created_at")
    )
    if membership_id:
        memberships = memberships.filter(id=membership_id)
    if institute_id:
        memberships = memberships.filter(institute_id=institute_id)
    accepted = list(memberships)
    if client:
        accepted = [
            membership for membership in accepted if membership.role in CLIENT_ROLES[client]
        ]
    return accepted


def resolve_session_context(*, user, client=None, membership_id=None, institute_id=None):
    if client == "platform-admin" and user and (user.is_superuser or user.user_type == "platform_admin"):
        return SessionContext(
            membership=None,
            profile={
                "id": str(user.id),
                "displayName": user.get_full_name().strip() or user.email,
                "roles": ["PLATFORM_ADMIN"],
                "activeRole": "PLATFORM_ADMIN",
                "instituteId": None,
                "branchIds": [],
            },
        )
    accepted = eligible_session_memberships(
        user=user,
        client=client,
        membership_id=membership_id,
        institute_id=institute_id,
    )
    if not accepted:
        return None

    active = accepted[0]
    same_institute = [
        membership for membership in accepted if membership.institute_id == active.institute_id
    ]
    roles = list(dict.fromkeys(membership.role for membership in same_institute))
    if active.role == InstituteMembership.Role.INSTITUTE_ADMIN:
        branch_ids = list(
            active.institute.branches.filter(is_active=True)
            .order_by("name")
            .values_list("id", flat=True)
        )
    else:
        branch_ids = list(dict.fromkeys(m.branch_id for m in same_institute if m.branch_id))

    # Keep the client-side shell aligned with the same server-side permission
    # model used by the admin APIs.  This is intentionally institute-scoped:
    # a branch-scoped grant must not expose the cross-branch switcher.
    from modules.access_control.selectors import effective_permission_keys

    permissions = sorted(
        effective_permission_keys(user=user, institute=active.institute, branch=None)
    )

    return SessionContext(
        membership=active,
        profile={
            "id": str(user.id),
            "displayName": user.get_full_name().strip() or user.email,
            "roles": roles,
            "activeRole": active.role,
            "instituteId": str(active.institute_id),
            "branchIds": [str(branch_id) for branch_id in branch_ids],
            "permissions": permissions,
        },
    )


def issue_session_tokens(*, user, context, client):
    from rest_framework_simplejwt.tokens import RefreshToken

    refresh = RefreshToken.for_user(user)
    if context.membership:
        refresh["membership_id"] = str(context.membership.id)
    refresh["client"] = client
    return {
        "accessToken": str(refresh.access_token),
        "refreshToken": str(refresh),
        "user": context.profile,
    }
