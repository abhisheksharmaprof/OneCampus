"""
Centralised audit trail utility.

Every mutating API action that affects tenant data MUST emit an audit event.
The helper functions in this module make that requirement ergonomic and
consistent across the backend while keeping the call sites readable.
"""

import logging
from uuid import UUID

from django.db import transaction

from platform_core.models import AuditEvent

logger = logging.getLogger(__name__)

AUDIT_VERBS = {
    "POST": "Created",
    "PATCH": "Updated",
    "PUT": "Replaced",
    "DELETE": "Deleted",
    "APPROVE": "Approved",
    "REJECT": "Rejected",
    "BULK_UPDATE": "Bulk-updated",
    "BULK_DELETE": "Bulk-deleted",
    "ENROLL": "Enrolled",
    "UNENROLL": "Unenrolled",
    "LINK": "Linked",
    "UNLINK": "Unlinked",
    "INVITE": "Invited",
    "PAYMENT": "Recorded payment",
}


def write_audit_event(
    *,
    request,
    message: str,
    event_type: str = "GENERAL",
    target_type: str = "",
    target_id: UUID | str | None = None,
    metadata: dict | None = None,
) -> AuditEvent | None:
    """Create an audit event in the current transaction.

    The event is tied to the institute (and optionally branch) resolved from
    the request by the permission class.  If no institute context is available
    (e.g. auth endpoints) the call is silently skipped.
    """
    institute = getattr(request, "institute", None)
    if institute is None:
        return None

    branch = getattr(request, "institute_membership", None)
    branch = branch.branch if branch else None

    target_id_uuid: UUID | None = None
    if target_id is not None:
        try:
            target_id_uuid = UUID(str(target_id))
        except (ValueError, TypeError):
            target_id_uuid = None

    try:
        return AuditEvent.objects.create(
            institute=institute,
            branch=branch,
            actor=request.user,
            event_type=event_type,
            target_type=target_type,
            target_id=target_id_uuid,
            message=message,
            metadata={
                "method": request.method.upper(),
                "path": request.path,
                "traceId": getattr(request, "trace_id", None),
                "ipAddress": request.META.get("REMOTE_ADDR"),
                **(metadata or {}),
            },
        )
    except Exception:
        logger.exception("Failed to write audit event for %s", request.path)
        return None


def audit_mutation(
    *,
    request,
    verb: str,
    target_label: str,
    target_type: str = "",
    target_id: UUID | str | None = None,
    extra_meta: dict | None = None,
) -> AuditEvent | None:
    """Convenience wrapper that constructs the message from a verb and target.

    Example::

        audit_mutation(
            request=request,
            verb="Created",
            target_label="student John Doe",
            target_type="student",
            target_id=student.id,
        )
    """
    display_verb = AUDIT_VERBS.get(verb, verb)
    return write_audit_event(
        request=request,
        message=f"{display_verb} {target_label}.",
        event_type=f"{verb.upper().replace(' ', '_')}",
        target_type=target_type,
        target_id=target_id,
        metadata=extra_meta,
    )


def _record_api_action(request, membership):
    """Implicit audit hook — called by every permission class on non-GET requests.

    This provides a baseline audit trail for all admin mutations.  Individual
    views SHOULD ALSO call :func:`audit_mutation` with richer context (target
    type, target id, human-readable label) so the audit log is searchable.
    """
    if request.path.startswith("/api/v1/admin/audit-log"):
        return
    method = request.method.upper()
    if method == "GET":
        return
    verb = AUDIT_VERBS.get(method, method)
    write_audit_event(
        request=request,
        message=f"{verb} {request.path}.",
        event_type=f"API_{method}",
    )