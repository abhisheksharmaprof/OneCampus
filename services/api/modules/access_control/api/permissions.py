from rest_framework.permissions import BasePermission

from modules.identity.services import resolve_session_context
from modules.institutes.api.permissions import _record_api_action


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
            membership_id=token.get("membership_id"),
        )
        if context is None:
            return False
        _attach_context(request, context.membership)
        _record_api_action(request, context.membership)
        return True
