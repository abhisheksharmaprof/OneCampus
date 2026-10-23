import base64
import io
import re
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from modules.academics.models import (
    ResultBatch,
    ResultCandidate,
    ResultDocument,
    ResultExam,
    ResultMark,
)
from modules.documents.models import DocumentTemplate, DocumentTemplateVersion
from modules.documents.presets import PRESET_MARKSHEET
from modules.file_storage.models import FileAsset
from modules.file_storage.storage import get_storage_provider

from .calculations import grade_for, number, summarize
from .permissions import require_admin, sections_for
from .services import identifier

DESIGNS = {
    "Term report": "classic",
    "Compact result slip": "compact",
    "Detailed with rank": "comprehensive",
}


def seed_templates(institute):
    # Install each missing preset, including institutes that already have another marksheet.
    with transaction.atomic():
        type(institute).objects.select_for_update().get(pk=institute.pk)
        for preset in PRESET_MARKSHEET:
            if not DocumentTemplate.objects.filter(
                institute=institute, category="MARKSHEET", name=preset["name"]
            ).exists():
                DocumentTemplate.objects.create(
                    institute=institute,
                    category="MARKSHEET",
                    name=preset["name"],
                    layout=preset["layout"],
                    is_default=False,
                )


def branding_snapshot(institute):
    brand = {
        "name": institute.display_name or institute.name,
        "address": ", ".join(
            filter(
                None,
                [
                    institute.address_line_1,
                    institute.address_line_2,
                    institute.city,
                    institute.state,
                    institute.postal_code,
                ],
            )
        ),
        "color": institute.brand_color
        if re.fullmatch(r"#[0-9a-fA-F]{6}", institute.brand_color)
        else "#2457D6",
        "logo": None,
        "warning": "",
    }
    asset = FileAsset.objects.filter(
        institute=institute,
        owner_type="INSTITUTE",
        owner_id=institute.id,
        asset_type="LOGO",
        status="ACTIVE",
    ).first()
    if asset:
        try:
            if asset.file_size > 10 * 1024 * 1024:
                raise ValueError("Logo exceeds image limit.")
            if asset.storage_provider == "AZURE":
                from modules.file_storage.services import _blob_service_client

                body = (
                    _blob_service_client()
                    .get_blob_client(container=asset.container_name, blob=asset.blob_name)
                    .download_blob()
                    .readall()
                )
            else:
                with get_storage_provider().open(
                    bucket=asset.container_name, key=asset.blob_name
                ) as image:
                    body = image.read(10 * 1024 * 1024 + 1)
            if len(body) > 10 * 1024 * 1024:
                raise ValueError("Logo exceeds image limit.")
            from PIL import Image

            with Image.open(io.BytesIO(body)) as original:
                original.thumbnail((600, 600))
                output = io.BytesIO()
                original.convert("RGBA").save(output, format="PNG")
            brand["logo"] = base64.b64encode(output.getvalue()).decode()
        except Exception:
            brand["warning"] = (
                "The school logo could not be loaded. Check institute branding before issuing."
            )
    elif institute.logo_url:
        brand["warning"] = (
            "Upload your existing logo in Institute Branding to embed it in the marksheet."
        )
    return brand


def validate_report(request, data):
    require_admin(request)
    section = (
        sections_for(request)
        .select_related("grade", "academic_year", "branch")
        .filter(id=identifier(data.get("sectionId")))
        .first()
    )
    if not section:
        raise ValidationError("Choose an authorized class section.")
    exam_ids = data.get("examIds", [])
    if (
        not isinstance(exam_ids, list)
        or not exam_ids
        or len(exam_ids) > 12
        or len(set(exam_ids)) != len(exam_ids)
    ):
        raise ValidationError("Choose between 1 and 12 different exams.")
    exam_ids = [identifier(x) for x in exam_ids]
    qs = ResultExam.objects.filter(
        id__in=exam_ids, section=section, institute=request.institute
    ).prefetch_related("subjects__subject", "subjects__components")
    found = {e.id: e for e in qs}
    if len(found) != len(exam_ids):
        raise ValidationError("All exams must belong to the selected class section.")
    exams = [found[x] for x in exam_ids]
    mode = data.get("mode", "single")
    if mode not in ("single", "comparison", "sum", "weighted") or (
        mode == "single" and len(exams) != 1
    ):
        raise ValidationError(
            "Choose a valid report mode; single-exam reports need exactly one exam."
        )
    weights = data.get("weights", {})
    if mode == "weighted":
        weights = {
            str(e.id): str(number(weights.get(str(e.id)), "Exam weight", maximum=Decimal(100)))
            for e in exams
        }
        if sum(Decimal(v) for v in weights.values()) != 100:
            raise ValidationError("Exam weights must total 100%.")
    ids = data.get("enrollmentIds", [])
    if not isinstance(ids, list) or not ids or len(ids) > 1000 or len(set(ids)) != len(ids):
        raise ValidationError("Select between 1 and 1,000 students, without duplicates.")
    ids = [identifier(x) for x in ids]
    enrollments = {
        c.enrollment_id
        for c in ResultCandidate.objects.filter(exam=exams[0], enrollment_id__in=ids)
    }
    if len(enrollments) != len(ids):
        raise ValidationError("A selected student is outside the first exam roster.")
    template = DocumentTemplate.objects.filter(
        id=identifier(data.get("templateId")), institute=request.institute, category="MARKSHEET"
    ).first()
    if not template or template.name not in DESIGNS:
        raise ValidationError("Choose one of the three supported marksheet presets.")
    preset = next(p for p in PRESET_MARKSHEET if p["name"] == template.name)
    if template.layout != preset["layout"]:
        raise ValidationError(
            "This template has custom canvas edits. Use an unmodified marksheet preset; "
            "configure report options in Marks & Grades."
        )
    title = str(data.get("title", "")).strip() or (
        "Progress Report" if len(exams) > 1 else exams[0].name
    )
    if len(title) > 120:
        raise ValidationError("Report title must be at most 120 characters.")
    if mode in ("weighted", "sum"):
        subject_sets = [{s.subject_id for s in e.subjects.all()} for e in exams]
        if any(s != subject_sets[0] for s in subject_sets):
            raise ValidationError(
                "Consolidation requires the same subjects in each exam. "
                "Use comparison for different subject sets."
            )
    config = {
        "sectionId": str(section.id),
        "examIds": [str(e.id) for e in exams],
        "enrollmentIds": [str(x) for x in ids],
        "templateId": str(template.id),
        "title": title,
        "mode": mode,
        "weights": weights,
        "showGrades": data.get("showGrades", True) is True,
        "showRank": data.get("showRank", False) is True,
        "showAttendance": data.get("showAttendance", False) is True,
        "attendanceStart": data.get("attendanceStart", ""),
        "attendanceEnd": data.get("attendanceEnd", ""),
        "showGuardian": data.get("showGuardian", True) is True,
        "subjectOrder": data.get("subjectOrder", []),
        "showComponents": data.get("showComponents", False) is True,
        "showSignatures": data.get("showSignatures", True) is True,
        "teacherLabel": str(data.get("teacherLabel", "Class teacher"))[:80],
        "principalLabel": str(data.get("principalLabel", "Principal"))[:80],
        "footer": str(data.get("footer", ""))[:500],
        "issueDate": timezone.localdate().isoformat(),
    }
    if config["showAttendance"]:
        try:
            start = date.fromisoformat(config["attendanceStart"])
            end = date.fromisoformat(config["attendanceEnd"])
        except (ValueError, TypeError):
            raise ValidationError("Choose valid attendance start and end dates.") from None
        if (
            start > end
            or start < section.academic_year.start_date
            or end > section.academic_year.end_date
        ):
            raise ValidationError("Attendance dates must be ordered and within the academic year.")
    subject_ids = {str(s.subject_id) for exam in exams for s in exam.subjects.all()}
    if (
        not isinstance(config["subjectOrder"], list)
        or any(not isinstance(x, str) for x in config["subjectOrder"])
        or len(set(config["subjectOrder"])) != len(config["subjectOrder"])
        or not set(config["subjectOrder"]).issubset(subject_ids)
    ):
        raise ValidationError("Subject order must contain unique subjects from the selected exams.")
    from .appearance import validate_appearance

    config["appearance"] = validate_appearance(data.get("appearance", {}), subject_ids)
    if "rank" in config["appearance"].get("sections", []):
        config["showRank"] = True
    return section, exams, template, config


def build_snapshots(request, data, *, issue=False):
    section, exams, template, config = validate_report(request, data)
    if issue and any(s.state != "APPROVED" for e in exams for s in e.subjects.all()):
        raise ValidationError("Approve every selected subject sheet before issuing marksheets.")
    branding = branding_snapshot(request.institute)
    if (
        issue
        and branding["warning"]
        and not config["appearance"].get("logo")
        and config["appearance"].get("crest", "school") == "school"
    ):
        raise ValidationError(branding["warning"])
    candidate_query = ResultCandidate.objects.filter(exam__in=exams)
    candidates = list(candidate_query.select_related("enrollment__student"))
    candidate_map = {(str(c.exam_id), str(c.enrollment_id)): c for c in candidates}
    marks = {
        (str(m.candidate_id), str(m.component_id)): m
        for m in ResultMark.objects.filter(candidate__in=candidates)
    }
    attendance = {}
    if config["showAttendance"]:
        from modules.attendance.models import StudentAttendance

        daily = StudentAttendance.objects.filter(
            institute=request.institute,
            branch=section.branch,
            student_id__in={c.enrollment.student_id for c in candidates},
            period_id__isnull=True,
            date__range=(config["attendanceStart"], config["attendanceEnd"]),
        ).order_by("updated_at")
        last_by_day = {(str(a.student_id), a.date): a.status for a in daily}
        for (student_id, _), status in last_by_day.items():
            counts = attendance.setdefault(student_id, {"present": 0, "recorded": 0})
            counts["recorded"] += 1
            counts["present"] += status in ("PRESENT", "LATE")
    result_cache = {}
    ranks = {}
    from .engine import enrich_results

    for exam in exams:
        cohort = [
            dict(candidateId=str(c.id), **summarize(exam, c, marks))
            for c in candidates
            if c.exam_id == exam.id
        ]
        enrich_results(cohort, exam.rules)
        cohort_by_id = {r["candidateId"]: r for r in cohort}
        for candidate in candidates:
            if candidate.exam_id == exam.id:
                result = cohort_by_id[str(candidate.id)]
                result_cache[(str(exam.id), str(candidate.enrollment_id))] = result
                if result.get("rank"):
                    ranks.setdefault(str(exam.id), {})[str(candidate.enrollment_id)] = result[
                        "rank"
                    ]
    snapshots, issues = [], []
    for enrollment_id in config["enrollmentIds"]:
        first = candidate_map.get((str(exams[0].id), enrollment_id))
        results = []
        for exam in exams:
            candidate = candidate_map.get((str(exam.id), enrollment_id))
            if not candidate:
                issues.append(f"{first.enrollment.student.full_name}: not in {exam.name} roster.")
                continue
            result = dict(
                result_cache.get((str(exam.id), enrollment_id)) or summarize(exam, candidate, marks)
            )
            order = {key: i for i, key in enumerate(config["subjectOrder"])}
            result["rows"] = sorted(
                result["rows"], key=lambda row: order.get(row["subjectId"], len(order))
            )
            if config["showRank"]:
                result["rank"] = ranks.get(str(exam.id), {}).get(enrollment_id)
            results.append(result)
            if result.get("formulaError"):
                issues.append(f"{first.enrollment.student.full_name}: {result['formulaError']}")
            if result["missing"] and not result.get("formulaError"):
                issues.append(
                    f"{first.enrollment.student.full_name}: {result['missing']} "
                    f"missing marks in {exam.name}."
                )
        summary = None
        if (
            config["mode"] in ("sum", "weighted")
            and len(results) == len(exams)
            and not any(r["missing"] for r in results)
        ):
            total = sum(Decimal(r["total"]) for r in results)
            maximum = sum(Decimal(r["maximum"]) for r in results)
            if config["mode"] == "weighted":
                if any(r["percentage"] is None for r in results):
                    issues.append(
                        f"{first.enrollment.student.full_name}: weighted report "
                        "includes an exempt exam."
                    )
                    percent = None
                else:
                    percent = sum(
                        Decimal(r["total"])
                        / Decimal(r["maximum"])
                        * Decimal(config["weights"][r["examId"]])
                        for r in results
                    )
            else:
                percent = total / maximum * 100 if maximum else None
            summary = {
                "total": str(total),
                "maximum": str(maximum),
                "percentage": str(
                    percent.quantize(
                        Decimal(1).scaleb(-exams[-1].rules.get("decimals", 2)),
                        rounding=ROUND_HALF_UP,
                    )
                )
                if percent is not None
                else None,
                "grade": grade_for(percent, exams[-1].rules),
                "result": "Needs improvement"
                if any(r["result"] == "Needs improvement" for r in results)
                else "Exempt"
                if percent is None
                else "Compartment"
                if any(r["result"] == "Compartment" for r in results)
                else "Pass",
            }
        student = first.enrollment.student
        snapshots.append(
            {
                "enrollmentId": enrollment_id,
                "student": {
                    "name": student.full_name,
                    "roll": first.enrollment.roll_number,
                    "admission": student.admission_number,
                    "guardian": first.profile.get("fatherName")
                    or student.father_name
                    or student.mother_name,
                    "mother": first.profile.get("motherName") or student.mother_name,
                    "dob": first.profile.get("dob")
                    or (student.date_of_birth.isoformat() if student.date_of_birth else ""),
                    "attendanceText": first.profile.get("attendance", ""),
                },
                "school": branding,
                "class": f"{section.grade.name} {section.section_name}",
                "academicYear": section.academic_year.name,
                "branch": section.branch.name,
                "config": config,
                "design": config["appearance"].get("design") or DESIGNS[template.name],
                "templateName": template.name,
                "attendance": attendance.get(str(student.id)) if config["showAttendance"] else None,
                "templateLayout": template.layout,
                "rules": [e.rules for e in exams],
                "results": results,
                "summary": summary,
                "draft": not issue,
            }
        )
    if issue and issues:
        raise ValidationError(issues[:50])
    return (
        section,
        template,
        config,
        snapshots,
        issues + ([branding["warning"]] if branding["warning"] else []),
    )


@transaction.atomic
def create_batch(request, data):
    require_admin(request)
    key = identifier(data.get("key"), "Generation key")
    existing = ResultBatch.objects.filter(
        institute=request.institute, section__in=sections_for(request), request_key=key
    ).first()
    if existing:
        return existing
    # Serialize issuance with edits, imports, and approval transitions for a consistent snapshot.
    ids = [identifier(x) for x in data.get("examIds", [])]
    list(
        ResultExam.objects.select_for_update()
        .filter(id__in=ids, institute=request.institute)
        .order_by("id")
    )
    issue = data.get("issue", False) is True
    section, template, config, snapshots, _ = build_snapshots(request, data, issue=issue)
    template = DocumentTemplate.objects.select_for_update().get(pk=template.pk)
    version = template.published_version
    if not version or version.layout != template.layout:
        last = template.versions.order_by("-version").first()
        version = DocumentTemplateVersion.objects.create(
            template=template,
            institute=request.institute,
            version=(last.version + 1 if last else 1),
            name=template.name,
            layout=template.layout,
            published_by=request.user,
        )
        template.published_version = version
        template.save(update_fields=["published_version", "updated_at"])
    batch = ResultBatch.objects.create(
        institute=request.institute,
        section=section,
        created_by=request.user,
        request_key=key,
        config=config,
        template_version=version,
        issue=issue,
        total=len(snapshots),
    )
    for snapshot in snapshots:
        predecessor = None
        if issue:
            predecessor = (
                ResultDocument.objects.filter(
                    enrollment_id=snapshot["enrollmentId"],
                    batch__issue=True,
                    batch__config__examIds=config["examIds"],
                )
                .order_by("-created_at")
                .first()
            )
        import uuid

        document_id = uuid.uuid4()
        snapshot["documentId"] = str(document_id)
        ResultDocument.objects.create(
            id=document_id,
            batch=batch,
            enrollment_id=snapshot["enrollmentId"],
            snapshot=snapshot,
            predecessor=predecessor,
        )
    from modules.academics.tasks import render_result_batch

    transaction.on_commit(lambda: dispatch_batch(batch.id, render_result_batch))
    return batch


def dispatch_batch(batch_id, task):
    try:
        task.delay(str(batch_id))
    except Exception:
        ResultBatch.objects.filter(pk=batch_id).update(
            state="FAILED",
            errors=["The export worker is unavailable. Retry when the worker is running."],
        )
