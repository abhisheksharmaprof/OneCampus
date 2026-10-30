from datetime import date, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from modules.academics.models import (
    AcademicYear,
    ClassSection,
    Grade,
    Subject,
    SubjectTeacherAssignment,
)
from modules.access_control.api.permissions import (
    HasAccessControlSession,
    IsActiveInstituteWebSession,
)
from modules.access_control.exam_scopes import (
    action_scope,
    require_exam_scope_delegation,
    scope_covers,
    validate_exam_configuration,
)
from modules.access_control.models import Permission, Role, RolePermission, UserRoleAssignment
from modules.identity.models import User
from modules.identity.services import eligible_session_memberships
from modules.institutes.api.permissions import IsAttendanceLeaveReviewer
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import StaffProfile


@pytest.fixture
def exam_scope_context():
    institute = Institute.objects.create(name="Exam Scope Institute", code="ESI")
    north = Branch.objects.create(institute=institute, name="North", code="NORTH")
    south = Branch.objects.create(institute=institute, name="South", code="SOUTH")
    year = AcademicYear.objects.create(
        institute=institute,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_current=True,
    )
    grade = Grade.objects.create(institute=institute, name="Class 8")
    actor = User.objects.create_user(email="scope-teacher@example.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=actor,
        institute=institute,
        branch=north,
        role=InstituteMembership.Role.TEACHER,
    )
    StaffProfile.objects.create(institute=institute, user=actor)
    class_taught = ClassSection.objects.create(
        branch=north, grade=grade, academic_year=year, section_name="A", class_teacher=actor
    )
    subject_taught = ClassSection.objects.create(
        branch=north, grade=grade, academic_year=year, section_name="B"
    )
    other_branch = ClassSection.objects.create(
        branch=south, grade=grade, academic_year=year, section_name="A"
    )
    math = Subject.objects.create(institute=institute, branch=north, name="Math")
    english = Subject.objects.create(institute=institute, branch=north, name="English")
    SubjectTeacherAssignment.objects.create(
        class_section=subject_taught, subject=math, teacher=actor
    )
    return {
        "institute": institute,
        "north": north,
        "south": south,
        "actor": actor,
        "class_taught": class_taught,
        "subject_taught": subject_taught,
        "other_branch": other_branch,
        "math": math,
        "english": english,
    }


def grant_exam_action(*, actor, institute, action, configuration, branch=None, name="Grant"):
    permission, _ = Permission.objects.update_or_create(
        permission_key=action,
        defaults={"module": "academics", "description": action, "is_active": True},
    )
    role = Role.objects.create(
        institute=institute,
        branch=branch,
        name=f"{name} {action} {Role.objects.count()}",
        created_by=actor,
    )
    RolePermission.objects.create(role=role, permission=permission, configuration=configuration)
    return UserRoleAssignment.objects.create(
        user=actor, role=role, institute=institute, branch=branch
    )


@pytest.mark.parametrize(
    "configuration",
    [
        None,
        [],
        {"schemaVersion": True, "examScope": "selected"},
        {"schemaVersion": 1, "examScope": []},
        {"schemaVersion": 1, "examScope": "selected", "unexpected": True},
        {"schemaVersion": 1, "examScope": "selected", "classSectionIds": None},
    ],
)
def test_exam_grant_configuration_rejects_malformed_values(configuration):
    with pytest.raises(ValueError):
        validate_exam_configuration(configuration, institute=None)


@pytest.mark.django_db
@pytest.mark.parametrize("configuration,expected", [
    ({"schemaVersion": 1, "examScope": "branch"}, True),
    ({}, False),
])
def test_teacher_admin_web_eligibility_requires_configured_exam_grant(configuration, expected):
    institute = Institute.objects.create(name="Exam Access Institute", code="EAI")
    branch = Branch.objects.create(institute=institute, name="North", code="NORTH")
    teacher = User.objects.create_user(
        email="teacher@example.test", password="StrongPass123!"
    )
    membership = InstituteMembership.objects.create(
        user=teacher, institute=institute, branch=branch,
        role=InstituteMembership.Role.TEACHER,
    )
    permission, _ = Permission.objects.update_or_create(
        permission_key="assessment.create",
        defaults={"module": "academics", "description": "Create exam drafts", "is_active": True},
    )
    role = Role.objects.create(
        institute=institute, branch=branch, name="Exam Creator", created_by=teacher,
    )
    RolePermission.objects.create(
        role=role, permission=permission, configuration=configuration
    )
    UserRoleAssignment.objects.create(
        user=teacher, role=role, institute=institute, branch=branch,
    )

    eligible = eligible_session_memberships(user=teacher, client="admin-web")
    assert (membership in eligible) is expected
    request = APIRequestFactory().get("/api/v1/admin/roles")
    request.auth = {"client": "admin-web", "membership_id": str(membership.id)}
    request.user = teacher
    assert IsActiveInstituteWebSession().has_permission(request, view=None) is expected
    assert HasAccessControlSession().has_permission(request, view=None) is False
    assert IsAttendanceLeaveReviewer().has_permission(request, view=None) is False
    if expected:
        institute.onboarding_status = Institute.OnboardingStatus.PENDING_REVIEW
        institute.save(update_fields=("onboarding_status", "updated_at"))
        assert IsActiveInstituteWebSession().has_permission(request, view=None) is False


@pytest.mark.django_db
def test_assigned_scope_unions_class_teacher_sections_and_subject_assignments(exam_scope_context):
    context = exam_scope_context
    grant_exam_action(
        actor=context["actor"],
        institute=context["institute"],
        branch=context["north"],
        action="assessment.create",
        configuration={"schemaVersion": 1, "examScope": "assigned"},
    )

    scope = action_scope(
        context["actor"],
        "assessment.create",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
    )

    assert scope["classSectionIds"] == sorted(
        [str(context["class_taught"].id), str(context["subject_taught"].id)]
    )
    assert scope["classSubjectPairs"] == [
        {
            "classSectionId": str(context["subject_taught"].id),
            "subjectId": str(context["math"].id),
        }
    ]
    assert scope_covers(
        context["actor"],
        "assessment.create",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
        section_ids=[context["class_taught"].id, context["subject_taught"].id],
    )
    assert not scope_covers(
        context["actor"],
        "assessment.create",
        institute_id=context["institute"].id,
        branch_id=context["south"].id,
        section_ids=[context["other_branch"].id],
    )


@pytest.mark.django_db
def test_selected_scope_preserves_section_subject_pair_granularity(exam_scope_context):
    context = exam_scope_context
    grant_exam_action(
        actor=context["actor"],
        institute=context["institute"],
        branch=context["north"],
        action="assessment.view",
        configuration={
            "schemaVersion": 1,
            "examScope": "selected",
            "classSectionIds": [str(context["class_taught"].id)],
            "classSubjectPairs": [
                {
                    "classSectionId": str(context["subject_taught"].id),
                    "subjectId": str(context["math"].id),
                }
            ],
        },
    )

    scope = action_scope(
        context["actor"],
        "assessment.view",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
    )

    assert scope["classSectionIds"] == [str(context["class_taught"].id)]
    assert scope["classSubjectPairs"] == [
        {
            "classSectionId": str(context["subject_taught"].id),
            "subjectId": str(context["math"].id),
        }
    ]
    assert scope_covers(
        context["actor"],
        "assessment.view",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
        subject_pairs=[(context["subject_taught"].id, context["math"].id)],
    )
    assert not scope_covers(
        context["actor"],
        "assessment.view",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
        section_ids=[context["subject_taught"].id],
    )
    assert not scope_covers(
        context["actor"],
        "assessment.view",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
        subject_pairs=[(context["subject_taught"].id, context["english"].id)],
    )


@pytest.mark.django_db
def test_branch_scope_covers_only_its_branch(exam_scope_context):
    context = exam_scope_context
    grant_exam_action(
        actor=context["actor"],
        institute=context["institute"],
        branch=context["north"],
        action="assessment.view",
        configuration={"schemaVersion": 1, "examScope": "branch"},
    )

    assert scope_covers(
        context["actor"],
        "assessment.view",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
        section_ids=[context["class_taught"].id, context["subject_taught"].id],
    )
    assert not scope_covers(
        context["actor"],
        "assessment.view",
        institute_id=context["institute"].id,
        branch_id=context["south"].id,
        section_ids=[context["other_branch"].id],
    )


@pytest.mark.django_db
def test_institute_scope_covers_multiple_branches(exam_scope_context):
    context = exam_scope_context
    grant_exam_action(
        actor=context["actor"],
        institute=context["institute"],
        action="assessment.create",
        configuration={"schemaVersion": 1, "examScope": "institute"},
    )

    assert scope_covers(
        context["actor"],
        "assessment.create",
        institute_id=context["institute"].id,
        branch_id=context["south"].id,
        section_ids=[context["other_branch"].id],
    )
    assert scope_covers(
        context["actor"],
        "assessment.create",
        institute_id=context["institute"].id,
        section_ids=[context["class_taught"].id, context["other_branch"].id],
    )


@pytest.mark.django_db
def test_grants_union_within_an_action_without_cross_action_authority(exam_scope_context):
    context = exam_scope_context
    section_grants = (
        (context["class_taught"], "First"),
        (context["subject_taught"], "Second"),
    )
    for section, name in section_grants:
        grant_exam_action(
            actor=context["actor"],
            institute=context["institute"],
            branch=context["north"],
            action="assessment.create",
            configuration={
                "schemaVersion": 1,
                "examScope": "selected",
                "classSectionIds": [str(section.id)],
            },
            name=name,
        )
    grant_exam_action(
        actor=context["actor"],
        institute=context["institute"],
        branch=context["north"],
        action="assessment.view",
        configuration={
            "schemaVersion": 1,
            "examScope": "selected",
            "classSectionIds": [str(context["class_taught"].id)],
        },
    )

    assert scope_covers(
        context["actor"],
        "assessment.create",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
        section_ids=[context["class_taught"].id, context["subject_taught"].id],
    )
    assert not scope_covers(
        context["actor"],
        "assessment.view",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
        section_ids=[context["subject_taught"].id],
    )
    assert not action_scope(
        context["actor"],
        "assessment.edit",
        institute_id=context["institute"].id,
        branch_id=context["north"].id,
    )["allowed"]


@pytest.mark.django_db
def test_expired_and_revoked_assignments_no_longer_cover_scope(exam_scope_context):
    context = exam_scope_context
    assignment = grant_exam_action(
        actor=context["actor"],
        institute=context["institute"],
        branch=context["north"],
        action="assessment.create",
        configuration={
            "schemaVersion": 1,
            "examScope": "selected",
            "classSectionIds": [str(context["class_taught"].id)],
        },
    )
    scope_args = {
        "institute_id": context["institute"].id,
        "branch_id": context["north"].id,
        "section_ids": [context["class_taught"].id],
    }
    assignment.valid_from = timezone.now() + timedelta(days=1)
    assignment.save(update_fields=("valid_from", "updated_at"))
    assert not scope_covers(context["actor"], "assessment.create", **scope_args)

    assignment.valid_from = None
    assignment.save(update_fields=("valid_from", "updated_at"))
    assert scope_covers(context["actor"], "assessment.create", **scope_args)

    assignment.valid_until = timezone.now() - timedelta(seconds=1)
    assignment.save(update_fields=("valid_until", "updated_at"))
    assert not scope_covers(context["actor"], "assessment.create", **scope_args)

    assignment.valid_until = None
    assignment.is_active = False
    assignment.revoked_at = timezone.now()
    assignment.save(update_fields=("valid_until", "is_active", "revoked_at", "updated_at"))
    assert not scope_covers(context["actor"], "assessment.create", **scope_args)


@pytest.mark.django_db
def test_selected_delegation_cannot_widen_current_section_scope(exam_scope_context):
    context = exam_scope_context
    grant_exam_action(
        actor=context["actor"],
        institute=context["institute"],
        branch=context["north"],
        action="assessment.create",
        configuration={
            "schemaVersion": 1,
            "examScope": "selected",
            "classSectionIds": [str(context["class_taught"].id)],
        },
    )

    require_exam_scope_delegation(
        actor=context["actor"],
        action="assessment.create",
        configuration={
            "schemaVersion": 1,
            "examScope": "selected",
            "classSectionIds": [str(context["class_taught"].id)],
        },
        institute=context["institute"],
        branch=context["north"],
    )
    with pytest.raises(ValueError, match="broader than your own"):
        require_exam_scope_delegation(
            actor=context["actor"],
            action="assessment.create",
            configuration={"schemaVersion": 1, "examScope": "branch"},
            institute=context["institute"],
            branch=context["north"],
        )
    with pytest.raises(ValueError, match="outside your own scope"):
        require_exam_scope_delegation(
            actor=context["actor"],
            action="assessment.create",
            configuration={
                "schemaVersion": 1,
                "examScope": "selected",
                "classSectionIds": [str(context["subject_taught"].id)],
            },
            institute=context["institute"],
            branch=context["north"],
        )


@pytest.mark.django_db
def test_branch_and_institute_grants_delegate_only_supported_scopes(exam_scope_context):
    context = exam_scope_context
    grant_exam_action(
        actor=context["actor"],
        institute=context["institute"],
        branch=context["north"],
        action="assessment.view",
        configuration={"schemaVersion": 1, "examScope": "branch"},
    )
    require_exam_scope_delegation(
        actor=context["actor"],
        action="assessment.view",
        configuration={"schemaVersion": 1, "examScope": "branch"},
        institute=context["institute"],
        branch=context["north"],
    )
    with pytest.raises(ValueError, match="broader than your own"):
        require_exam_scope_delegation(
            actor=context["actor"],
            action="assessment.view",
            configuration={"schemaVersion": 1, "examScope": "branch"},
            institute=context["institute"],
            branch=context["south"],
        )

    grant_exam_action(
        actor=context["actor"],
        institute=context["institute"],
        action="assessment.create",
        configuration={"schemaVersion": 1, "examScope": "institute"},
    )
    require_exam_scope_delegation(
        actor=context["actor"],
        action="assessment.create",
        configuration={"schemaVersion": 1, "examScope": "branch"},
        institute=context["institute"],
        branch=context["south"],
    )
    with pytest.raises(ValueError, match="broader than your own"):
        require_exam_scope_delegation(
            actor=context["actor"],
            action="assessment.view",
            configuration={"schemaVersion": 1, "examScope": "institute"},
            institute=context["institute"],
        )
