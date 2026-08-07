import logging

from rest_framework.permissions import BasePermission

from modules.identity.services import resolve_session_context
from modules.institutes.models import InstituteMembership
from platform_core.api.audit import write_audit_event

logger = logging.getLogger(__name__)


def _attach_context(request, membership):
    request.institute_membership = membership
    request.institute = membership.institute
    # Django middleware receives the underlying HttpRequest, while DRF
    # permissions receive its Request wrapper. Keep both contexts aligned so
    # cross-cutting audit capture can see the resolved tenant after the view.
    underlying = getattr(request, "_request", None)
    if underlying is not None:
        underlying.institute_membership = membership
        underlying.institute = membership.institute
        underlying.audit_actor = request.user


def _record_api_action(request, membership):
    """Implicit audit hook — records every non-GET admin mutation."""
    if request.path.startswith("/api/v1/admin/audit-log"):
        return
    if request.method.upper() == "GET":
        return
    verb = {
        "POST": "Created or triggered",
        "PATCH": "Updated",
        "PUT": "Replaced",
        "DELETE": "Deleted",
    }.get(request.method.upper(), request.method.upper())
    write_audit_event(
        request=request,
        message=f"{verb} {request.path}.",
        event_type=f"API_{request.method.upper()}",
        metadata={"query": dict(request.query_params)},
    )


class IsCurrentInstituteAdmin(BasePermission):
    message = "An active Institute Admin session is required."

    def has_permission(self, request, view):
        token = request.auth
        if token is None or not token.get("client") or not token.get("membership_id"):
            return False
        context = resolve_session_context(
            user=request.user,
            client=token.get("client"),
            membership_id=token.get("membership_id"),
        )
        if context is None or context.membership.role not in {
            InstituteMembership.Role.INSTITUTE_ADMIN,
            InstituteMembership.Role.BRANCH_ADMIN,
        }:
            return False
        # Legacy/provisioned institutes may still use the historical ``draft``
        # value.  New self-service registrations are explicitly created as
        # ``pending_review`` and must remain locked until a platform admin
        # approves them; declined institutes are locked as well.
        if context.membership.institute.onboarding_status in {
            context.membership.institute.OnboardingStatus.PENDING_REVIEW,
            context.membership.institute.OnboardingStatus.DECLINED,
        }:
            return False
        _attach_context(request, context.membership)
        _record_api_action(request, context.membership)
        return True


class IsCurrentInstituteOnlyAdmin(BasePermission):
    """Allow institute-wide administrators, excluding branch administrators."""

    message = "An active Institute Admin session is required."

    def has_permission(self, request, view):
        token = request.auth
        if token is None or not token.get("client") or not token.get("membership_id"):
            return False
        context = resolve_session_context(
            user=request.user,
            client=token.get("client"),
            membership_id=token.get("membership_id"),
        )
        if context is None or context.membership.role != InstituteMembership.Role.INSTITUTE_ADMIN:
            return False
        if context.membership.institute.onboarding_status in {
            context.membership.institute.OnboardingStatus.PENDING_REVIEW,
            context.membership.institute.OnboardingStatus.DECLINED,
        }:
            return False
        _attach_context(request, context.membership)
        _record_api_action(request, context.membership)
        return True


class IsAttendanceLeaveReviewer(BasePermission):
    """Institute/branch admins and active teachers may enter the leave review workflow."""

    message = "An active administrator or teacher session is required."

    def has_permission(self, request, view):
        token = request.auth
        if token is None or not token.get("client") or not token.get("membership_id"):
            return False
        context = resolve_session_context(
            user=request.user,
            client=token.get("client"),
            membership_id=token.get("membership_id"),
        )
        if context is None or context.membership.role not in {
            InstituteMembership.Role.INSTITUTE_ADMIN,
            InstituteMembership.Role.BRANCH_ADMIN,
            InstituteMembership.Role.TEACHER,
        }:
            return False
        _attach_context(request, context.membership)
        _record_api_action(request, context.membership)
        return True
