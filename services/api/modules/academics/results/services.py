import uuid
from collections import Counter
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from modules.academics.models import (
    AcademicTerm,
    ClassSubject,
    ResultCandidate,
    ResultChange,
    ResultComponent,
    ResultExam,
    ResultExamSubject,
    ResultImport,
    ResultMark,
    StudentEnrollment,
    Subject,
    default_result_rules,
)

from .calculations import number, validate_rules
from .permissions import require_admin, sections_for, subjects_for


def identifier(value, label="Identifier"):
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError(f"{label} is invalid.") from None


def exam_date(value, year):
    if not value:
        return None
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        raise ValidationError("Choose a valid exam date.") from None
    if not year.start_date <= parsed <= year.end_date:
        raise ValidationError("Exam date must be within its academic year.")
    return parsed


def change(request, exam, action, detail):
    ResultChange.objects.create(exam=exam, actor=request.user, action=action, detail=detail)


def exam_for(request, exam_id, *, lock=False):
    qs = ResultExam.objects.filter(
        institute=request.institute, section__in=sections_for(request)
    ).prefetch_related("subjects__subject", "subjects__components", "candidates")
    if lock:
        qs = qs.select_for_update()
    return get_object_or_404(qs, id=identifier(exam_id, "Exam"))


@transaction.atomic
def create_exam(request, data):
    require_admin(request)
    section = get_object_or_404(
        sections_for(request).select_for_update(), id=identifier(data.get("sectionId"), "Section")
    )
    name = str(data.get("name", "")).strip()
    exam_type = data.get("examType", "OTHER")
    if (
        not name
        or len(name) > 120
        or exam_type not in ("UNIT_TEST", "HALF_YEARLY", "ANNUAL", "OTHER")
    ):
        raise ValidationError("Enter an exam name (up to 120 characters) and a valid type.")
    if ResultExam.objects.filter(section=section, name=name).exists():
        raise ValidationError("An exam with this name already exists for this section.")
    rules = validate_rules(data.get("rules", default_result_rules()))
    term = None
    if data.get("termId"):
        term = get_object_or_404(
            AcademicTerm, id=identifier(data["termId"]), academic_year=section.academic_year
        )
    subjects = data.get("subjects", [])
    if not isinstance(subjects, list) or not subjects or len(subjects) > 60:
        raise ValidationError("Select between 1 and 60 configured subjects.")
    exam = ResultExam.objects.create(
        institute=request.institute,
        section=section,
        term=term,
        name=name,
        exam_type=exam_type,
        exam_date=exam_date(data.get("examDate"), section.academic_year),
        rules=rules,
    )
    subject_ids = set()
    for order, item in enumerate(subjects):
        subject = get_object_or_404(
            Subject, id=identifier(item.get("subjectId")), institute=request.institute
        )
        if subject.id in subject_ids:
            raise ValidationError("An exam cannot contain a subject twice.")
        subject_ids.add(subject.id)
        if (
            not ClassSubject.objects.filter(
                institute=request.institute, grade=section.grade, subject=subject
            )
            .filter(Q(class_section=section) | Q(class_section__isnull=True))
            .exists()
        ):
            raise ValidationError(f"{subject.name} is not configured for this class.")
        sheet = ResultExamSubject.objects.create(exam=exam, subject=subject, order=order)
        components = item.get("components") or [
            {
                "name": "Total",
                "maximum": item.get("maximum", 100),
                "passMarks": item.get("passMarks", 0),
            }
        ]
        if (
            not isinstance(components, list)
            or len(components) > 10
            or any(not isinstance(c, dict) for c in components)
        ):
            raise ValidationError("Use at most 10 components per subject.")
        names = set()
        for i, component in enumerate(components):
            label = str(component.get("name", "")).strip()
            if not label or len(label) > 60 or label.casefold() in names:
                raise ValidationError(
                    "Component names must be present and unique within a subject."
                )
            names.add(label.casefold())
            maximum = number(
                component.get("maximum"),
                "Maximum marks",
                minimum=Decimal(".01"),
                maximum=Decimal("999999.99"),
            )
            passing = number(component.get("passMarks", 0), "Passing marks", maximum=maximum)
            ResultComponent.objects.create(
                exam_subject=sheet, name=label, maximum=maximum, pass_marks=passing, order=i
            )
    if not set(rules.get("subjects", {})).issubset({str(x) for x in subject_ids}):
        raise ValidationError("Subject options must belong to this exam.")
    ResultCandidate.objects.bulk_create(
        [
            ResultCandidate(exam=exam, enrollment=e)
            for e in StudentEnrollment.objects.filter(class_section=section, left_at__isnull=True)
        ]
    )
    change(request, exam, "CREATED", {"name": name})
    return exam


def normalized_mark(data, component, *, allow_missing=False):
    status = data.get("status", "PRESENT")
    raw_score = data.get("score")
    if raw_score in ("", None) and status == "PRESENT":
        if allow_missing:
            return {"score": None, "status": "MISSING", "note": ""}
        raise ValidationError("Enter a score or choose absent, exempt, or not applicable.")
    if status not in ("PRESENT", "ABSENT", "EXEMPT", "NOT_APPLICABLE"):
        raise ValidationError("Choose a valid attendance status.")
    if status != "PRESENT" and raw_score not in ("", None):
        raise ValidationError("Only present students can have a numeric score.")
    score = number(raw_score, maximum=component.maximum) if status == "PRESENT" else None
    note = str(data.get("note", "")).strip()
    if len(note) > 500:
        raise ValidationError("Remarks must be at most 500 characters.")
    return {"score": score, "status": status, "note": note}


@transaction.atomic
def save_marks(request, exam_id, entries, revisions, *, action="SAVED"):
    exam = exam_for(request, exam_id, lock=True)
    if exam.archived:
        raise ValidationError("This exam is archived.")
    if not isinstance(entries, list) or not entries or len(entries) > 10000:
        raise ValidationError("Save between 1 and 10,000 marks at a time.")
    allowed = {str(s.id): s for s in subjects_for(request, exam).select_for_update()}
    components = {
        str(c.id): c
        for c in ResultComponent.objects.filter(exam_subject__exam=exam).select_related(
            "exam_subject"
        )
    }
    candidates = {str(c.id): c for c in exam.candidates.all()}
    validated = []
    touched = set()
    seen = set()
    for entry in entries:
        component = components.get(str(entry.get("componentId")))
        candidate = candidates.get(str(entry.get("candidateId")))
        sheet = allowed.get(str(component.exam_subject_id)) if component else None
        if not sheet or not candidate:
            raise ValidationError("Student or subject is outside your assigned exam scope.")
        if sheet.state != "DRAFT":
            raise ValidationError(
                f"{sheet.subject.name} is locked. Return or reopen it before editing."
            )
        if str(component.exam_subject.subject_id) in candidate.excluded_subject_ids:
            raise ValidationError("This subject is not applicable to this student.")
        if revisions.get(str(sheet.id)) != sheet.revision:
            raise ValidationError(
                "Marks changed since this sheet was loaded. Reload before saving."
            )
        key = (str(candidate.id), str(component.id))
        if key in seen:
            raise ValidationError("Duplicate student/component entries are not allowed.")
        seen.add(key)
        validated.append(
            (candidate, component, normalized_mark(entry, component, allow_missing=True))
        )
        touched.add(str(sheet.id))
    history = []
    previous = {
        (mark.candidate_id, mark.component_id): mark
        for mark in ResultMark.objects.filter(candidate__exam=exam)
    }
    writes, clears = [], []
    for candidate, component, values in validated:
        old = previous.get((candidate.id, component.id))
        history.append(
            {
                "candidateId": str(candidate.id),
                "componentId": str(component.id),
                "before": {
                    "score": str(old.score) if old and old.score is not None else None,
                    "status": old.status if old else "MISSING",
                    "note": old.note if old else "",
                },
                "after": {
                    **values,
                    "score": str(values["score"]) if values["score"] is not None else None,
                },
            }
        )
        if values["status"] == "MISSING":
            if old:
                clears.append(old.id)
        else:
            writes.append(
                ResultMark(
                    candidate=candidate, component=component, **values, updated_by=request.user
                )
            )
    if clears:
        ResultMark.objects.filter(id__in=clears).delete()
    ResultMark.objects.bulk_create(
        writes,
        update_conflicts=True,
        update_fields=["score", "status", "note", "updated_by", "updated_at"],
        unique_fields=["candidate", "component"],
        batch_size=500,
    )
    for sheet_id in touched:
        sheet = allowed[sheet_id]
        sheet.revision += 1
        sheet.save(update_fields=["revision", "updated_at"])
    change(request, exam, action, {"entries": history})
    return len(validated)


@transaction.atomic
def review_sheet(request, exam_id, sheet_id, data):
    exam = exam_for(request, exam_id, lock=True)
    sheet = get_object_or_404(
        subjects_for(request, exam).select_for_update(), id=identifier(sheet_id)
    )
    action = data.get("action")
    if data.get("revision") != sheet.revision:
        raise ValidationError("This sheet changed. Reload before reviewing it.")
    if action == "submit":
        if sheet.state != "DRAFT":
            raise ValidationError("Only a draft can be submitted.")
        eligible = [
            c.id
            for c in exam.candidates.all()
            if str(sheet.subject_id) not in c.excluded_subject_ids
        ]
        expected = len(eligible) * sheet.components.count()
        actual = ResultMark.objects.filter(
            candidate_id__in=eligible, component__exam_subject=sheet
        ).count()
        if not expected or actual != expected:
            raise ValidationError("Complete all eligible student marks before submitting.")
        sheet.state = "SUBMITTED"
    elif action in ("approve", "return", "reopen"):
        require_admin(request)
        if action == "approve":
            if sheet.state != "SUBMITTED":
                raise ValidationError("Submit the sheet before approval.")
            sheet.state = "APPROVED"
        else:
            if not str(data.get("reason", "")).strip():
                raise ValidationError("A reason is required to return or reopen results.")
            sheet.state = "DRAFT"
    else:
        raise ValidationError("Unknown review action.")
    sheet.revision += 1
    sheet.review_note = str(data.get("reason", ""))[:2000]
    sheet.reviewed_by = request.user
    sheet.save()
    change(request, exam, action.upper(), {"sheetId": str(sheet.id), "reason": sheet.review_note})
    return sheet


def plain_error(exc):
    detail = exc.detail
    return str(detail[0]) if isinstance(detail, list) else str(detail)


def import_profile(value):
    if not isinstance(value, dict) or set(value) - {
        "fatherName",
        "motherName",
        "dob",
        "attendance",
        "remarks",
        "importedTotal",
    }:
        raise ValidationError("Invalid exam profile fields.")
    profile = {}
    for key, raw in value.items():
        text = str(raw).strip()
        if len(text) > (2000 if key == "remarks" else 200):
            raise ValidationError("Imported profile value is too long.")
        if key == "importedTotal" and text:
            number(text, "Imported total", maximum=Decimal("60000000"))
        if key == "dob" and text:
            try:
                date.fromisoformat(text)
            except ValueError:
                raise ValidationError("Date of birth must use YYYY-MM-DD.") from None
        profile[key] = text
    return profile


@transaction.atomic
def validate_import(request, exam_id, data):
    exam = exam_for(request, exam_id, lock=True)
    if exam.archived:
        raise ValidationError("Restore this exam before importing marks.")
    key = identifier(data.get("key"), "Import key")
    existing = ResultImport.objects.filter(exam=exam, key=key).first()
    if existing:
        if existing.actor_id != request.user.id:
            raise ValidationError("This import key belongs to another user.")
        return existing
    rows = data.get("rows", [])
    if not isinstance(rows, list) or not rows or len(rows) > 10000:
        raise ValidationError("Upload between 1 and 10,000 mark values per import.")
    sheets = {str(s.id): s for s in subjects_for(request, exam)}
    components = {
        str(c.id): c
        for c in ResultComponent.objects.filter(exam_subject__in=sheets).select_related(
            "exam_subject__subject"
        )
    }
    candidates = list(exam.candidates.select_related("enrollment__student"))
    entries, errors, seen = [], [], set()
    profile_by_candidate = {}
    existing_marks = {
        (str(m.candidate_id), str(m.component_id))
        for m in ResultMark.objects.filter(candidate__exam=exam)
    }
    by = data.get("matchBy", "roll")
    if by not in ("admission", "roll", "name"):
        raise ValidationError("Choose a valid student matching method.")

    def student_key(value):
        key = " ".join(str(value).strip().casefold().split())
        return (key.lstrip("0") or "0") if by == "roll" and key.isdigit() else key

    lookup = {}
    for candidate in candidates:
        enrollment = candidate.enrollment
        value = (
            enrollment.student.admission_number
            if by == "admission"
            else enrollment.roll_number
            if by == "roll"
            else enrollment.student.full_name
        )
        lookup.setdefault(student_key(value), []).append(candidate)
    duplicates = Counter(
        (student_key(row.get("identifier", "")), str(row.get("componentId"))) for row in rows
    )
    for i, row in enumerate(rows):
        try:
            component = components.get(str(row.get("componentId")))
            if not component:
                raise ValidationError("Map this column to an assigned subject/component.")
            sheet = sheets[str(component.exam_subject_id)]
            if sheet.state != "DRAFT":
                raise ValidationError("This subject is locked.")
            value = student_key(row.get("identifier", ""))
            matches = lookup.get(value, []) if value else []
            if len(matches) != 1:
                raise ValidationError("Student not found or ambiguous in the selected exam roster.")
            candidate = matches[0]
            name = str(row.get("name", "")).strip()
            if (
                name
                and name.casefold() != candidate.enrollment.student.full_name.strip().casefold()
            ):
                raise ValidationError("Student name does not match the selected identifier.")
            if duplicates[(value, str(component.id))] > 1:
                raise ValidationError(
                    "Duplicate student/component in this file; "
                    "remove all duplicates before importing."
                )
            if str(component.exam_subject.subject_id) in candidate.excluded_subject_ids:
                raise ValidationError("Subject is excluded for this student.")
            if (
                row.get("maximum") not in ("", None)
                and number(row["maximum"], "Maximum marks") != component.maximum
            ):
                raise ValidationError(f"Maximum differs from configured value {component.maximum}.")
            if row.get("total") not in ("", None):
                number(row["total"], "Spreadsheet total")
            profile = import_profile(row.get("profile", {}))
            if profile:
                require_admin(request)
                if exam.subjects.exclude(state="DRAFT").exists():
                    raise ValidationError(
                        "Reopen all sheets before importing profile fields or totals."
                    )
                key_id = str(candidate.id)
                if key_id in profile_by_candidate and profile_by_candidate[key_id] != profile:
                    raise ValidationError("Conflicting profile values for the same student.")
                profile_by_candidate[key_id] = profile
            values = normalized_mark(row, component)
            pair = (str(candidate.id), str(component.id))
            if pair in seen:
                raise ValidationError("Duplicate student/component in this file.")
            seen.add(pair)
            if pair in existing_marks and data.get("replace", False) is not True:
                continue
            entries.append(
                {
                    "candidateId": str(candidate.id),
                    "componentId": str(component.id),
                    **values,
                    "score": str(values["score"]) if values["score"] is not None else None,
                    "profile": profile,
                    "row": i + 1,
                }
            )
        except ValidationError as exc:
            errors.append(
                {
                    "row": i + 1,
                    "message": plain_error(exc),
                    "identifier": str(row.get("identifier", "")),
                }
            )
    return ResultImport.objects.create(
        exam=exam,
        actor=request.user,
        key=key,
        filename=str(data.get("filename", "Spreadsheet"))[:200],
        mapping=data.get("mapping", {}),
        rows=entries,
        errors=errors,
        revisions={str(s.id): s.revision for s in sheets.values()},
    )


@transaction.atomic
def commit_import(request, exam_id, job_id, *, valid_only=False):
    exam = exam_for(request, exam_id, lock=True)
    job = get_object_or_404(
        ResultImport.objects.select_for_update(),
        id=identifier(job_id),
        exam=exam,
        actor=request.user,
    )
    if job.state == "COMMITTED":
        return job
    if job.errors and not valid_only:
        raise ValidationError("Resolve errors or explicitly choose to import valid rows only.")
    if not job.rows:
        raise ValidationError("No new valid marks to import.")
    count = save_marks(request, exam_id, job.rows, job.revisions, action="IMPORTED")
    profiles = {
        row["candidateId"]: row.get("profile", {}) for row in job.rows if row.get("profile")
    }
    if profiles:
        require_admin(request)
        if exam.subjects.exclude(state="DRAFT").exists():
            raise ValidationError("Reopen all sheets before importing profile fields or totals.")
        before_profiles = {}
        for candidate in exam.candidates.filter(id__in=profiles):
            before_profiles[str(candidate.id)] = candidate.profile
            profile = profiles[str(candidate.id)]
            candidate.profile = {**candidate.profile, **profile}
            if "remarks" in profile:
                candidate.remark = profile["remarks"]
            candidate.save()
        for sheet in exam.subjects.all():
            sheet.revision += 1
            sheet.save(update_fields=["revision", "updated_at"])
        change(request, exam, "PROFILE_IMPORTED", {"before": before_profiles, "after": profiles})
    job.state = "COMMITTED"
    job.imported_count = count
    job.save()
    return job


@transaction.atomic
def update_exam_setup(request, exam_id, data):
    require_admin(request)
    exam = exam_for(request, exam_id, lock=True)
    if data.get("updatedAt") != exam.updated_at.isoformat():
        raise ValidationError("Exam setup changed since it was opened. Reload before editing.")
    if exam.archived or exam.subjects.exclude(state="DRAFT").exists():
        raise ValidationError(
            "Restore the exam and reopen all subject sheets before changing setup."
        )
    name = str(data.get("name", "")).strip()
    if (
        not name
        or len(name) > 120
        or ResultExam.objects.filter(section=exam.section, name=name).exclude(pk=exam.pk).exists()
    ):
        raise ValidationError("Use a unique exam name of at most 120 characters for this section.")
    exam_type = data.get("examType")
    if exam_type not in ("UNIT_TEST", "HALF_YEARLY", "ANNUAL", "OTHER"):
        raise ValidationError("Choose a valid exam type.")
    rules = validate_rules(data.get("rules", exam.rules))
    subject_data = data.get("subjects", [])
    if not subject_data or len(subject_data) > 60:
        raise ValidationError("Choose between 1 and 60 configured subjects.")
    existing = {str(sheet.subject_id): sheet for sheet in exam.subjects.all()}
    kept_sheets = set()
    for order, item in enumerate(subject_data):
        subject_id = str(identifier(item.get("subjectId")))
        if subject_id in kept_sheets:
            raise ValidationError("A subject can appear only once.")
        kept_sheets.add(subject_id)
        subject = get_object_or_404(Subject, id=subject_id, institute=request.institute)
        if (
            not ClassSubject.objects.filter(
                institute=request.institute, grade=exam.section.grade, subject=subject
            )
            .filter(Q(class_section=exam.section) | Q(class_section__isnull=True))
            .exists()
        ):
            raise ValidationError("Use a subject configured for this class.")
        sheet = existing.get(subject_id)
        if not sheet:
            sheet = ResultExamSubject.objects.create(exam=exam, subject=subject, order=order)
        old_components = {str(component.id): component for component in sheet.components.all()}
        components = item.get("components", [])
        if (
            not isinstance(components, list)
            or not components
            or len(components) > 10
            or any(not isinstance(c, dict) for c in components)
        ):
            raise ValidationError("Define between 1 and 10 components per subject.")
        kept_components = set()
        names = set()
        for component_order, values in enumerate(components):
            label = str(values.get("name", "")).strip()
            if not label or len(label) > 60 or label.casefold() in names:
                raise ValidationError(
                    "Each component needs a unique name of at most 60 characters."
                )
            names.add(label.casefold())
            component = (
                old_components.get(str(values.get("id")))
                if values.get("id")
                else next((c for c in old_components.values() if c.name == label), None)
            )
            if values.get("id") and not component:
                raise ValidationError("A component does not belong to this exam subject.")
            maximum = number(
                values.get("maximum"),
                "Maximum marks",
                minimum=Decimal(".01"),
                maximum=Decimal("999999.99"),
            )
            passing = number(values.get("passMarks", 0), "Passing marks", maximum=maximum)
            if component and component.marks.filter(score__gt=maximum).exists():
                raise ValidationError(
                    f"{subject.name}: maximum cannot be below an already recorded score."
                )
            if component and str(component.id) in kept_components:
                raise ValidationError("A component can appear only once.")
            if component is None:
                component = ResultComponent(exam_subject=sheet)
            component.name = label
            component.maximum = maximum
            component.pass_marks = passing
            component.order = component_order
            component.save()
            kept_components.add(str(component.id))
        removed = sheet.components.exclude(id__in=kept_components)
        if ResultMark.objects.filter(component__in=removed).exists():
            raise ValidationError("A component with recorded marks cannot be removed.")
        removed.delete()
        sheet.order = order
        sheet.revision += 1
        sheet.save()
    for subject_id, sheet in existing.items():
        if subject_id not in kept_sheets:
            if ResultMark.objects.filter(component__exam_subject=sheet).exists():
                raise ValidationError("A subject with recorded marks cannot be removed.")
            sheet.components.all().delete()
            sheet.delete()
    term = None
    if data.get("termId"):
        term = get_object_or_404(
            AcademicTerm, id=identifier(data["termId"]), academic_year=exam.section.academic_year
        )
    if not set(rules.get("subjects", {})).issubset(kept_sheets):
        raise ValidationError("Subject options must belong to this exam.")
    exam.name = name
    exam.exam_type = exam_type
    exam.rules = rules
    exam.term = term
    exam.exam_date = exam_date(data.get("examDate"), exam.section.academic_year)
    exam.save()
    change(request, exam, "SETUP_UPDATED", {"name": name, "rules": rules})
    return exam
