from rest_framework.permissions import BasePermission

from modules.identity.services import resolve_session_context
from modules.institutes.api.permissions import _record_api_action
from modules.institutes.models import InstituteMembership


def _attach_context(request, membership):
    request.institute_membership = membership
    request.institute = membership.institute
    underlying = getattr(request, "_request", None)
    if underlying is not None:
        underlying.institute_membership = membership
        underlying.institute = membership.institute
        underlying.audit_actor = request.user


class HasAccessControlSession(BasePermission):
    message = "An active admin-web institute session is required."

    def has_permission(self, request, view):
        token = request.auth
        if token is None or token.get("client") != "admin-web" or not token.get("membership_id"):
            return False
        context = resolve_session_context(
            user=request.user,
            client="admin-web",
            membership_id=token.get("membership_id"),
        )
        if context is None or context.membership.role not in {
            InstituteMembership.Role.INSTITUTE_ADMIN,
            InstituteMembership.Role.BRANCH_ADMIN,
        }:
            return False
        _attach_context(request, context.membership)
        _record_api_action(request, context.membership)
        return True


class IsActiveInstituteWebSession(BasePermission):
    """Require an active institute membership eligible for the admin web client."""

    message = "An active institute web session is required."

    def has_permission(self, request, view):
        token = request.auth
        if token is None or token.get("client") != "admin-web" or not token.get("membership_id"):
            return False
        context = resolve_session_context(
            user=request.user, client="admin-web", membership_id=token.get("membership_id")
        )
        if context is None or context.membership is None:
            return False
        if context.membership.institute.onboarding_status in {
            context.membership.institute.OnboardingStatus.PENDING_REVIEW,
            context.membership.institute.OnboardingStatus.DECLINED,
        }:
            return False
        _attach_context(request, context.membership)
        _record_api_action(request, context.membership)
        return True
