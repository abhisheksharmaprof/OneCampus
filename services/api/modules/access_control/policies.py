from .exceptions import AccessDenied
from .selectors import effective_permission_keys


def require_permission(*, actor, institute, permission_key, branch=None):
    held = effective_permission_keys(user=actor, institute=institute, branch=branch)
    if permission_key not in held:
        raise AccessDenied(f"Permission '{permission_key}' is required at this scope.")
    return held


def require_any_permission(*, actor, institute, permission_keys, branch=None):
    held = effective_permission_keys(user=actor, institute=institute, branch=branch)
    if not set(permission_keys) & held:
        raise AccessDenied("You do not have permission to access roles at this scope.")
    return held


def require_delegable_permissions(*, actor, institute, permission_keys, branch=None):
    held = effective_permission_keys(user=actor, institute=institute, branch=branch)
    missing = sorted(set(permission_keys) - held)
    if missing:
        raise AccessDenied(
            "You cannot grant permissions you do not hold at this scope: " + ", ".join(missing)
        )
    return held
