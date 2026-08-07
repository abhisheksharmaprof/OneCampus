"""
RBAC enforcement helpers for admin API views.

Every admin mutation view that is currently gated by ``IsCurrentInstituteAdmin``
SHOULD also add a fine-grained permission check via the helpers below so that
custom roles (created through the access-control module) actually apply.

Institute admins are automatically granted ALL permissions, so existing
behaviour is preserved.
"""

from rest_framework.exceptions import PermissionDenied

from modules.access_control.policies import require_permission as _require_permission
from modules.access_control.policies import require_any_permission as _require_any_permission


def require(request, permission_key: str, branch=None):
    """Enforce a single fine-grained permission.

    Raises ``PermissionDenied`` (403) when the actor does not hold the
    permission.  Institute admins always pass.
    """
    _require_permission(
        actor=request.user,
        institute=request.institute,
        permission_key=permission_key,
        branch=branch or getattr(request.institute_membership, "branch", None),
    )


def require_any(request, permission_keys: list[str], branch=None):
    """Enforce that the actor holds at least one of the given permissions.

    Raises ``PermissionDenied`` (403) otherwise.
    """
    _require_any_permission(
        actor=request.user,
        institute=request.institute,
        permission_keys=permission_keys,
        branch=branch or getattr(request.institute_membership, "branch", None),
    )


# ── Permission-key constants ────────────────────────────────────────────────
# These are the keys registered in ``modules/access_control/models.py`` as
# ``Permission.permission_key``.  Use them to avoid typos.

PERM = {
    # Students
    "students.view": "students.view",
    "students.create": "students.create",
    "students.edit": "students.edit",
    "students.delete": "students.delete",
    "students.bulk_delete": "students.bulk_delete",
    # Staff
    "staff.view": "staff.view",
    "staff.create": "staff.create",
    "staff.edit": "staff.edit",
    "staff.delete": "staff.delete",
    # Parents
    "parents.view": "parents.view",
    "parents.create": "parents.create",
    "parents.link": "parents.link",
    # Academics
    "academics.view": "academics.view",
    "academics.manage_structure": "academics.manage_structure",
    "academics.manage_enrollments": "academics.manage_enrollments",
    "academics.manage_operations": "academics.manage_operations",
    # Attendance
    "attendance.view": "attendance.view",
    "attendance.mark": "attendance.mark",
    "attendance.bulk_mark": "attendance.bulk_mark",
    "attendance.manage_leave": "attendance.manage_leave",
    "attendance.manage_settings": "attendance.manage_settings",
    "attendance.view_reports": "attendance.view_reports",
    # Finance
    "finance.view": "finance.view",
    "finance.create_invoice": "finance.create_invoice",
    "finance.record_payment": "finance.record_payment",
    "finance.manage_records": "finance.manage_records",
    # Admissions
    "admissions.view": "admissions.view",
    "admissions.create": "admissions.create",
    # Calendar
    "calendar.view": "calendar.view",
    "calendar.manage": "calendar.manage",
    # Institute
    "institute.manage_settings": "institute.manage_settings",
    "institute.manage_branches": "institute.manage_branches",
    "institute.manage_peers": "institute.manage_peers",
    # Role management
    "role.create": "role.create",
    "role.assign": "role.assign",
    "role.manage_permissions": "role.manage_permissions",
    # Admin console
    "admin_console.view": "admin_console.view",
    "admin_console.manage": "admin_console.manage",
    # File storage
    "files.view": "files.view",
    "files.upload": "files.upload",
    "files.delete": "files.delete",
}