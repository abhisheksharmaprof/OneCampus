"""Versioned access rules for the structured exam workflow."""

from uuid import UUID

from django.db.models import Q
from django.utils import timezone

from modules.academics.models import ClassSection, ClassSubject, SubjectTeacherAssignment
from modules.institutes.models import Institute

from .models import UserRoleAssignment
from .selectors import active_window_q, actor_is_institute_admin

EXAM_ACTIONS = {
    "assessment.create",
    "assessment.view",
    "assessment.edit",
    "assessment.publish",
    "assessment.timetable.publish",
}
_CONFIG_KEYS = {"schemaVersion", "examScope", "classSectionIds", "classSubjectPairs"}


def validate_exam_configuration(configuration, *, institute, branch=None):
    """Validate and normalize a new exam grant; `{}` stays legacy/unconfigured."""
    if configuration == {}:
        return {}
    if not isinstance(configuration, dict) or set(configuration) - _CONFIG_KEYS:
        raise ValueError("Exam permission configuration has unsupported fields.")
    mode = configuration.get("examScope")
    if (
        type(configuration.get("schemaVersion")) is not int
        or configuration["schemaVersion"] != 1
        or not isinstance(mode, str)
        or mode not in {"assigned", "selected", "branch", "institute"}
    ):
        raise ValueError(
            "Exam permission configuration requires schemaVersion 1 and a valid examScope."
        )
    section_ids = configuration.get("classSectionIds", [])
    pairs = configuration.get("classSubjectPairs", [])
    if not isinstance(section_ids, list) or not isinstance(pairs, list):
        raise ValueError("Exam section and subject scopes must be lists.")
    if mode != "selected" and (section_ids or pairs):
        raise ValueError("Only selected scope may include section or subject targets.")
    if mode == "selected" and not section_ids and not pairs:
        raise ValueError("Selected scope must include a section or section-subject pair.")
    if len(section_ids) != len(set(map(str, section_ids))):
        raise ValueError("Section scope contains duplicates.")
    normalized_pairs = []
    seen_pairs = set()
    for pair in pairs:
        if not isinstance(pair, dict) or set(pair) != {"classSectionId", "subjectId"}:
            raise ValueError("Each subject scope must contain classSectionId and subjectId.")
        normalized = (str(pair["classSectionId"]), str(pair["subjectId"]))
        if normalized in seen_pairs:
            raise ValueError("Subject scope contains duplicates.")
        seen_pairs.add(normalized)
        normalized_pairs.append({"classSectionId": normalized[0], "subjectId": normalized[1]})
    try:
        ids = {str(UUID(str(value))) for value in section_ids} | {
            str(UUID(section_id)) for section_id, _ in seen_pairs
        }
        seen_pairs = {
            (str(UUID(section_id)), str(UUID(subject_id))) for section_id, subject_id in seen_pairs
        }
        normalized_pairs = [
            {"classSectionId": section_id, "subjectId": subject_id}
            for section_id, subject_id in sorted(seen_pairs)
        ]
    except (TypeError, ValueError, AttributeError) as exc:
        raise ValueError("Section and subject identifiers must be UUIDs.") from exc
    sections = list(
        ClassSection.objects.filter(id__in=ids, branch__institute=institute).select_related(
            "branch", "academic_year"
        )
    )
    if len(sections) != len(ids):
        raise ValueError("Every selected section must belong to this institute.")
    if branch and any(str(item.branch_id) != str(branch.id) for item in sections):
        raise ValueError("A branch-scoped role cannot include sections from another branch.")
    if mode == "institute" and branch is not None:
        raise ValueError("Institute-wide scope requires an institute-wide role.")
    if normalized_pairs:
        valid_pairs = set(
            ClassSubject.objects.filter(
                institute=institute,
                class_section_id__in={section_id for section_id, _ in seen_pairs},
                subject_id__in={subject_id for _, subject_id in seen_pairs},
            ).values_list("class_section_id", "subject_id")
        )
        valid_pairs |= set(
            SubjectTeacherAssignment.objects.filter(
                class_section_id__in={section_id for section_id, _ in seen_pairs},
                subject_id__in={subject_id for _, subject_id in seen_pairs},
                class_section__branch__institute=institute,
            ).values_list("class_section_id", "subject_id")
        )
        if any(
            (section_id, subject_id) not in {(str(a), str(b)) for a, b in valid_pairs}
            for section_id, subject_id in seen_pairs
        ):
            raise ValueError("Every subject pair must be valid for its class section.")
    return {
        "schemaVersion": 1,
        "examScope": mode,
        **({"classSectionIds": sorted(map(str, section_ids))} if section_ids else {}),
        **(
            {
                "classSubjectPairs": sorted(
                    normalized_pairs, key=lambda item: (item["classSectionId"], item["subjectId"])
                )
            }
            if normalized_pairs
            else {}
        ),
    }


def _active_exam_grants(actor, action, institute_id, branch_id=None):
    if action not in EXAM_ACTIONS or not getattr(actor, "is_active", False):
        return []
    now = timezone.now()
    qs = UserRoleAssignment.objects.filter(
        user=actor,
        institute_id=institute_id,
        is_active=True,
        revoked_at__isnull=True,
        role__is_active=True,
        role__permission_grants__permission__permission_key=action,
        role__permission_grants__permission__is_active=True,
    ).filter(active_window_q(now))
    if branch_id:
        qs = qs.filter(Q(branch__isnull=True) | Q(branch_id=branch_id))
    qs = qs.select_related("branch", "role").prefetch_related("role__permission_grants__permission")
    return [
        (assignment, grant.configuration)
        for assignment in qs
        for grant in assignment.role.permission_grants.all()
        if grant.permission.is_active and grant.permission.permission_key == action
    ]


def _section_scope(actor, assignment, config, institute_id):
    if not config or not isinstance(config, dict) or config.get("schemaVersion") != 1:
        return set(), set(), False
    institute = Institute.objects.filter(id=institute_id, is_active=True).first()
    if institute is None:
        return set(), set(), False
    try:
        config = validate_exam_configuration(
            config, institute=institute, branch=assignment.role.branch
        )
    except (TypeError, ValueError, AttributeError):
        return set(), set(), False
    mode = config.get("examScope")
    if mode not in {"assigned", "selected", "branch", "institute"}:
        return set(), set(), False
    branch_id = assignment.branch_id or assignment.role.branch_id
    if (
        assignment.branch_id
        and assignment.role.branch_id
        and assignment.branch_id != assignment.role.branch_id
    ):
        return set(), set(), False
    scope = ClassSection.objects.filter(branch__institute_id=institute_id)
    if branch_id:
        scope = scope.filter(branch_id=branch_id)
    if mode == "branch" and assignment.branch_id is None and assignment.role.branch_id is None:
        return set(), set(), False
    if mode == "institute" and (
        assignment.branch_id is not None or assignment.role.branch_id is not None
    ):
        return set(), set(), False
    section_ids = set()
    pairs = set()
    unrestricted = mode in {"branch", "institute"}
    if mode == "selected":
        valid = set(
            map(
                str,
                scope.filter(id__in=config.get("classSectionIds", [])).values_list("id", flat=True),
            )
        )
        section_ids = valid
        pairs = {
            (str(item["classSectionId"]), str(item["subjectId"]))
            for item in config.get("classSubjectPairs", [])
            if str(item.get("classSectionId")) in set(map(str, scope.values_list("id", flat=True)))
        }
    elif mode == "assigned":
        section_ids = set(
            map(str, scope.filter(class_teacher_id=actor.id).values_list("id", flat=True))
        )
        pairs = set(
            (str(section_id), str(subject_id))
            for section_id, subject_id in SubjectTeacherAssignment.objects.filter(
                teacher=actor, class_section__branch__institute_id=institute_id
            )
            .filter(Q(class_section__branch_id=branch_id) if branch_id else Q())
            .values_list("class_section_id", "subject_id")
        )
        # In this stage a subject assignment may authorize targeting that class;
        # later subject-level APIs still receive and enforce the exact pair set.
        section_ids |= {section_id for section_id, _ in pairs}
    return section_ids, pairs, unrestricted


def scope_covers(actor, action, *, institute_id, branch_id=None, section_ids=(), subject_pairs=()):
    """Return whether every requested section/pair is covered by the action's active grants."""
    if action not in EXAM_ACTIONS:
        return False
    institute = Institute.objects.filter(id=institute_id, is_active=True).first()
    if institute is None or not getattr(actor, "is_active", False):
        return False
    if actor_is_institute_admin(actor=actor, institute=institute):
        return True
    section_ids = set(map(str, section_ids))
    subject_pairs = {(str(section_id), str(subject_id)) for section_id, subject_id in subject_pairs}
    if not section_ids and not subject_pairs:
        return False
    covered_sections, covered_pairs = set(), set()
    all_institute = False
    unrestricted_branches = set()
    for assignment, config in _active_exam_grants(actor, action, institute_id, branch_id):
        sections, pairs, unrestricted = _section_scope(actor, assignment, config, institute_id)
        covered_sections |= sections
        covered_pairs |= pairs
        if unrestricted:
            if config.get("examScope") == "institute":
                all_institute = True
            else:
                unrestricted_branches.add(str(assignment.branch_id or assignment.role.branch_id))
    if not section_ids and not subject_pairs:
        return False
    requested_ids = section_ids | {section_id for section_id, _ in subject_pairs}
    requested_sections = {
        str(section_id): str(section_branch)
        for section_id, section_branch in ClassSection.objects.filter(
            id__in=requested_ids, branch__institute_id=institute_id
        ).values_list("id", "branch_id")
    }
    if len(requested_sections) != len(requested_ids):
        return False

    def section_covered(section_id):
        return (
            section_id in covered_sections
            or all_institute
            or requested_sections[section_id] in unrestricted_branches
        )

    return all(section_covered(section_id) for section_id in section_ids) and all(
        section_covered(section_id) or (section_id, subject_id) in covered_pairs
        for section_id, subject_id in subject_pairs
    )


def action_scope(actor, action, *, institute_id, branch_id=None):
    institute = Institute.objects.filter(id=institute_id, is_active=True).first()
    if (
        institute is not None
        and getattr(actor, "is_active", False)
        and actor_is_institute_admin(actor=actor, institute=institute)
    ):
        return {
            "allowed": True,
            "unrestricted": True,
            "classSectionIds": [],
            "classSubjectPairs": [],
        }
    sections, pairs, unrestricted = set(), set(), False
    for assignment, config in _active_exam_grants(actor, action, institute_id, branch_id):
        grant_sections, grant_pairs, grant_unrestricted = _section_scope(
            actor, assignment, config, institute_id
        )
        sections |= grant_sections
        pairs |= grant_pairs
        unrestricted |= grant_unrestricted
    return {
        "allowed": bool(sections or pairs or unrestricted),
        "unrestricted": unrestricted,
        "classSectionIds": sorted(sections),
        "classSubjectPairs": [
            {"classSectionId": section_id, "subjectId": subject_id}
            for section_id, subject_id in sorted(pairs)
        ],
    }


def has_exam_web_access(*, user, membership):
    return any(
        action_scope(
            user, action, institute_id=membership.institute_id, branch_id=membership.branch_id
        )["allowed"]
        for action in ("assessment.create", "assessment.view")
    )


def require_exam_scope_delegation(*, actor, action, configuration, institute, branch=None):
    """Prevent role configuration from widening the delegator's exam scope."""
    if not configuration:
        return
    if actor_is_institute_admin(actor=actor, institute=institute):
        return
    mode = configuration["examScope"]
    grants = _active_exam_grants(actor, action, institute.id, branch.id if branch else None)
    if mode == "assigned":
        if not grants:
            raise ValueError("You cannot delegate an exam scope you do not hold.")
        return
    if mode in {"branch", "institute"}:
        allowed = False
        for assignment, source in grants:
            if not isinstance(source, dict) or source.get("schemaVersion") != 1:
                continue
            source_mode = source.get("examScope")
            assignment_branch = assignment.branch_id or assignment.role.branch_id
            if mode == "institute" and source_mode == "institute" and assignment_branch is None:
                allowed = True
            elif (
                mode == "branch"
                and branch
                and (
                    (source_mode == "branch" and assignment_branch == branch.id)
                    or (source_mode == "institute" and assignment_branch is None)
                )
            ):
                allowed = True
        if not allowed:
            raise ValueError("You cannot delegate an exam scope broader than your own.")
        return
    section_ids = configuration.get("classSectionIds", [])
    pairs = [
        (item["classSectionId"], item["subjectId"])
        for item in configuration.get("classSubjectPairs", [])
    ]
    if not scope_covers(
        actor,
        action,
        institute_id=institute.id,
        branch_id=branch.id if branch else None,
        section_ids=section_ids,
        subject_pairs=pairs,
    ):
        raise ValueError("You cannot delegate exam sections or subjects outside your own scope.")
