import hashlib
import json
from datetime import date
from itertools import combinations

from django.db import IntegrityError, transaction
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError

from modules.access_control.exam_scopes import action_scope, scope_covers
from modules.identity.models import User
from modules.institutes.models import Branch, InstituteMembership
from modules.people.models import Student

from .models import (
    AcademicTerm,
    AcademicYear,
    ClassSection,
    ClassSubject,
    Exam,
    ExamDraftChange,
    ExamElectiveStudentAssignment,
    ExamPaperSchedule,
    ExamPublicationSnapshot,
    ExamRequestReceipt,
    ExamSubjectSelection,
    ExamTarget,
    Room,
    StudentEnrollment,
)


class ExamConflict(APIException):
    status_code = 409
    default_detail = "The exam changed since it was loaded."
    default_code = "revision_conflict"


class RequestKeyConflict(APIException):
    status_code = 409
    default_detail = "This request ID was already used with different input."
    default_code = "request_key_conflict"


class RequestTargetUnavailable(APIException):
    status_code = 409
    default_detail = "This request was already completed, but its exam is no longer available."
    default_code = "request_target_unavailable"


def has_scope(actor, action, institute_id, branch_id=None, section_ids=()):
    return scope_covers(
        actor,
        action,
        institute_id=institute_id,
        branch_id=branch_id,
        section_ids=section_ids,
    )


def exam_timetable_publication(exam):
    if hasattr(exam, "timetable_publications"):
        return exam.timetable_publications[0] if exam.timetable_publications else None
    return ExamPublicationSnapshot.objects.filter(
        exam=exam, snapshot__kind="EXAM_TIMETABLE"
    ).first()


def timetable_is_published(exam):
    return exam_timetable_publication(exam) is not None


def require_scope(actor, action, institute_id, branch_id=None, section_ids=()):
    if not has_scope(actor, action, institute_id, branch_id, section_ids):
        raise PermissionDenied(
            "The required exam permission is not available for this scope.",
            code="permission_required",
        )


def visible_exams(*, actor, institute, action="assessment.view"):
    qs = Exam.objects.filter(institute=institute).select_related(
        "branch", "academic_year", "term", "coordinator"
    )
    # Evaluate against each exam's complete target set before exposing its data.
    return [
        exam
        for exam in qs.prefetch_related(
            "targets__class_section__grade",
            Prefetch(
                "publications",
                queryset=ExamPublicationSnapshot.objects.filter(snapshot__kind="EXAM_TIMETABLE"),
                to_attr="timetable_publications",
            ),
        )
        if has_scope(
            actor,
            action,
            institute.id,
            exam.branch_id,
            [target.class_section_id for target in exam.targets.all()],
        )
    ]


def validate_destination(*, actor, institute, values, action="assessment.create", category=None):
    branch = get_object_or_404(Branch, id=values["campusId"], institute=institute, is_active=True)
    year = get_object_or_404(AcademicYear, id=values["academicYearId"], institute=institute)
    term_id = values.get("termId")
    term = get_object_or_404(AcademicTerm, id=term_id, academic_year=year) if term_id else None
    section_ids = values["classSectionIds"]
    sections = list(
        ClassSection.objects.select_for_update()
        .filter(
            id__in=section_ids,
            branch=branch,
            academic_year=year,
        )
        .select_related("grade")
        .order_by("id")
    )
    if len(sections) != len(set(section_ids)):
        raise ValidationError(
            {"classSectionIds": ["Choose sections from the selected campus and academic year."]}
        )
    if (
        category == Exam.Category.CLASS_TEST
        and len({section.grade_id for section in sections}) != 1
    ):
        raise ValidationError(
            {"classSectionIds": ["A class test must target sections from the same grade."]}
        )
    require_scope(actor, action, institute.id, branch.id, section_ids)

    starts_on = values.get("startsOn")
    ends_on = values.get("endsOn")
    if bool(starts_on) != bool(ends_on):
        raise ValidationError({"startsOn": ["Start and end dates must be supplied together."]})
    if starts_on and ends_on:
        if ends_on < starts_on:
            raise ValidationError({"endsOn": ["End date must be on or after start date."]})
        if starts_on < year.start_date or ends_on > year.end_date:
            raise ValidationError({"startsOn": ["Exam dates must fall within the academic year."]})
        if term and (starts_on < term.start_date or ends_on > term.end_date):
            raise ValidationError({"startsOn": ["Exam dates must fall within the selected term."]})

    coordinator_id = values.get("coordinatorId")
    coordinator = None
    if coordinator_id:
        coordinator = (
            User.objects.filter(
                is_active=True,
                institute_memberships__institute=institute,
                institute_memberships__is_active=True,
                id=coordinator_id,
            )
            .filter(
                Q(institute_memberships__branch=branch)
                | Q(institute_memberships__branch__isnull=True)
            )
            .distinct()
            .first()
        )
        if coordinator is None:
            raise ValidationError(
                {
                    "coordinatorId": [
                        "Choose an active institute member eligible for the selected campus."
                    ]
                }
            )
    return branch, year, term, sections, coordinator


def _canonical(value):
    def convert(obj):
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        if hasattr(obj, "hex"):
            return str(obj)
        raise TypeError(type(obj).__name__)

    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=convert)


def _fingerprint(values):
    return hashlib.sha256(_canonical(values).encode("utf-8")).hexdigest()


def _actor_snapshot(actor):
    display = actor.get_full_name().strip() or actor.email or str(actor.id)
    return actor.id, display[:150]


def _receipt_replay(*, institute, actor, action, request_id, fingerprint):
    receipt = ExamRequestReceipt.objects.filter(
        institute=institute,
        actor_id_snapshot=actor.id,
        action=action,
        request_id=request_id,
    ).first()
    if receipt is None:
        return None
    if receipt.fingerprint != fingerprint:
        raise RequestKeyConflict()
    if receipt.exam_id is None:
        raise RequestTargetUnavailable()
    return receipt


def _record_change(*, exam, actor, action, changes):
    actor_id, display = _actor_snapshot(actor)
    ExamDraftChange.objects.create(
        exam=exam,
        revision=exam.revision,
        actor=actor,
        actor_id_snapshot=actor_id,
        actor_display_snapshot=display,
        action=action,
        changes=changes,
    )


def _create_receipt(*, institute, actor, action, request_id, fingerprint, exam):
    actor_id, display = _actor_snapshot(actor)
    return ExamRequestReceipt.objects.create(
        institute=institute,
        actor=actor,
        actor_id_snapshot=actor_id,
        actor_display_snapshot=display,
        action=action,
        request_id=request_id,
        fingerprint=fingerprint,
        exam=exam,
        saved_revision=exam.revision,
    )


def _exam_values(values):
    return {
        "name": values["name"],
        "category": values["category"],
        "custom_label": values.get("customLabel", "")
        if values["category"] == Exam.Category.OTHER
        else "",
        "term": values.get("_term"),
        "starts_on": values.get("startsOn"),
        "ends_on": values.get("endsOn"),
        "coordinator": values.get("_coordinator"),
        "instructions": values.get("instructions") or "",
    }


@transaction.atomic
def create_exam(*, actor, institute, values):
    values = {
        "termId": None,
        "startsOn": None,
        "endsOn": None,
        "coordinatorId": None,
        "instructions": "",
        **values,
    }
    fingerprint = _fingerprint(values)
    action = ExamRequestReceipt.Action.CREATE
    request_id = values["requestId"]
    replay = _receipt_replay(
        institute=institute,
        actor=actor,
        action=action,
        request_id=request_id,
        fingerprint=fingerprint,
    )
    if replay:
        validate_destination(
            actor=actor, institute=institute, values=values, category=values["category"]
        )
        return replay, True
    branch, year, term, sections, coordinator = validate_destination(
        actor=actor, institute=institute, values=values, category=values["category"]
    )
    data = dict(values, _term=term, _coordinator=coordinator)
    try:
        with transaction.atomic():
            exam = Exam(
                institute=institute,
                branch=branch,
                academic_year=year,
                created_by=actor,
                updated_by=actor,
                **_exam_values(data),
            )
            exam.save()
            ExamTarget.objects.bulk_create(
                [ExamTarget(exam=exam, class_section=section) for section in sections]
            )
            _record_change(
                exam=exam,
                actor=actor,
                action="CREATE",
                changes={
                    "fields": {
                        "name": exam.name,
                        "category": exam.category,
                        "customLabel": exam.custom_label,
                        "campusId": str(exam.branch_id),
                        "academicYearId": str(exam.academic_year_id),
                        "termId": str(exam.term_id) if exam.term_id else None,
                        "startsOn": exam.starts_on.isoformat() if exam.starts_on else None,
                        "endsOn": exam.ends_on.isoformat() if exam.ends_on else None,
                        "coordinatorId": str(exam.coordinator_id) if exam.coordinator_id else None,
                        "instructions": exam.instructions,
                    },
                    "classSectionIds": [str(section.id) for section in sections],
                },
            )
            receipt = _create_receipt(
                institute=institute,
                actor=actor,
                action=action,
                request_id=request_id,
                fingerprint=fingerprint,
                exam=exam,
            )
        return receipt, False
    except IntegrityError:
        replay = _receipt_replay(
            institute=institute,
            actor=actor,
            action=action,
            request_id=request_id,
            fingerprint=fingerprint,
        )
        if replay:
            return replay, True
        raise


@transaction.atomic
def update_exam(*, actor, institute, exam_id, values):
    # The row lock makes revision comparison, target replacement and history one commit.
    try:
        exam = (
            Exam.objects.select_for_update()
            .select_related("branch", "academic_year", "term", "coordinator")
            .get(id=exam_id, institute=institute)
        )
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    current_ids = list(exam.targets.values_list("class_section_id", flat=True))
    require_scope(actor, "assessment.view", institute.id, exam.branch_id, current_ids)
    require_scope(actor, "assessment.edit", institute.id, exam.branch_id, current_ids)
    if exam.status != Exam.Status.DRAFT:
        raise ValidationError({"status": ["Published exams cannot be edited."]})
    if timetable_is_published(exam):
        raise ValidationError({"status": ["The published timetable is immutable."]})
    expected = values.pop("expectedRevision")
    if expected != exam.revision:
        raise ExamConflict()
    proposed_ids = values.get("classSectionIds", current_ids)
    # Only supplied target IDs replace the entire set; all other edits preserve it.
    data = dict(
        values,
        campusId=exam.branch_id,
        academicYearId=exam.academic_year_id,
        classSectionIds=proposed_ids,
    )
    data["category"] = values.get("category", exam.category)
    if "termId" not in values:
        data["termId"] = exam.term_id
    for api_name, model_name in (
        ("startsOn", "starts_on"),
        ("endsOn", "ends_on"),
        ("coordinatorId", "coordinator_id"),
        ("instructions", "instructions"),
    ):
        if api_name not in values:
            existing = getattr(exam, model_name)
            data[api_name] = existing
    branch, year, term, sections, coordinator = validate_destination(
        actor=actor,
        institute=institute,
        values=data,
        action="assessment.edit",
        category=data["category"],
    )
    require_scope(actor, "assessment.edit", institute.id, exam.branch_id, proposed_ids)

    mapped = {
        "name": values.get("name", exam.name),
        "category": values.get("category", exam.category),
        "custom_label": values.get("customLabel", exam.custom_label)
        if values.get("category", exam.category) == Exam.Category.OTHER
        else "",
        "term": term,
        "starts_on": data.get("startsOn"),
        "ends_on": data.get("endsOn"),
        "coordinator": coordinator,
        "instructions": data.get("instructions") or "",
    }
    target_changed = set(proposed_ids) != set(current_ids)
    changed = {key: getattr(exam, key) != value for key, value in mapped.items()}
    if not target_changed and not any(changed.values()):
        return exam
    prior = {
        key: getattr(exam, key).isoformat()
        if isinstance(getattr(exam, key), date)
        else (
            str(getattr(exam, key).id)
            if key in {"term", "coordinator"} and getattr(exam, key)
            else getattr(exam, key)
        )
        for key in mapped
    }
    for key, value in mapped.items():
        setattr(exam, key, value)
    exam.updated_by = actor
    exam.revision += 1
    exam.save()
    if target_changed:
        ExamTarget.objects.filter(exam=exam).delete()
        ExamTarget.objects.bulk_create(
            [ExamTarget(exam=exam, class_section=section) for section in sections]
        )
    changes = {
        key: {
            "from": prior[key],
            "to": (
                value.isoformat()
                if isinstance(value, date)
                else (str(value.id) if key in {"term", "coordinator"} and value else value)
            ),
        }
        for key, value in mapped.items()
        if changed[key]
    }
    if target_changed:
        changes["classSectionIds"] = {
            "from": [str(item) for item in current_ids],
            "to": [str(item) for item in proposed_ids],
        }
    _record_change(exam=exam, actor=actor, action="EDIT", changes=changes)
    return exam


def _current_subject_mappings_by_target(*, targets, institute):
    """Resolve all section mappings in one query, preferring section rows."""
    targets = list(targets)
    if not targets:
        return {}
    rows = list(
        ClassSubject.objects.filter(
            institute=institute,
            grade_id__in={target.class_section.grade_id for target in targets},
            subject__institute=institute,
        )
        .filter(
            Q(class_section_id__in={target.class_section_id for target in targets})
            | Q(class_section__isnull=True)
        )
        .filter(
            Q(subject__branch__isnull=True)
            | Q(subject__branch_id__in={target.class_section.branch_id for target in targets})
        )
        .select_related("subject")
        .order_by("sort_order", "subject__name", "id")
    )
    rows_by_grade = {}
    for row in rows:
        rows_by_grade.setdefault(row.grade_id, []).append(row)
    result = {}
    for target in targets:
        mappings = {}
        for row in rows_by_grade.get(target.class_section.grade_id, []):
            if row.class_section_id not in (None, target.class_section_id):
                continue
            if row.subject.branch_id not in (None, target.class_section.branch_id):
                continue
            key = str(row.subject_id)
            existing = mappings.get(key)
            if existing is None or (row.class_section_id and not existing.class_section_id):
                mappings[key] = row
        result[str(target.class_section_id)] = mappings
    return result


def exam_subject_setup(*, actor, institute, exam_id):
    try:
        exam = (
            Exam.objects.select_related("branch")
            .prefetch_related(
                "targets__class_section__grade",
                "targets__class_section__branch",
                "targets__subject_selections__class_subject__subject",
            )
            .get(id=exam_id, institute=institute)
        )
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc

    targets = list(
        exam.targets.order_by(
            "class_section__grade__name", "class_section__section_name", "class_section_id"
        )
    )
    section_ids = [item.class_section_id for item in targets]
    if not has_scope(actor, "assessment.view", institute.id, exam.branch_id, section_ids):
        raise NotFound()

    result_targets = []
    mappings_by_target = _current_subject_mappings_by_target(targets=targets, institute=institute)
    for target in targets:
        selections = list(target.subject_selections.all())
        selected_subject_ids = {str(item.class_subject.subject_id) for item in selections}
        selections_by_subject = {str(item.class_subject.subject_id): item for item in selections}
        mappings = mappings_by_target[str(target.class_section_id)]
        stale_selections = [
            {
                "id": str(item.class_subject.subject_id),
                "name": item.class_subject.subject.name,
                "code": (
                    item.class_subject.subject_code_override
                    or item.class_subject.subject.subject_code
                ),
                "isElective": item.class_subject.is_elective,
                "isLab": item.class_subject.is_lab,
                "staleMapping": True,
            }
            for item in selections
            if str(item.class_subject.subject_id) not in mappings
        ]
        result_targets.append(
            {
                "classSectionId": str(target.class_section_id),
                "sectionName": target.class_section.section_name,
                "gradeName": target.class_section.grade.name,
                "selectedSubjectIds": sorted(selected_subject_ids),
                "staleSelections": stale_selections,
                "subjects": [
                    {
                        "id": str(mapping.subject_id),
                        "name": mapping.subject.name,
                        "code": mapping.subject_code_override or mapping.subject.subject_code,
                        "isElective": mapping.is_elective,
                        "isLab": mapping.is_lab,
                        "selected": str(mapping.subject_id) in selected_subject_ids,
                        "theoryMax": str(selections_by_subject[str(mapping.subject_id)].theory_max)
                        if str(mapping.subject_id) in selections_by_subject
                        and selections_by_subject[str(mapping.subject_id)].theory_max is not None
                        else str(mapping.default_max_marks)
                        if mapping.default_max_marks is not None
                        else "100.00",
                        "practicalMax": str(
                            selections_by_subject[str(mapping.subject_id)].practical_max
                        )
                        if str(mapping.subject_id) in selections_by_subject
                        and selections_by_subject[str(mapping.subject_id)].practical_max is not None
                        else None,
                        "passMarks": str(selections_by_subject[str(mapping.subject_id)].pass_marks)
                        if str(mapping.subject_id) in selections_by_subject
                        and selections_by_subject[str(mapping.subject_id)].pass_marks is not None
                        else "33.00",
                        "durationMinutes": selections_by_subject[str(mapping.subject_id)].duration_minutes
                        if str(mapping.subject_id) in selections_by_subject
                        else 180,
                        "defaultMaxMarks": str(mapping.default_max_marks)
                        if mapping.default_max_marks is not None
                        else None,
                    }
                    for mapping in mappings.values()
                ],
            }
        )
    return {"examId": str(exam.id), "revision": exam.revision, "targets": result_targets}


@transaction.atomic
def update_exam_subject_setup(*, actor, institute, exam_id, values):
    try:
        exam = (
            Exam.objects.select_for_update()
            .select_related("branch")
            .get(id=exam_id, institute=institute)
        )
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc

    targets = list(
        ExamTarget.objects.select_for_update()
        .filter(exam=exam)
        .select_related("class_section__grade", "class_section__branch")
        .order_by("class_section__grade__name", "class_section__section_name", "class_section_id")
    )
    by_section = {str(target.class_section_id): target for target in targets}
    section_ids = set(by_section)
    require_scope(actor, "assessment.view", institute.id, exam.branch_id, section_ids)
    expected_revision = values["expectedRevision"]
    if expected_revision != exam.revision:
        raise ExamConflict()
    if exam.status != Exam.Status.DRAFT:
        raise ValidationError({"status": ["Published exams cannot be edited."]})
    if timetable_is_published(exam):
        raise ValidationError({"status": ["The published timetable is immutable."]})

    submitted = {str(item["classSectionId"]): item["subjectIds"] for item in values["targets"]}
    submitted_marks = {
        str(item["classSectionId"]): {
            str(row["subjectId"]): row for row in item.get("paperMarks", [])
        }
        for item in values["targets"]
    }
    if set(submitted) != section_ids:
        raise ValidationError(
            {"targets": ["Provide exactly one subject selection for every exam target section."]}
        )

    mappings_by_section = _current_subject_mappings_by_target(
        targets=targets, institute=institute
    )
    existing = {
        section_id: list(
            ExamSubjectSelection.objects.filter(target=target)
            .select_related("class_subject__subject")
            .order_by("class_subject__subject_id")
        )
        for section_id, target in by_section.items()
    }
    proposed_by_section = {}
    changed_sections = []
    touched_pairs = set()
    for section_id in sorted(section_ids):
        target = by_section[section_id]
        requested_ids = set(map(str, submitted[section_id]))
        eligible = mappings_by_section[section_id]
        if not requested_ids.issubset({str(subject_id) for subject_id in eligible}):
            current_subject_ids = {str(subject_id) for subject_id in eligible}
            prior_subject_ids = {str(row.class_subject.subject_id) for row in existing[section_id]}
            stale = requested_ids & prior_subject_ids - current_subject_ids
            if stale:
                raise ValidationError(
                    {
                        "targets": [
                            "A previously selected curriculum mapping changed. "
                            "Remove the stale subject before saving."
                        ]
                    }
                )
            raise ValidationError(
                {
                    "targets": [
                        "Each selected subject must be mapped to the target section's "
                        "current curriculum."
                    ]
                }
            )
        current_rows = existing[section_id]
        prior_ids = {str(row.class_subject.subject_id) for row in current_rows}
        proposed_mappings = [eligible[subject_id] for subject_id in requested_ids]
        prior_mapping_ids = {str(row.class_subject_id) for row in current_rows}
        proposed_mapping_ids = {str(row.id) for row in proposed_mappings}
        existing_by_subject = {str(row.class_subject.subject_id): row for row in current_rows}
        marks_changed = {
            subject_id
            for subject_id, values in submitted_marks[section_id].items()
            if subject_id not in existing_by_subject
            or (
                existing_by_subject[subject_id].theory_max,
                existing_by_subject[subject_id].practical_max,
                existing_by_subject[subject_id].pass_marks,
                existing_by_subject[subject_id].duration_minutes,
            )
            != (
                values["theoryMax"], values["practicalMax"], values["passMarks"],
                values.get("durationMinutes", 180),
            )
        }
        if requested_ids != prior_ids or proposed_mapping_ids != prior_mapping_ids or marks_changed:
            changed_sections.append(section_id)
            touched_pairs |= {
                (section_id, subject_id) for subject_id in prior_ids | requested_ids | marks_changed
            }
        proposed_by_section[section_id] = proposed_mappings

    # Pair-scoped grants authorize only the exact subject pairs being changed;
    # section grants authorize all pairs within their sections. Empty setup is
    # still editable by a section-scoped grant.
    empty_scope_sections = [
        section_id
        for section_id in changed_sections
        if not existing[section_id] and not submitted[section_id]
    ]
    if not changed_sections:
        empty_scope_sections = list(section_ids)
        touched_pairs = {
            (section_id, str(row.class_subject.subject_id))
            for section_id, rows in existing.items()
            for row in rows
        }
    if not scope_covers(
        actor,
        "assessment.edit",
        institute_id=institute.id,
        branch_id=exam.branch_id,
        section_ids=empty_scope_sections,
        subject_pairs=touched_pairs,
    ):
        raise PermissionDenied(
            "The required exam edit permission is not available for each selected subject.",
            code="permission_required",
        )

    if changed_sections:
        before = {}
        after = {}
        retained_selection_ids = []
        for section_id in changed_sections:
            target = by_section[section_id]
            before[section_id] = sorted(
                str(row.class_subject.subject_id) for row in existing[section_id]
            )
            after[section_id] = sorted(
                str(mapping.subject_id) for mapping in proposed_by_section[section_id]
            )
            existing_by_subject = {
                str(row.class_subject.subject_id): row for row in existing[section_id]
            }
            kept_ids = {str(mapping.subject_id) for mapping in proposed_by_section[section_id]}
            for subject_id, selection in existing_by_subject.items():
                if subject_id not in kept_ids:
                    selection.delete()
            for mapping in proposed_by_section[section_id]:
                subject_id = str(mapping.subject_id)
                selection = existing_by_subject.get(subject_id)
                if selection is None:
                    selection = ExamSubjectSelection(target=target, class_subject=mapping)
                else:
                    selection.class_subject = mapping
                marks = submitted_marks[section_id].get(subject_id)
                if marks is not None:
                    selection.theory_max = marks["theoryMax"]
                    selection.practical_max = marks["practicalMax"]
                    selection.pass_marks = marks["passMarks"]
                    selection.duration_minutes = marks.get("durationMinutes", 180)
                selection.save()
                retained_selection_ids.append(selection.id)
        existing_schedule_ids = set(
            ExamPaperSchedule.objects.filter(selection_id__in=retained_selection_ids)
            .values_list("selection_id", flat=True)
        )
        ExamPaperSchedule.objects.bulk_create(
            [
                ExamPaperSchedule(selection_id=selection_id)
                for selection_id in retained_selection_ids
                if selection_id not in existing_schedule_ids
            ],
            batch_size=500,
            ignore_conflicts=True,
        )
        exam.revision += 1
        exam.updated_by = actor
        exam.save(update_fields=("revision", "updated_by", "updated_at"))
        _record_change(
            exam=exam,
            actor=actor,
            action="SUBJECT_SETUP",
            changes={
                "subjectIdsBySection": {"from": before, "to": after},
                "paperMarksBySection": {
                    section_id: {
                        subject_id: {
                            key: str(value) if value is not None else None
                            for key, value in marks.items()
                            if key != "subjectId"
                        }
                        for subject_id, marks in submitted_marks[section_id].items()
                    }
                    for section_id in changed_sections
                    if submitted_marks[section_id]
                },
                "mappingIdsBySection": {
                    "from": {
                        section_id: sorted(
                            str(row.class_subject_id) for row in existing[section_id]
                        )
                        for section_id in changed_sections
                    },
                    "to": {
                        section_id: sorted(
                            str(mapping.id) for mapping in proposed_by_section[section_id]
                        )
                        for section_id in changed_sections
                    },
                },
            },
        )
    return exam_subject_setup(actor=actor, institute=institute, exam_id=exam.id)


def exam_schedule_available(exam):
    return exam.status == Exam.Status.DRAFT or (
        exam.status == Exam.Status.PUBLISHED
        and ExamPublicationSnapshot.objects.filter(
            exam=exam, snapshot__kind="EXAM_SETUP_NOTICE"
        ).exists()
    )


def can_edit_exam_schedule(*, actor, institute, exam, target_section_ids=None):
    if not exam_schedule_available(exam) or timetable_is_published(exam):
        return False
    scope = action_scope(
        actor, "assessment.edit", institute_id=institute.id, branch_id=exam.branch_id
    )
    if not scope["allowed"]:
        return False
    if scope["unrestricted"]:
        return True
    target_sections = set(
        map(
            str,
            target_section_ids
            if target_section_ids is not None
            else exam.targets.values_list("class_section_id", flat=True),
        )
    )
    if target_sections.intersection(scope["classSectionIds"]):
        return True
    target_pairs = set(
        (
            str(section_id),
            str(subject_id),
        )
        for section_id, subject_id in ExamSubjectSelection.objects.filter(
            target__exam=exam
        ).values_list("target__class_section_id", "class_subject__subject_id")
    )
    granted_pairs = {
        (item["classSectionId"], item["subjectId"]) for item in scope["classSubjectPairs"]
    }
    return bool(target_pairs.intersection(granted_pairs))


def exam_schedule(*, actor, institute, exam_id):
    try:
        exam = Exam.objects.select_related("branch").get(id=exam_id, institute=institute)
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    targets = list(exam.targets.select_related("class_section__grade"))
    section_ids = [target.class_section_id for target in targets]
    if not has_scope(actor, "assessment.view", institute.id, exam.branch_id, section_ids):
        raise NotFound()
    if not exam_schedule_available(exam):
        raise ValidationError(
            {"status": ["Schedules are available only for drafts or setup-notice exams."]}
        )
    if timetable_is_published(exam):
        raise ValidationError({"status": ["The published timetable is immutable."]})

    schedules = list(
        ExamPaperSchedule.objects.filter(selection__target__exam=exam)
        .select_related(
            "selection__target__class_section__grade",
            "selection__class_subject__subject",
            "room",
            "invigilator",
        )
        .order_by(
            "selection__target__class_section__grade__name",
            "selection__target__class_section__section_name",
            "selection__class_subject__subject__name",
            "selection__class_subject__subject_id",
        )
    )
    return {
        "examId": str(exam.id),
        "revision": exam.revision,
        "rooms": [
            {"id": str(room.id), "name": room.name}
            for room in Room.objects.filter(
                institute=institute, branch=exam.branch, is_active=True
            ).order_by("name")
        ],
        "invigilators": [
            {"id": str(member.user_id), "name": member.user.get_full_name() or member.user.email}
            for member in InstituteMembership.objects.filter(
                institute=institute, is_active=True, user__is_active=True
            )
            .filter(Q(branch=exam.branch) | Q(branch__isnull=True))
            .select_related("user")
            .order_by("user__first_name", "user__last_name")
            .distinct()
        ],
        "papers": [
            {
                "classSectionId": str(item.selection.target.class_section_id),
                "sectionName": item.selection.target.class_section.section_name,
                "gradeName": item.selection.target.class_section.grade.name,
                "subjectId": str(item.selection.class_subject.subject_id),
                "subjectName": item.selection.class_subject.subject.name,
                "subjectCode": (
                    item.selection.class_subject.subject_code_override
                    or item.selection.class_subject.subject.subject_code
                ),
                "durationMinutes": item.selection.duration_minutes,
                "scheduledOn": item.scheduled_on.isoformat() if item.scheduled_on else None,
                "startTime": item.start_time.isoformat() if item.start_time else None,
                "endTime": item.end_time.isoformat() if item.end_time else None,
                "roomId": str(item.room_id) if item.room_id else None,
                "invigilatorId": str(item.invigilator_id) if item.invigilator_id else None,
            }
            for item in schedules
        ],
    }


@transaction.atomic
def update_exam_schedule(*, actor, institute, exam_id, values):
    try:
        exam = (
            Exam.objects.select_for_update()
            .select_related("branch")
            .get(id=exam_id, institute=institute)
        )
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    targets = list(ExamTarget.objects.select_for_update().filter(exam=exam))
    section_ids = [target.class_section_id for target in targets]
    require_scope(actor, "assessment.view", institute.id, exam.branch_id, section_ids)
    if not exam_schedule_available(exam):
        raise ValidationError({"status": ["Only drafts or setup-notice exams can be scheduled."]})
    if timetable_is_published(exam):
        raise ValidationError({"status": ["The published timetable is immutable."]})
    if values["expectedRevision"] != exam.revision:
        raise ExamConflict()

    existing = list(
        ExamSubjectSelection.objects.filter(target__exam=exam)
        .select_related("target", "class_subject")
        .select_for_update()
    )
    by_pair = {
        (str(item.target.class_section_id), str(item.class_subject.subject_id)): item
        for item in existing
    }
    submitted = {
        (str(item["classSectionId"]), str(item["subjectId"])): item for item in values["papers"]
    }
    if set(submitted) != set(by_pair):
        raise ValidationError(
            {"papers": ["Provide exactly one schedule for every currently selected paper."]}
        )

    schedule_rows = list(
        ExamPaperSchedule.objects.filter(
            selection_id__in=[item.id for item in existing]
        ).select_for_update()
    )
    schedules_by_selection = {item.selection_id: item for item in schedule_rows}
    current_schedules = {
        pair: (
            schedule.scheduled_on,
            schedule.start_time,
            schedule.end_time,
            schedule.room_id,
            schedule.invigilator_id,
        )
        for pair, selection in by_pair.items()
        if (schedule := schedules_by_selection.get(selection.id)) is not None
    }
    changes = {}
    changed_pairs = set()
    schedule_values = {}
    allowed_rooms = set(
        Room.objects.filter(institute=institute, branch=exam.branch, is_active=True).values_list(
            "id", flat=True
        )
    )
    allowed_invigilators = set(
        InstituteMembership.objects.filter(
            institute=institute, is_active=True, user__is_active=True
        )
        .filter(Q(branch=exam.branch) | Q(branch__isnull=True))
        .values_list("user_id", flat=True)
    )
    for pair in by_pair:
        item = submitted[pair]
        scheduled_on, start_time, end_time = (
            item["scheduledOn"],
            item["startTime"],
            item["endTime"],
        )
        if (scheduled_on is None) != (start_time is None) or (start_time is None) != (
            end_time is None
        ):
            raise ValidationError(
                {"papers": ["Set the date, start time, and end time together, or leave all blank."]}
            )
        if scheduled_on and (
            (exam.starts_on and scheduled_on < exam.starts_on)
            or (exam.ends_on and scheduled_on > exam.ends_on)
        ):
            raise ValidationError(
                {"papers": ["Paper dates must fall within the exam date range when set."]}
            )
        prior = current_schedules.get(pair, (None, None, None, None, None))
        room_id = item.get("roomId", prior[3])
        invigilator_id = item.get("invigilatorId", prior[4])
        if room_id is not None and room_id != prior[3] and room_id not in allowed_rooms:
            raise ValidationError({"papers": ["Choose an active room in this campus."]})
        if (
            invigilator_id is not None
            and invigilator_id != prior[4]
            and invigilator_id not in allowed_invigilators
        ):
            raise ValidationError(
                {"papers": ["Choose an active invigilator allowed in this campus."]}
            )
        desired = (scheduled_on, start_time, end_time, room_id, invigilator_id)
        if prior != desired:
            changed_pairs.add(pair)
            changes[f"{pair[0]}:{pair[1]}"] = {
                "from": [
                    (value.isoformat() if hasattr(value, "isoformat") else str(value))
                    if value
                    else None
                    for value in prior
                ],
                "to": [
                    (value.isoformat() if hasattr(value, "isoformat") else str(value))
                    if value
                    else None
                    for value in desired
                ],
            }
        schedule_values[pair] = desired

    if changed_pairs and not scope_covers(
        actor,
        "assessment.edit",
        institute_id=institute.id,
        branch_id=exam.branch_id,
        subject_pairs=changed_pairs,
    ):
        raise PermissionDenied(
            "The required exam edit permission is not available for each changed paper.",
            code="permission_required",
        )

    if changed_pairs:
        updated_schedules = []
        created_schedules = []
        updated_at = timezone.now()
        for pair in changed_pairs:
            selection = by_pair[pair]
            schedule = schedules_by_selection.get(selection.id)
            if schedule is None:
                schedule = ExamPaperSchedule(selection=selection)
                created_schedules.append(schedule)
            else:
                updated_schedules.append(schedule)
            (
                schedule.scheduled_on,
                schedule.start_time,
                schedule.end_time,
                schedule.room_id,
                schedule.invigilator_id,
            ) = schedule_values[pair]
            schedule.updated_at = updated_at
        if updated_schedules:
            ExamPaperSchedule.objects.bulk_update(
                updated_schedules,
                ("scheduled_on", "start_time", "end_time", "room", "invigilator", "updated_at"),
                batch_size=500,
            )
        if created_schedules:
            ExamPaperSchedule.objects.bulk_create(created_schedules, batch_size=500)
        exam.revision += 1
        exam.updated_by = actor
        exam.save(update_fields=("revision", "updated_by", "updated_at"))
        _record_change(
            exam=exam,
            actor=actor,
            action="SCHEDULE_SETUP",
            changes={"papers": changes},
        )
    return exam_schedule(actor=actor, institute=institute, exam_id=exam.id)


def _active_exam_enrollments(*, exam, section_ids):
    return list(
        StudentEnrollment.objects.filter(
            class_section_id__in=section_ids,
            academic_year_id=exam.academic_year_id,
            left_at__isnull=True,
            student__is_active=True,
        )
        .select_related("student", "class_section__grade")
        .order_by("class_section__grade__name", "class_section__section_name", "roll_number")
    )


def exam_coverage(*, actor, institute, exam_id):
    """Summarize active enrollment coverage without exposing marks or candidate PII broadly."""
    try:
        exam = Exam.objects.select_related("branch").get(id=exam_id, institute=institute)
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    targets = list(ExamTarget.objects.filter(exam=exam).select_related("class_section__grade"))
    section_ids = [target.class_section_id for target in targets]
    if not has_scope(actor, "assessment.view", institute.id, exam.branch_id, section_ids):
        raise NotFound()
    if not exam_schedule_available(exam):
        raise ValidationError(
            {"status": ["Coverage is available only for drafts or setup-notice exams."]}
        )

    selections = list(
        ExamSubjectSelection.objects.filter(target__exam=exam)
        .select_related("target__class_section__grade", "class_subject__subject")
        .order_by(
            "target__class_section__grade__name",
            "target__class_section__section_name",
            "class_subject__subject__name",
        )
    )
    enrollments = _active_exam_enrollments(exam=exam, section_ids=section_ids)
    enrollments_by_section = {}
    for enrollment in enrollments:
        enrollments_by_section.setdefault(str(enrollment.class_section_id), []).append(enrollment)
    selections_by_section = {}
    elective_selection_ids = []
    for selection in selections:
        section_id = str(selection.target.class_section_id)
        selections_by_section.setdefault(section_id, []).append(selection)
        if selection.class_subject.is_elective:
            elective_selection_ids.append(selection.id)

    active_enrollment_ids = [row.id for row in enrollments]
    assigned_pairs = set(
        ExamElectiveStudentAssignment.objects.filter(
            selection_id__in=elective_selection_ids,
            enrollment_id__in=active_enrollment_ids,
        ).values_list("selection_id", "enrollment_id")
    )
    assignments_by_section_student = {}
    selection_by_id = {row.id: row for row in selections}
    for selection_id, enrollment_id in assigned_pairs:
        section_id = str(selection_by_id[selection_id].target.class_section_id)
        assignments_by_section_student.setdefault(section_id, set()).add(enrollment_id)

    uncovered = []
    section_results = []
    covered_total = 0
    for target in targets:
        section_id = str(target.class_section_id)
        section_enrollments = enrollments_by_section.get(section_id, [])
        section_selections = selections_by_section.get(section_id, [])
        elective_count = sum(item.class_subject.is_elective for item in section_selections)
        section_covered = 0
        for enrollment in section_enrollments:
            has_any_paper = bool(section_selections)
            has_elective_assignment = (
                not elective_count
                or enrollment.id in assignments_by_section_student.get(section_id, set())
            )
            if has_any_paper and has_elective_assignment:
                section_covered += 1
                continue
            student = enrollment.student
            uncovered.append(
                {
                    "studentId": str(student.id),
                    "fullName": " ".join(filter(None, (student.first_name, student.last_name))),
                    "admissionNumber": student.admission_number,
                    "rollNumber": enrollment.roll_number,
                    "classSectionId": section_id,
                    "sectionName": target.class_section.section_name,
                    "missingElectiveAssignment": bool(
                        elective_count and not has_elective_assignment
                    ),
                    "missingAllPapers": not has_any_paper,
                }
            )
        covered_total += section_covered
        section_results.append(
            {
                "classSectionId": section_id,
                "sectionName": target.class_section.section_name,
                "gradeName": target.class_section.grade.name,
                "activeStudentCount": len(section_enrollments),
                "coveredStudentCount": section_covered,
                "uncoveredStudentCount": len(section_enrollments) - section_covered,
                "nonElectivePaperCount": len(section_selections) - elective_count,
                "electivePaperCount": elective_count,
            }
        )

    total_enrolled = len(enrollments)
    return {
        "examId": str(exam.id),
        "revision": exam.revision,
        "complete": total_enrolled == covered_total,
        "activeStudentCount": total_enrolled,
        "coveredStudentCount": covered_total,
        "uncoveredStudentCount": total_enrolled - covered_total,
        "nonElectivePaperCount": sum(not row.class_subject.is_elective for row in selections),
        "electivePaperCount": sum(row.class_subject.is_elective for row in selections),
        "sections": section_results,
        "uncoveredStudents": uncovered[:100],
        "uncoveredStudentsTruncated": len(uncovered) > 100,
    }


def _intervals_overlap(left_start, left_end, right_start, right_end):
    """Compare local paper times as half-open intervals; adjacent papers do not conflict."""
    return left_start < right_end and left_end > right_start


def _timetable_validation(*, exam, targets, selections, schedules, enrollments, actor, institute):
    publication = exam_timetable_publication(exam)
    if publication:
        snapshot = publication.snapshot
        return {
            "examId": str(exam.id),
            "revision": publication.revision,
            "ready": True,
            "checks": [
                {
                    "code": "papers_scheduled",
                    "label": "Every paper has a date and time",
                    "passed": True,
                },
                {
                    "code": "candidate_coverage",
                    "label": "Every active student is covered",
                    "passed": True,
                },
                {
                    "code": "candidate_conflicts",
                    "label": "No candidate time overlaps",
                    "passed": True,
                },
            ],
            "blockers": [],
            "conflicts": [],
            "blockerCount": 0,
            "conflictCount": 0,
            "publication": {
                "revision": publication.revision,
                "publishedAt": publication.created_at.isoformat(),
                "publishedBy": publication.published_by_display_snapshot,
                "snapshot": snapshot,
            },
            "actions": {"publish": False},
            "papers": snapshot.get("papers", []),
        }
    enrollments_by_section = {}
    student_names = {
        str(item.student_id): " ".join(
            filter(None, (item.student.first_name, item.student.last_name))
        )
        for item in enrollments
    }
    for enrollment in enrollments:
        enrollments_by_section.setdefault(str(enrollment.class_section_id), []).append(enrollment)
    schedules_by_selection = {item.selection_id: item for item in schedules}
    selection_ids = [item.id for item in selections if item.class_subject.is_elective]
    assigned = {}
    for selection_id, enrollment_id, student_id in ExamElectiveStudentAssignment.objects.filter(
        selection_id__in=selection_ids,
        enrollment_id__in=[item.id for item in enrollments],
    ).values_list("selection_id", "enrollment_id", "enrollment__student_id"):
        assigned.setdefault(selection_id, set()).add((enrollment_id, str(student_id)))

    selections_by_section = {}
    for selection in selections:
        selections_by_section.setdefault(str(selection.target.class_section_id), []).append(
            selection
        )

    blockers = []
    papers = []
    if not selections:
        blockers.append(
            {"code": "NO_PAPERS", "message": "Select at least one subject paper before publishing."}
        )
    for selection in selections:
        target = selection.target
        section_id = str(target.class_section_id)
        current_schedule = schedules_by_selection.get(selection.id)
        if not current_schedule or not current_schedule.scheduled_on:
            blockers.append(
                {
                    "code": "PAPER_UNSCHEDULED",
                    "message": (
                        f"{target.class_section.grade.name} {target.class_section.section_name} · "
                        f"{selection.class_subject.subject.name} has no complete date and time."
                    ),
                    "classSectionId": section_id,
                    "subjectId": str(selection.class_subject.subject_id),
                }
            )
            continue
        if selection.class_subject.is_elective:
            candidates = {
                student_id for enrollment_id, student_id in assigned.get(selection.id, set())
            }
        else:
            candidates = {
                str(item.student_id) for item in enrollments_by_section.get(section_id, [])
            }
        papers.append(
            {
                "classSectionId": section_id,
                "subjectId": str(selection.class_subject.subject_id),
                "paperLabel": (
                    f"{target.class_section.grade.name} {target.class_section.section_name} · "
                    f"{selection.class_subject.subject.name}"
                ),
                "scheduledOn": current_schedule.scheduled_on.isoformat(),
                "startTime": current_schedule.start_time.isoformat(timespec="minutes"),
                "endTime": current_schedule.end_time.isoformat(timespec="minutes"),
                "roomId": str(current_schedule.room_id) if current_schedule.room_id else None,
                "invigilatorId": str(current_schedule.invigilator_id)
                if current_schedule.invigilator_id
                else None,
                "theoryMax": str(selection.theory_max)
                if selection.theory_max is not None
                else None,
                "practicalMax": str(selection.practical_max)
                if selection.practical_max is not None
                else None,
                "passMarks": str(selection.pass_marks)
                if selection.pass_marks is not None
                else None,
                "candidateStudentIds": sorted(candidates),
            }
        )

    for target in targets:
        section_id = str(target.class_section_id)
        section_enrollments = enrollments_by_section.get(section_id, [])
        section_selections = selections_by_section.get(section_id, [])
        elective_selections = [
            item for item in section_selections if item.class_subject.is_elective
        ]
        if not section_enrollments:
            continue
        for enrollment in section_enrollments:
            has_paper = bool(section_selections)
            has_elective = not elective_selections or any(
                (enrollment.id, str(enrollment.student_id)) in assigned.get(item.id, set())
                for item in elective_selections
            )
            if has_paper and has_elective:
                continue
            blockers.append(
                {
                    "code": "CANDIDATE_UNCOVERED",
                    "message": (
                        f"{enrollment.student.first_name} {enrollment.student.last_name} in "
                        f"{target.class_section.grade.name} {target.class_section.section_name} "
                        "needs paper coverage."
                    ),
                    "classSectionId": section_id,
                    "studentId": str(enrollment.student_id),
                }
            )

    conflicts = []
    by_candidate_date = {}
    for paper in papers:
        for student_id in paper["candidateStudentIds"]:
            by_candidate_date.setdefault((student_id, paper["scheduledOn"]), []).append(paper)
    for (student_id, _), candidate_papers in by_candidate_date.items():
        for left, right in combinations(candidate_papers, 2):
            if _intervals_overlap(
                left["startTime"], left["endTime"], right["startTime"], right["endTime"]
            ):
                conflicts.append(
                    {
                        "code": "CANDIDATE_OVERLAP",
                        "message": (
                            f"{student_names.get(student_id) or 'A candidate'} is scheduled for "
                            f"overlapping papers: {left['paperLabel']} and {right['paperLabel']}."
                        ),
                        "studentId": student_id,
                        "paperLabel": right["paperLabel"],
                        "otherExamName": exam.name,
                        "scheduledOn": left["scheduledOn"],
                        "startTime": left["startTime"],
                        "endTime": left["endTime"],
                    }
                )

    def resource_conflicts(left, right, *, same_exam=True):
        if left["scheduledOn"] != right.get("scheduledOn") or not _intervals_overlap(
            left["startTime"],
            left["endTime"],
            right.get("startTime", "00:00"),
            right.get("endTime", "00:00"),
        ):
            return []
        # A single paper may be shared by multiple sections in the same room.
        if (
            same_exam
            and left.get("subjectId") == right.get("subjectId")
            and left["startTime"] == right.get("startTime")
            and left["endTime"] == right.get("endTime")
        ):
            return []
        return [
            label
            for field, label in (("roomId", "Room"), ("invigilatorId", "Invigilator"))
            if left.get(field) and left[field] == right.get(field)
        ]

    for left, right in combinations(papers, 2):
        for label in resource_conflicts(left, right):
            conflicts.append(
                {
                    "code": "RESOURCE_OVERLAP",
                    "message": (
                        f"{label} is assigned to overlapping papers: "
                        f"{left['paperLabel']} and {right['paperLabel']}."
                    ),
                }
            )

    prior_publications = (
        ExamPublicationSnapshot.objects.filter(
            exam__institute=institute, snapshot__kind="EXAM_TIMETABLE"
        )
        .exclude(exam_id=exam.id)
        .select_related("exam")
    )
    for publication in prior_publications:
        for prior in publication.snapshot.get("papers", []):
            prior_candidates = set(prior.get("candidateStudentIds", []))
            for paper in papers:
                for label in resource_conflicts(paper, prior, same_exam=False):
                    conflicts.append(
                        {
                            "code": "RESOURCE_OVERLAP",
                            "message": (
                                f"{label} is assigned to an overlapping paper "
                                f"in {publication.exam.name}."
                            ),
                        }
                    )
                overlap = prior_candidates.intersection(paper["candidateStudentIds"])
                if not overlap or prior.get("scheduledOn") != paper["scheduledOn"]:
                    continue
                if _intervals_overlap(
                    prior.get("startTime", "00:00"),
                    prior.get("endTime", "00:00"),
                    paper["startTime"],
                    paper["endTime"],
                ):
                    for student_id in sorted(overlap):
                        conflicts.append(
                            {
                                "code": "CANDIDATE_OVERLAP",
                                "message": (
                                    f"{student_names.get(student_id) or 'A candidate'} has an "
                                    f"overlapping paper in {publication.exam.name}."
                                ),
                                "studentId": student_id,
                                "paperLabel": paper["paperLabel"],
                                "otherExamName": publication.exam.name,
                                "scheduledOn": paper["scheduledOn"],
                                "startTime": paper["startTime"],
                                "endTime": paper["endTime"],
                            }
                        )

    # Bound returned diagnostics while retaining the full readiness decision.
    ready = not blockers and not conflicts
    action_allowed = has_scope(
        actor,
        "assessment.timetable.publish",
        institute.id,
        exam.branch_id,
        [target.class_section_id for target in targets],
    )
    action_allowed = action_allowed and has_scope(
        actor,
        "assessment.publish",
        institute.id,
        exam.branch_id,
        [target.class_section_id for target in targets],
    )
    return {
        "examId": str(exam.id),
        "revision": exam.revision,
        "ready": ready,
        "checks": [
            {
                "code": "papers_scheduled",
                "label": "Every paper has a date and time",
                "passed": not any(
                    item["code"] in {"NO_PAPERS", "PAPER_UNSCHEDULED"} for item in blockers
                ),
            },
            {
                "code": "candidate_coverage",
                "label": "Every active student is covered",
                "passed": not any(item["code"] == "CANDIDATE_UNCOVERED" for item in blockers),
            },
            {
                "code": "candidate_conflicts",
                "label": "No candidate time overlaps",
                "passed": not conflicts,
            },
        ],
        "blockers": blockers[:100],
        "conflicts": conflicts[:100],
        "blockerCount": len(blockers),
        "conflictCount": len(conflicts),
        "publication": None
        if publication is None
        else {
            "revision": publication.revision,
            "publishedAt": publication.created_at.isoformat(),
            "publishedBy": publication.published_by_display_snapshot,
            "snapshot": publication.snapshot,
        },
        "actions": {"publish": action_allowed and publication is None},
        "papers": papers,
    }


def exam_timetable(*, actor, institute, exam_id):
    try:
        exam = Exam.objects.select_related("branch").get(id=exam_id, institute=institute)
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    targets = list(
        ExamTarget.objects.filter(exam=exam)
        .select_related("class_section__grade")
        .order_by("class_section__grade__name", "class_section__section_name")
    )
    section_ids = [item.class_section_id for item in targets]
    if not has_scope(actor, "assessment.view", institute.id, exam.branch_id, section_ids):
        raise NotFound()
    selections = list(
        ExamSubjectSelection.objects.filter(target__exam=exam)
        .select_related("target__class_section__grade", "class_subject__subject")
        .order_by(
            "target__class_section__grade__name",
            "target__class_section__section_name",
            "class_subject__subject__name",
        )
    )
    schedules = list(ExamPaperSchedule.objects.filter(selection__in=selections))
    enrollments = _active_exam_enrollments(exam=exam, section_ids=section_ids)
    return _timetable_validation(
        exam=exam,
        targets=targets,
        selections=selections,
        schedules=schedules,
        enrollments=enrollments,
        actor=actor,
        institute=institute,
    )


@transaction.atomic
def publish_exam_timetable(*, actor, institute, exam_id, expected_revision):
    try:
        exam = (
            Exam.objects.select_for_update(of=("self",))
            .select_related("branch")
            .get(id=exam_id, institute=institute)
        )
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    targets = list(
        ExamTarget.objects.filter(exam=exam)
        .select_related("class_section__grade")
        .order_by("class_section_id")
    )
    section_ids = [item.class_section_id for item in targets]
    require_scope(actor, "assessment.view", institute.id, exam.branch_id, section_ids)
    require_scope(actor, "assessment.timetable.publish", institute.id, exam.branch_id, section_ids)
    if not exam_schedule_available(exam):
        raise ValidationError(
            {"status": ["Publish the exam setup notice before publishing its timetable."]}
        )
    if expected_revision != exam.revision:
        raise ExamConflict()
    existing = exam_timetable_publication(exam)
    if existing:
        raise ValidationError({"status": ["This timetable has already been published."]})

    # Enrollment creation already locks its section. The same stable order avoids
    # publisher/publisher deadlocks; candidate-row locks serialize cross-exam publishes.
    list(ClassSection.objects.select_for_update().filter(id__in=section_ids).order_by("id"))
    selections = list(
        ExamSubjectSelection.objects.filter(target__exam=exam)
        .select_related("target__class_section__grade", "class_subject__subject")
        .order_by("target__class_section_id", "class_subject__subject_id")
    )
    schedules = list(
        ExamPaperSchedule.objects.filter(selection__in=selections)
        .select_related("selection")
        .order_by("selection_id")
    )
    # Serialize publication of overlapping resource assignments across exams.
    room_ids = sorted({item.room_id for item in schedules if item.room_id})
    invigilator_ids = sorted({item.invigilator_id for item in schedules if item.invigilator_id})
    list(Room.objects.select_for_update().filter(id__in=room_ids).order_by("id"))
    list(User.objects.select_for_update().filter(id__in=invigilator_ids).order_by("id"))
    enrollment_ids = list(
        StudentEnrollment.objects.filter(
            class_section_id__in=section_ids,
            academic_year_id=exam.academic_year_id,
            left_at__isnull=True,
            student__is_active=True,
        )
        .values_list("student_id", flat=True)
        .distinct()
        .order_by("student_id")
    )
    list(Student.objects.select_for_update().filter(id__in=enrollment_ids).order_by("id"))
    enrollments = _active_exam_enrollments(exam=exam, section_ids=section_ids)
    # Re-evaluate the roster after acquiring section and candidate locks.
    current_student_ids = sorted({item.student_id for item in enrollments})
    if current_student_ids != sorted(enrollment_ids):
        list(Student.objects.select_for_update().filter(id__in=current_student_ids).order_by("id"))
        enrollments = _active_exam_enrollments(exam=exam, section_ids=section_ids)

    validation = _timetable_validation(
        exam=exam,
        targets=targets,
        selections=selections,
        schedules=schedules,
        enrollments=enrollments,
        actor=actor,
        institute=institute,
    )
    if not validation["ready"]:
        raise ValidationError(
            {
                "timetable": [
                    "Resolve all schedule, coverage, and candidate-conflict blockers "
                    "before publishing."
                ]
            }
        )
    actor_id, display = _actor_snapshot(actor)
    exam.revision += 1
    exam.updated_by = actor
    exam.save(update_fields=("revision", "updated_by", "updated_at"))
    snapshot = {
        "kind": "EXAM_TIMETABLE",
        "examId": str(exam.id),
        "name": exam.name,
        "revision": exam.revision,
        "academicYearId": str(exam.academic_year_id),
        "campusId": str(exam.branch_id),
        "papers": validation["papers"],
        "coverageRule": (
            "active-enrollments; non-electives include all; electives use explicit assignments"
        ),
        "publishedAt": timezone.now().isoformat(),
        "publishedBy": display,
    }
    publication = ExamPublicationSnapshot.objects.create(
        exam=exam,
        revision=exam.revision,
        snapshot=snapshot,
        published_by=actor,
        published_by_id_snapshot=actor_id,
        published_by_display_snapshot=display,
    )
    _record_change(
        exam=exam,
        actor=actor,
        action="TIMETABLE_PUBLISHED",
        changes={"publicationSnapshotId": str(publication.id)},
    )
    return exam_timetable(actor=actor, institute=institute, exam_id=exam.id)


@transaction.atomic
def publish_complete_exam(*, actor, institute, exam_id, expected_revision):
    """Publish both snapshots together, including for existing notice-only exams."""
    try:
        exam = Exam.objects.select_for_update(of=("self",)).get(id=exam_id, institute=institute)
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    section_ids = list(exam.targets.values_list("class_section_id", flat=True))
    require_scope(actor, "assessment.view", institute.id, exam.branch_id, section_ids)
    require_scope(actor, "assessment.publish", institute.id, exam.branch_id, section_ids)
    require_scope(actor, "assessment.timetable.publish", institute.id, exam.branch_id, section_ids)
    if exam.revision != expected_revision:
        raise ExamConflict()
    if exam.status == Exam.Status.DRAFT:
        exam, _ = publish_exam(
            actor=actor, institute=institute, exam_id=exam_id, expected_revision=expected_revision
        )
    return publish_exam_timetable(
        actor=actor, institute=institute, exam_id=exam_id, expected_revision=exam.revision
    )


def exam_elective_candidates(
    *, actor, institute, exam_id, class_section_id, subject_id, search="", page=1, page_size=25
):
    try:
        exam = Exam.objects.select_related("branch").get(id=exam_id, institute=institute)
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    try:
        selection = ExamSubjectSelection.objects.select_related(
            "target__class_section__grade", "class_subject__subject"
        ).get(
            target__exam=exam,
            target__class_section_id=class_section_id,
            class_subject__subject_id=subject_id,
        )
    except ExamSubjectSelection.DoesNotExist as exc:
        raise NotFound() from exc
    if not has_scope(actor, "assessment.view", institute.id, exam.branch_id, [class_section_id]):
        raise NotFound()
    if not exam_schedule_available(exam):
        raise ValidationError(
            {"status": ["Candidate coverage is available only for drafts or setup-notice exams."]}
        )
    if not selection.class_subject.is_elective:
        raise ValidationError(
            {"subjectId": ["Only elective papers need explicit student assignments."]}
        )

    enrollments = StudentEnrollment.objects.filter(
        class_section_id=class_section_id,
        academic_year_id=exam.academic_year_id,
        left_at__isnull=True,
        student__is_active=True,
    ).select_related("student")
    if search:
        enrollments = enrollments.filter(
            Q(roll_number__icontains=search)
            | Q(student__admission_number__icontains=search)
            | Q(student__first_name__icontains=search)
            | Q(student__last_name__icontains=search)
        )
    enrollments = enrollments.order_by("roll_number", "student__first_name", "student__last_name")
    active_ids = StudentEnrollment.objects.filter(
        class_section_id=class_section_id,
        academic_year_id=exam.academic_year_id,
        left_at__isnull=True,
        student__is_active=True,
    ).values_list("id", flat=True)
    assigned_student_ids = list(
        ExamElectiveStudentAssignment.objects.filter(
            selection=selection, enrollment_id__in=active_ids
        ).values_list("enrollment__student_id", flat=True)
    )
    from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator

    paginator = Paginator(enrollments, page_size)
    try:
        page_obj = paginator.page(page)
    except PageNotAnInteger:
        page_obj = paginator.page(1)
    except EmptyPage:
        page_obj = paginator.page(paginator.num_pages or 1)
    assigned_set = set(map(str, assigned_student_ids))
    return {
        "examId": str(exam.id),
        "revision": exam.revision,
        "classSectionId": str(class_section_id),
        "subjectId": str(subject_id),
        "subjectName": selection.class_subject.subject.name,
        "assignedStudentIds": sorted(assigned_set),
        "count": paginator.count,
        "page": page_obj.number,
        "pageSize": page_size,
        "totalPages": paginator.num_pages,
        "items": [
            {
                "studentId": str(item.student_id),
                "fullName": " ".join(
                    filter(None, (item.student.first_name, item.student.last_name))
                ),
                "admissionNumber": item.student.admission_number,
                "rollNumber": item.roll_number,
                "isAssigned": str(item.student_id) in assigned_set,
            }
            for item in page_obj.object_list
        ],
    }


@transaction.atomic
def update_exam_elective_candidates(
    *, actor, institute, exam_id, class_section_id, subject_id, values
):
    try:
        exam = (
            Exam.objects.select_for_update()
            .select_related("branch")
            .get(id=exam_id, institute=institute)
        )
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    if not exam_schedule_available(exam):
        raise ValidationError(
            {"status": ["Candidate coverage is available only for drafts or setup-notice exams."]}
        )
    if timetable_is_published(exam):
        raise ValidationError({"status": ["Published timetable candidate coverage is immutable."]})
    if values["expectedRevision"] != exam.revision:
        raise ExamConflict()
    try:
        selection = (
            ExamSubjectSelection.objects.select_related("target")
            .select_for_update()
            .get(
                target__exam=exam,
                target__class_section_id=class_section_id,
                class_subject__subject_id=subject_id,
            )
        )
    except ExamSubjectSelection.DoesNotExist as exc:
        raise NotFound() from exc
    require_scope(actor, "assessment.view", institute.id, exam.branch_id, [class_section_id])
    if not selection.class_subject.is_elective:
        raise ValidationError(
            {"subjectId": ["Only elective papers need explicit student assignments."]}
        )
    requested_ids = set(map(str, values["studentIds"]))
    eligible = list(
        StudentEnrollment.objects.filter(
            student_id__in=requested_ids,
            class_section_id=class_section_id,
            academic_year_id=exam.academic_year_id,
            left_at__isnull=True,
            student__is_active=True,
        ).values_list("id", "student_id")
    )
    eligible_by_student = {str(student_id): enrollment_id for enrollment_id, student_id in eligible}
    if set(eligible_by_student) != requested_ids:
        raise ValidationError(
            {
                "studentIds": [
                    "Every selected student must have an active enrollment in this exam "
                    "section and year."
                ]
            }
        )
    current_ids = set(
        map(
            str,
            ExamElectiveStudentAssignment.objects.filter(selection=selection).values_list(
                "enrollment__student_id", flat=True
            ),
        )
    )
    if current_ids != requested_ids:
        if not scope_covers(
            actor,
            "assessment.edit",
            institute_id=institute.id,
            branch_id=exam.branch_id,
            subject_pairs={(str(class_section_id), str(subject_id))},
        ):
            raise PermissionDenied(
                "The required exam edit permission is not available for this paper.",
                code="permission_required",
            )
        ExamElectiveStudentAssignment.objects.filter(selection=selection).delete()
        ExamElectiveStudentAssignment.objects.bulk_create(
            [
                ExamElectiveStudentAssignment(selection=selection, enrollment_id=enrollment_id)
                for enrollment_id in eligible_by_student.values()
            ],
            batch_size=500,
        )
        exam.revision += 1
        exam.updated_by = actor
        exam.save(update_fields=("revision", "updated_by", "updated_at"))
        _record_change(
            exam=exam,
            actor=actor,
            action="ELECTIVE_ASSIGNMENT",
            changes={
                "classSectionId": str(class_section_id),
                "subjectId": str(subject_id),
                "addedStudentIds": sorted(requested_ids - current_ids),
                "removedStudentIds": sorted(current_ids - requested_ids),
            },
        )
    return exam_elective_candidates(
        actor=actor,
        institute=institute,
        exam_id=exam.id,
        class_section_id=class_section_id,
        subject_id=subject_id,
    )


@transaction.atomic
def duplicate_exam(*, actor, institute, source_id, values):
    values = {"termId": None, "startsOn": None, "endsOn": None, **values}
    fingerprint_input = dict(values, sourceExamId=source_id)
    fingerprint = _fingerprint(fingerprint_input)
    action = ExamRequestReceipt.Action.DUPLICATE
    request_id = values["requestId"]
    replay = _receipt_replay(
        institute=institute,
        actor=actor,
        action=action,
        request_id=request_id,
        fingerprint=fingerprint,
    )
    if replay:
        try:
            source = Exam.objects.get(id=source_id, institute=institute)
        except Exam.DoesNotExist as exc:
            raise NotFound() from exc
        require_scope(
            actor,
            "assessment.view",
            institute.id,
            source.branch_id,
            list(source.targets.values_list("class_section_id", flat=True)),
        )
        validate_destination(
            actor=actor, institute=institute, values=values, category=source.category
        )
        return replay, True
    try:
        source = Exam.objects.prefetch_related("targets").get(id=source_id, institute=institute)
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    source_ids = list(source.targets.values_list("class_section_id", flat=True))
    require_scope(actor, "assessment.view", institute.id, source.branch_id, source_ids)
    branch, year, term, sections, _ = validate_destination(
        actor=actor, institute=institute, values=values, category=source.category
    )
    data = dict(
        values,
        category=source.category,
        customLabel=source.custom_label,
        instructions=source.instructions,
        _term=term,
        _coordinator=None,
    )
    try:
        with transaction.atomic():
            exam = Exam(
                institute=institute,
                branch=branch,
                academic_year=year,
                category=source.category,
                custom_label=source.custom_label,
                instructions=source.instructions,
                source_exam=source,
                created_by=actor,
                updated_by=actor,
                **{
                    key: value
                    for key, value in _exam_values(data).items()
                    if key not in {"category", "custom_label", "instructions"}
                },
            )
            exam.save()
            ExamTarget.objects.bulk_create(
                [ExamTarget(exam=exam, class_section=section) for section in sections]
            )
            _record_change(
                exam=exam,
                actor=actor,
                action="DUPLICATE",
                changes={
                    "sourceExamId": str(source.id),
                    "fields": {
                        "name": exam.name,
                        "category": exam.category,
                        "customLabel": exam.custom_label,
                        "campusId": str(exam.branch_id),
                        "academicYearId": str(exam.academic_year_id),
                        "termId": str(exam.term_id) if exam.term_id else None,
                        "startsOn": exam.starts_on.isoformat() if exam.starts_on else None,
                        "endsOn": exam.ends_on.isoformat() if exam.ends_on else None,
                        "coordinatorId": str(exam.coordinator_id) if exam.coordinator_id else None,
                        "instructions": exam.instructions,
                    },
                    "classSectionIds": [str(section.id) for section in sections],
                },
            )
            receipt = _create_receipt(
                institute=institute,
                actor=actor,
                action=action,
                request_id=request_id,
                fingerprint=fingerprint,
                exam=exam,
            )
        return receipt, False
    except IntegrityError:
        replay = _receipt_replay(
            institute=institute,
            actor=actor,
            action=action,
            request_id=request_id,
            fingerprint=fingerprint,
        )
        if replay:
            return replay, True
        raise


def effective_exam_actions(*, actor, institute, branch_id=None):
    return {
        action.removeprefix("assessment."): action_scope(
            actor, action, institute_id=institute.id, branch_id=branch_id
        )
        for action in (
            "assessment.create",
            "assessment.view",
            "assessment.edit",
            "assessment.publish",
        )
    }


@transaction.atomic
def publish_exam(*, actor, institute, exam_id, expected_revision):
    try:
        exam = (
            Exam.objects.select_for_update(of=("self",))
            .select_related("branch", "academic_year", "term", "coordinator")
            .prefetch_related("targets__class_section__grade")
            .get(id=exam_id, institute=institute)
        )
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    targets = list(exam.targets.all())
    section_ids = [target.class_section_id for target in targets]
    require_scope(actor, "assessment.view", institute.id, exam.branch_id, section_ids)
    require_scope(actor, "assessment.publish", institute.id, exam.branch_id, section_ids)
    if timetable_is_published(exam):
        raise ValidationError({"status": ["The published timetable is immutable."]})
    if expected_revision != exam.revision:
        raise ExamConflict()
    if exam.status != Exam.Status.DRAFT:
        raise ValidationError({"status": ["Only draft exams can be published."]})
    if not targets:
        raise ValidationError({"classSectionIds": ["An exam needs at least one class section."]})
    actor_id, display = _actor_snapshot(actor)
    snapshot = {
        "kind": "EXAM_SETUP_NOTICE",
        "name": exam.name,
        "category": exam.category,
        "customLabel": exam.custom_label,
        "campusId": str(exam.branch_id),
        "academicYearId": str(exam.academic_year_id),
        "termId": str(exam.term_id) if exam.term_id else None,
        "startsOn": exam.starts_on.isoformat() if exam.starts_on else None,
        "endsOn": exam.ends_on.isoformat() if exam.ends_on else None,
        "coordinatorId": str(exam.coordinator_id) if exam.coordinator_id else None,
        "instructions": exam.instructions,
        "classSections": [
            {
                "id": str(t.class_section_id),
                "name": t.class_section.section_name,
                "grade": t.class_section.grade.name,
            }
            for t in targets
        ],
    }
    exam.status = Exam.Status.PUBLISHED
    exam.revision += 1
    exam.updated_by = actor
    exam.save(update_fields=("status", "revision", "updated_by", "updated_at"))
    publication = ExamPublicationSnapshot.objects.create(
        exam=exam,
        revision=exam.revision,
        snapshot=snapshot,
        published_by=actor,
        published_by_id_snapshot=actor_id,
        published_by_display_snapshot=display,
    )
    _record_change(
        exam=exam,
        actor=actor,
        action="PUBLISHED",
        changes={"publicationSnapshotId": str(publication.id)},
    )
    return exam, publication
