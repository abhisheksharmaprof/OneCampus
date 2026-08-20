from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import NotFound

from modules.institutes.api.rbac import require
from modules.institutes.models import Branch, InstituteMembership
from modules.people.contracts import FileOwnerNotFound, FileOwnerScope, resolve_file_owner


@dataclass(frozen=True, slots=True)
class AuthorizedOwner:
    scope: FileOwnerScope
    branch: Branch | None


def authorize_admin_owner(
    request, *, permission_key: str, owner_type: str, owner_id: UUID, branch_id: UUID | None
) -> AuthorizedOwner:
    try:
        owner = resolve_file_owner(
            owner_type=owner_type, owner_id=owner_id, institute_id=request.institute.id
        )
    except FileOwnerNotFound as exc:
        raise NotFound("The file owner was not found.") from exc
    if not owner.active:
        raise NotFound("The file owner was not found.")
    resolved_branch_id = branch_id or owner.branch_id
    if owner.branch_id is not None and resolved_branch_id != owner.branch_id:
        raise NotFound("The file owner was not found.")
    branch = None
    if resolved_branch_id:
        branch = get_object_or_404(
            Branch, id=resolved_branch_id, institute=request.institute, is_active=True
        )
    membership = request.institute_membership
    if (
        membership.role == InstituteMembership.Role.BRANCH_ADMIN
        and membership.branch_id != resolved_branch_id
    ):
        raise NotFound("The file owner was not found.")
    require(request, permission_key, branch=branch)
    return AuthorizedOwner(owner, branch)
