from datetime import timedelta

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from modules.access_control.exceptions import AccessDenied, InvalidOperation
from modules.access_control.models import Permission, Role, RolePermission, UserRoleAssignment
from modules.access_control.selectors import effective_permission_keys
from modules.access_control.services import (
    assign_role,
    create_role,
    revoke_assignment,
    update_role,
)
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


def make_tenant(code):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    branch = Branch.objects.create(
        institute=institute, name=f"{code} Main", code="MAIN", is_head_office=True
    )
    return institute, branch


def make_user(email, institute, branch=None, role=InstituteMembership.Role.STAFF):
    user = User.objects.create_user(email=email, password="StrongPass123!")
    InstituteMembership.objects.create(
        user=user, institute=institute, branch=branch, role=role
    )
    return user


def permission(key):
    return Permission.objects.get(permission_key=key)


def grant_actor(actor, institute, branch, *permissions):
    role = Role.objects.create(
        institute=institute, branch=branch, name=f"Delegator {actor.email}"
    )
    RolePermission.objects.bulk_create(
        [RolePermission(role=role, permission=item) for item in permissions]
    )
    return UserRoleAssignment.objects.create(
        user=actor, role=role, institute=institute, branch=branch
    )


@pytest.mark.django_db
def test_model_constraints_reject_cross_tenant_branches_and_roles():
    institute, branch = make_tenant("ONE")
    other, foreign_branch = make_tenant("TWO")
    user = make_user("staff@one.test", institute, branch)

    with pytest.raises(ValidationError):
        Role.objects.create(
            institute=institute, branch=foreign_branch, name="Foreign scope"
        )

    role = Role.objects.create(institute=other, branch=foreign_branch, name="Other role")
    with pytest.raises(ValidationError):
        UserRoleAssignment.objects.create(
            user=user, role=role, institute=institute, branch=branch
        )


@pytest.mark.django_db
def test_effective_permissions_respect_branch_direction_active_and_validity():
    institute, branch = make_tenant("SCOPE")
    second = Branch.objects.create(institute=institute, name="Second", code="SECOND")
    actor = make_user("actor@scope.test", institute, branch)
    role_create = permission("role.create")
    assignment = grant_actor(actor, institute, branch, role_create)

    assert effective_permission_keys(user=actor, institute=institute, branch=branch) == {
        "role.create"
    }
    assert effective_permission_keys(user=actor, institute=institute, branch=second) == set()
    assert effective_permission_keys(user=actor, institute=institute) == set()

    assignment.valid_until = timezone.now() - timedelta(seconds=1)
    assignment.save()
    assert effective_permission_keys(user=actor, institute=institute, branch=branch) == set()


@pytest.mark.django_db
def test_branch_actor_cannot_create_institute_role_or_delegate_unheld_permission():
    institute, branch = make_tenant("LEAST")
    actor = make_user("actor@least.test", institute, branch)
    role_create = permission("role.create")
    student_view = permission("student.view")
    grant_actor(actor, institute, branch, role_create)

    with pytest.raises(AccessDenied):
        create_role(
            actor=actor,
            institute=institute,
            name="Institute-wide escalation",
            permission_keys=[role_create.permission_key],
        )

    with pytest.raises(AccessDenied, match="student.view"):
        create_role(
            actor=actor,
            institute=institute,
            branch=branch,
            name="Overpowered role",
            permission_keys=[role_create.permission_key, student_view.permission_key],
        )
    assert not Role.objects.filter(
        name__in=["Institute-wide escalation", "Overpowered role"]
    ).exists()


@pytest.mark.django_db
def test_assignment_enforces_same_tenant_scope_and_cannot_grant_what_actor_lacks():
    institute, branch = make_tenant("ASSIGN")
    other, other_branch = make_tenant("OTHER")
    actor = make_user("actor@assign.test", institute, branch)
    target = make_user("target@assign.test", institute, branch)
    role_assign = permission("role.assign")
    student_view = permission("student.view")
    grant_actor(actor, institute, branch, role_assign)

    powerful = Role.objects.create(institute=institute, branch=branch, name="Powerful")
    RolePermission.objects.create(role=powerful, permission=student_view)
    with pytest.raises(AccessDenied, match="student.view"):
        assign_role(
            actor=actor,
            institute=institute,
            user=target,
            role=powerful,
            branch=branch,
        )

    foreign = Role.objects.create(institute=other, branch=other_branch, name="Foreign")
    with pytest.raises(InvalidOperation, match="does not belong"):
        assign_role(
            actor=actor,
            institute=institute,
            user=target,
            role=foreign,
            branch=branch,
        )


@pytest.mark.django_db
def test_authorized_assignment_can_be_revoked_and_recreated_with_history_preserved():
    institute, branch = make_tenant("REVOKE")
    actor = make_user("actor@revoke.test", institute, branch)
    target = make_user("target@revoke.test", institute, branch)
    role_assign = permission("role.assign")
    grant_actor(actor, institute, branch, role_assign)
    assignable = Role.objects.create(institute=institute, branch=branch, name="Empty role")

    first = assign_role(
        actor=actor, institute=institute, user=target, role=assignable, branch=branch
    )
    revoke_assignment(actor=actor, assignment=first)
    first.refresh_from_db()
    assert first.is_active is False
    assert first.revoked_by == actor
    assert first.revoked_at is not None

    second = assign_role(
        actor=actor, institute=institute, user=target, role=assignable, branch=branch
    )
    assert second.id != first.id
    assert UserRoleAssignment.objects.filter(user=target, role=assignable).count() == 2


@pytest.mark.django_db
def test_branch_actor_cannot_move_or_edit_a_role_owned_by_another_branch():
    institute, branch = make_tenant("MOVE")
    second = Branch.objects.create(institute=institute, name="Second", code="SECOND")
    actor = make_user("actor@move.test", institute, branch)
    manage = permission("role.manage_permissions")
    grant_actor(actor, institute, branch, manage)
    foreign_role = Role.objects.create(institute=institute, branch=second, name="Second only")

    with pytest.raises(AccessDenied):
        update_role(
            actor=actor,
            role=foreign_role,
            name="Taken over",
            branch_marker=True,
            branch=branch,
        )
    foreign_role.refresh_from_db()
    assert foreign_role.branch == second
    assert foreign_role.name == "Second only"
