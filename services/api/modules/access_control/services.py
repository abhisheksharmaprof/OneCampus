from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from .exceptions import InvalidOperation
from .models import Permission, Role, RolePermission, UserRoleAssignment
from .policies import require_delegable_permissions, require_permission


def _permission_map(permission_keys):
    requested = set(permission_keys)
    permissions = {
        permission.permission_key: permission
        for permission in Permission.objects.filter(permission_key__in=requested, is_active=True)
    }
    missing = sorted(requested - set(permissions))
    if missing:
        raise InvalidOperation(
            "Unknown or inactive permissions: " + ", ".join(missing), field="permissionKeys"
        )
    return permissions


def _validate_branch(*, institute, branch):
    if branch is not None and (branch.institute_id != institute.id or not branch.is_active):
        raise InvalidOperation(
            "Branch must be active and belong to this institute.", field="branchId"
        )


def _replace_grants(*, role, permissions, configurations):
    RolePermission.objects.filter(role=role).delete()
    RolePermission.objects.bulk_create(
        [
            RolePermission(
                role=role,
                permission=permission,
                configuration=configurations.get(key, {}),
            )
            for key, permission in permissions.items()
        ]
    )


@transaction.atomic
def create_role(
    *, actor, institute, name, description="", branch=None, permission_keys=(), configurations=None
):
    _validate_branch(institute=institute, branch=branch)
    require_permission(
        actor=actor, institute=institute, permission_key="role.create", branch=branch
    )
    permissions = _permission_map(permission_keys)
    require_delegable_permissions(
        actor=actor, institute=institute, permission_keys=permissions, branch=branch
    )
    configurations = configurations or {}
    unknown_options = set(configurations) - set(permissions)
    if unknown_options:
        raise InvalidOperation(
            "Configuration was supplied for an unselected permission.", field="permissionOptions"
        )
    try:
        role = Role.objects.create(
            institute=institute,
            branch=branch,
            name=name,
            description=description,
            created_by=actor,
        )
    except (DjangoValidationError, IntegrityError) as exc:
        raise InvalidOperation(
            "A role with this name already exists at this scope.", field="name"
        ) from exc
    _replace_grants(role=role, permissions=permissions, configurations=configurations)
    return role


@transaction.atomic
def update_role(
    *, actor, role, name=None, description=None, branch_marker=False, branch=None,
    permission_keys=None, configurations=None
):
    role = Role.objects.select_for_update().get(id=role.id)
    if role.is_system_role:
        raise InvalidOperation("System roles are read-only. Clone the role to customize it.")
    target_branch = branch if branch_marker else role.branch
    _validate_branch(institute=role.institute, branch=target_branch)
    if target_branch != role.branch:
        require_permission(
            actor=actor,
            institute=role.institute,
            permission_key="role.manage_permissions",
            branch=role.branch,
        )
    require_permission(
        actor=actor,
        institute=role.institute,
        permission_key="role.manage_permissions",
        branch=target_branch,
    )
    if target_branch != role.branch and role.user_assignments.filter(is_active=True).exists():
        raise InvalidOperation(
            "Revoke active assignments before changing the role scope.", field="branchId"
        )

    if permission_keys is not None:
        permissions = _permission_map(permission_keys)
        require_delegable_permissions(
            actor=actor,
            institute=role.institute,
            permission_keys=permissions,
            branch=target_branch,
        )
        configurations = configurations or {}
        if set(configurations) - set(permissions):
            raise InvalidOperation(
                "Configuration was supplied for an unselected permission.",
                field="permissionOptions",
            )
    if name is not None:
        role.name = name
    if description is not None:
        role.description = description
    role.branch = target_branch
    try:
        role.save()
    except (DjangoValidationError, IntegrityError) as exc:
        raise InvalidOperation(
            "A role with this name already exists at this scope.", field="name"
        ) from exc
    if permission_keys is not None:
        _replace_grants(role=role, permissions=permissions, configurations=configurations)
    return role


@transaction.atomic
def clone_role(*, actor, institute, source, name, description=None, branch=None):
    permission_keys = list(
        source.permission_grants.filter(permission__is_active=True).values_list(
            "permission__permission_key", flat=True
        )
    )
    configurations = {
        grant.permission.permission_key: grant.configuration
        for grant in source.permission_grants.select_related("permission").filter(
            permission__is_active=True
        )
        if grant.configuration
    }
    return create_role(
        actor=actor,
        institute=institute,
        name=name,
        description=source.description if description is None else description,
        branch=branch,
        permission_keys=permission_keys,
        configurations=configurations,
    )


@transaction.atomic
def delete_role(*, actor, role):
    role = Role.objects.select_for_update().get(id=role.id)
    if role.is_system_role:
        raise InvalidOperation("System roles cannot be deleted. Clone the role instead.")
    require_permission(actor=actor, institute=role.institute, permission_key="role.manage_permissions", branch=role.branch)
    if role.user_assignments.filter(is_active=True).exists():
        raise InvalidOperation("Revoke all active assignments before deleting this role.")
    role.delete()


@transaction.atomic
def assign_role(
    *, actor, institute, user, role, branch=None, valid_from=None, valid_until=None
):
    _validate_branch(institute=institute, branch=branch)
    require_permission(
        actor=actor, institute=institute, permission_key="role.assign", branch=branch
    )
    if role.institute_id and role.institute_id != institute.id:
        raise InvalidOperation("Role does not belong to this institute.", field="roleId")
    if not role.is_active:
        raise InvalidOperation("Inactive roles cannot be assigned.", field="roleId")
    if role.branch_id and role.branch_id != getattr(branch, "id", None):
        raise InvalidOperation(
            "Branch-scoped roles can only be assigned in their own branch.", field="branchId"
        )
    now = timezone.now()
    member = user.institute_memberships.filter(
        institute=institute, is_active=True
    ).filter(Q(valid_until__isnull=True) | Q(valid_until__gt=now)).exists()
    # Pending-invite staff have an active institute membership but their login
    # user is intentionally inactive until they set a password. They can still
    # receive role assignments so access is ready when the invitation is accepted.
    if not member:
        raise InvalidOperation("User is not an active member of this institute.", field="userId")
    permission_keys = role.permissions.filter(is_active=True).values_list(
        "permission_key", flat=True
    )
    require_delegable_permissions(
        actor=actor,
        institute=institute,
        permission_keys=permission_keys,
        branch=branch,
    )
    if valid_until and valid_until <= (valid_from or now):
        raise InvalidOperation("Expiry must be later than the validity start.", field="validUntil")
    try:
        return UserRoleAssignment.objects.create(
            user=user,
            role=role,
            institute=institute,
            branch=branch,
            assigned_by=actor,
            valid_from=valid_from,
            valid_until=valid_until,
        )
    except (DjangoValidationError, IntegrityError) as exc:
        raise InvalidOperation("This active role assignment already exists.") from exc


@transaction.atomic
def revoke_assignment(*, actor, assignment):
    assignment = UserRoleAssignment.objects.select_for_update().get(id=assignment.id)
    require_permission(
        actor=actor,
        institute=assignment.institute,
        permission_key="role.assign",
        branch=assignment.branch,
    )
    if not assignment.is_active:
        raise InvalidOperation("Role assignment has already been revoked.")
    assignment.is_active = False
    assignment.revoked_at = timezone.now()
    assignment.revoked_by = actor
    assignment.save(update_fields=("is_active", "revoked_at", "revoked_by", "updated_at"))
    return assignment
