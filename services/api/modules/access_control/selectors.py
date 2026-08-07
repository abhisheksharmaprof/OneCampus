from django.db.models import Count, Prefetch, Q
from django.utils import timezone

from modules.institutes.models import InstituteMembership

from .models import Permission, Role, RolePermission, UserRoleAssignment


def active_window_q(now=None, *, prefix=""):
    now = now or timezone.now()
    return (
        (Q(**{f"{prefix}valid_from__isnull": True}) | Q(**{f"{prefix}valid_from__lte": now}))
        & (Q(**{f"{prefix}valid_until__isnull": True}) | Q(**{f"{prefix}valid_until__gt": now}))
    )


def actor_is_institute_admin(*, actor, institute):
    now = timezone.now()
    return actor.institute_memberships.filter(
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
        is_active=True,
        institute__is_active=True,
    ).filter(Q(valid_until__isnull=True) | Q(valid_until__gt=now)).exists()


def effective_permission_keys(*, user, institute, branch=None):
    """Return active permission keys at exactly the requested tenant scope.

    Institute-wide assignments flow down into a branch. Branch assignments never flow
    up to institute scope or sideways to another branch.
    """

    if not user.is_active or not institute.is_active:
        return set()
    if actor_is_institute_admin(actor=user, institute=institute):
        return set(
            Permission.objects.filter(is_active=True).values_list("permission_key", flat=True)
        )

    now = timezone.now()
    assignments = UserRoleAssignment.objects.filter(
        user=user,
        institute=institute,
        is_active=True,
        revoked_at__isnull=True,
        role__is_active=True,
        role__permissions__is_active=True,
    ).filter(active_window_q(now))
    if branch is None:
        assignments = assignments.filter(branch__isnull=True)
    else:
        assignments = assignments.filter(Q(branch__isnull=True) | Q(branch=branch))
    return set(
        assignments.values_list("role__permissions__permission_key", flat=True).distinct()
    )


def roles_for_institute(*, institute, branch=None):
    now = timezone.now()
    visible = Q(is_system_role=True) | Q(institute=institute)
    if branch is not None:
        visible &= Q(branch__isnull=True) | Q(branch=branch)
    grants = RolePermission.objects.select_related("permission").order_by(
        "permission__module", "permission__permission_key"
    )
    return (
        Role.objects.filter(visible)
        .select_related("branch", "created_by")
        .prefetch_related(Prefetch("permission_grants", queryset=grants))
        .annotate(
            permission_count=Count(
                "permission_grants",
                filter=Q(permission_grants__permission__is_active=True),
                distinct=True,
            ),
            user_count=Count(
                "user_assignments__user",
                filter=(
                    Q(user_assignments__institute=institute)
                    & Q(user_assignments__is_active=True)
                    & Q(user_assignments__revoked_at__isnull=True)
                    & active_window_q(now, prefix="user_assignments__")
                ),
                distinct=True,
            ),
        )
        .order_by("name", "id")
    )


def role_for_institute(*, institute, role_id, branch=None):
    return roles_for_institute(institute=institute, branch=branch).filter(id=role_id).first()


def assignments_for_institute(*, institute, branch=None, include_inactive=True):
    queryset = UserRoleAssignment.objects.filter(institute=institute).select_related(
        "user", "role", "branch", "assigned_by", "revoked_by"
    )
    if branch is not None:
        queryset = queryset.filter(Q(branch__isnull=True) | Q(branch=branch))
    if not include_inactive:
        queryset = queryset.filter(
            is_active=True, revoked_at__isnull=True
        ).filter(active_window_q())
    return queryset.order_by("-assigned_at", "id")

