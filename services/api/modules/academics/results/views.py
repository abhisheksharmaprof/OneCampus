import base64
import csv
import io
import zipfile
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import (
    AcademicOperation,
    ResultBatch,
    ResultCandidate,
    ResultComponent,
    ResultDocument,
    ResultExam,
    ResultMark,
    ResultReport,
    StudentEnrollment,
)
from modules.documents.models import DocumentTemplate

from .calculations import number, summarize
from .engine import enrich_results
from .permissions import ResultsPermission, is_teacher, require_admin, sections_for, subjects_for
from .reports import (
    branding_snapshot,
    build_snapshots,
    create_batch,
    dispatch_batch,
    seed_templates,
)
from .services import (
    change,
    commit_import,
    create_exam,
    exam_for,
    identifier,
    review_sheet,
    save_marks,
    validate_import,
)


def success(data, status=200):
    return Response({"success": True, "data": data}, status=status)


def sheet_data(sheet):
    return {
        "id": str(sheet.id),
        "subjectId": str(sheet.subject_id),
        "name": sheet.subject.name,
        "state": sheet.state,
        "revision": sheet.revision,
        "reviewNote": sheet.review_note,
        "components": [
            {
                "id": str(c.id),
                "name": c.name,
                "maximum": str(c.maximum),
                "passMarks": str(c.pass_marks),
            }
            for c in sheet.components.all()
        ],
    }


def exam_data(exam):
    return {
        "id": str(exam.id),
        "name": exam.name,
        "updatedAt": exam.updated_at.isoformat(),
        "termId": str(exam.term_id) if exam.term_id else None,
        "examDate": exam.exam_date.isoformat() if exam.exam_date else None,
        "sectionId": str(exam.section_id),
        "examType": exam.exam_type,
        "rules": exam.rules,
        "archived": exam.archived,
        "subjects": [sheet_data(s) for s in exam.subjects.all()],
        "candidateCount": exam.candidates.count(),
    }


def batch_data(batch):
    return {
        "id": str(batch.id),
        "title": batch.config.get("title"),
        "sectionId": str(batch.section_id),
        "state": batch.state,
        "issue": batch.issue,
        "total": batch.total,
        "completed": batch.completed,
        "errors": batch.errors,
        "createdAt": batch.created_at,
        "documents": [
            {
                "id": str(d["id"]),
                "name": d["snapshot__student__name"],
                "ready": d["ready"],
                "error": d["error"],
            }
            for d in batch.documents.values("id", "snapshot__student__name", "error").annotate(
                ready=Q(pdf__isnull=False)
            )
        ],
    }


class ResultsView(APIView):
    permission_classes = (ResultsPermission,)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method not in ("POST", "PATCH"):
            return
        if not isinstance(request.data, dict):
            raise ValidationError("Provide a JSON object.")
        for field in (
            "subjects",
            "entries",
            "rows",
            "examIds",
            "enrollmentIds",
            "excludedSubjectIds",
        ):
            value = request.data.get(field)
            if field in request.data and not isinstance(value, list):
                raise ValidationError(f"{field} must be a list.")
        for field in ("examIds", "enrollmentIds", "excludedSubjectIds"):
            if any(not isinstance(value, str) for value in request.data.get(field, [])):
                raise ValidationError(f"{field} must contain identifier strings.")
        for field in ("subjects", "entries", "rows"):
            if any(not isinstance(item, dict) for item in request.data.get(field, [])):
                raise ValidationError(f"{field} must contain objects.")
        for field in ("rules", "weights", "mapping", "revisions"):
            if field in request.data and not isinstance(request.data[field], dict):
                raise ValidationError(f"{field} must be an object.")


class BootstrapView(ResultsView):
    def get(self, request):
        sections = (
            sections_for(request)
            .select_related("grade", "academic_year", "branch")
            .prefetch_related("academic_year__terms", "grade__curriculum_subjects__subject")
        )
        branch_id = request.query_params.get("branchId")
        if branch_id and branch_id != "all":
            sections = sections.filter(branch_id=identifier(branch_id))
        items = []
        teacher_subjects = {}
        if is_teacher(request):
            from modules.academics.models import SubjectTeacherAssignment

            for assignment in SubjectTeacherAssignment.objects.filter(
                teacher=request.user, class_section__in=sections
            ):
                teacher_subjects.setdefault(assignment.class_section_id, set()).add(
                    assignment.subject_id
                )
        for section in sections:
            curricula = [
                c
                for c in section.grade.curriculum_subjects.all()
                if c.class_section_id in (None, section.id)
            ]
            if is_teacher(request):
                curricula = [
                    c for c in curricula if c.subject_id in teacher_subjects.get(section.id, set())
                ]
            subjects = {
                str(c.subject_id): {
                    "id": str(c.subject_id),
                    "name": c.subject.name,
                    "maximum": str(c.default_max_marks or 100),
                    "elective": c.is_elective,
                }
                for c in curricula
            }
            items.append(
                {
                    "id": str(section.id),
                    "name": f"{section.grade.name} {section.section_name}",
                    "gradeId": str(section.grade_id),
                    "grade": section.grade.name,
                    "section": section.section_name,
                    "yearId": str(section.academic_year_id),
                    "year": section.academic_year.name,
                    "current": section.academic_year.is_current,
                    "branchId": str(section.branch_id),
                    "branch": section.branch.name,
                    "subjects": list(subjects.values()),
                    "terms": [
                        {"id": str(t.id), "name": t.name} for t in section.academic_year.terms.all()
                    ],
                }
            )
        templates = []
        if not is_teacher(request):
            seed_templates(request.institute)
            templates = [
                {"id": str(t.id), "name": t.name}
                for t in DocumentTemplate.objects.filter(
                    institute=request.institute,
                    category="MARKSHEET",
                    name__in=["Term report", "Compact result slip", "Detailed with rank"],
                )
            ]
        brand = branding_snapshot(request.institute)
        branding_data = {
            "name": brand["name"],
            "address": brand["address"],
            "color": brand["color"],
            "logoUrl": "data:image/png;base64," + brand["logo"] if brand["logo"] else None,
        }
        return success(
            {
                "sections": items,
                "templates": templates,
                "canManage": not is_teacher(request),
                "branding": branding_data,
            }
        )


class ExamListView(ResultsView):
    def get(self, request):
        exams = (
            ResultExam.objects.filter(
                institute=request.institute, section__in=sections_for(request)
            )
            .select_related("section")
            .prefetch_related("subjects__subject", "subjects__components", "candidates")
        )
        if request.query_params.get("sectionId"):
            exams = exams.filter(section_id=identifier(request.query_params["sectionId"]))
        return success([exam_data(e) for e in exams])

    def post(self, request):
        return success(exam_data(create_exam(request, request.data)), 201)


class ExamDetailView(ResultsView):
    def get(self, request, exam_id):
        exam = exam_for(request, exam_id)
        sheets = list(
            subjects_for(request, exam).select_related("subject").prefetch_related("components")
        )
        candidates = list(
            exam.candidates.select_related("enrollment__student").order_by(
                "enrollment__roll_number"
            )
        )
        marks = list(
            ResultMark.objects.filter(candidate__exam=exam, component__exam_subject__in=sheets)
        )
        mark_map = {(str(m.candidate_id), str(m.component_id)): m for m in marks}
        photo_map = {}
        try:
            from modules.file_storage.models import FileAsset
            from modules.file_storage.services import asset_read_url

            photo_assets = FileAsset.objects.filter(
                institute=request.institute,
                owner_type=FileAsset.OwnerType.STUDENT,
                owner_id__in=[c.enrollment.student_id for c in candidates],
                asset_type=FileAsset.AssetType.PROFILE_PHOTO,
                status=FileAsset.Status.ACTIVE,
            ).order_by("created_at")
            for asset in photo_assets:
                try:
                    photo_map[str(asset.owner_id)] = asset_read_url(asset)
                except Exception:
                    pass
        except Exception:
            pass
        return success(
            {
                "exam": exam_data(exam),
                "subjects": [sheet_data(s) for s in sheets],
                "candidates": [
                    {
                        "id": str(c.id),
                        "enrollmentId": str(c.enrollment_id),
                        "name": c.enrollment.student.full_name,
                        "roll": c.enrollment.roll_number,
                        "admission": c.enrollment.student.admission_number,
                        "fatherName": c.enrollment.student.father_name,
                        "motherName": c.enrollment.student.mother_name,
                        "dob": (
                            c.enrollment.student.date_of_birth.isoformat()
                            if c.enrollment.student.date_of_birth
                            else ""
                        ),
                        "gender": c.enrollment.student.gender,
                        "photoUrl": photo_map.get(str(c.enrollment.student_id)),
                        "remark": c.remark,
                        "profile": {} if is_teacher(request) else c.profile,
                        "excludedSubjectIds": c.excluded_subject_ids,
                    }
                    for c in candidates
                ],
                "marks": [
                    {
                        "candidateId": str(m.candidate_id),
                        "componentId": str(m.component_id),
                        "score": str(m.score) if m.score is not None else None,
                        "status": m.status,
                        "note": m.note,
                    }
                    for m in marks
                ],
                "results": []
                if is_teacher(request)
                else enrich_results(
                    [
                        {"candidateId": str(c.id), **summarize(exam, c, mark_map)}
                        for c in candidates
                    ],
                    exam.rules,
                ),
            }
        )

    @transaction.atomic
    def patch(self, request, exam_id):
        require_admin(request)
        exam = exam_for(request, exam_id, lock=True)
        if "archived" in request.data:
            if not isinstance(request.data["archived"], bool):
                raise ValidationError("Archived must be true or false.")
            exam.archived = request.data["archived"]
            exam.save(update_fields=["archived", "updated_at"])
        if request.data.get("syncRoster") is True:
            if exam.subjects.exclude(state="DRAFT").exists():
                raise ValidationError("Reopen subject sheets before adding students to this exam.")
            ResultCandidate.objects.bulk_create(
                [
                    ResultCandidate(exam=exam, enrollment=e)
                    for e in StudentEnrollment.objects.filter(
                        class_section=exam.section, left_at__isnull=True
                    ).exclude(id__in=exam.candidates.values("enrollment_id"))
                ]
            )
        if "rules" in request.data:
            from .calculations import validate_rules

            exam.rules = validate_rules(request.data["rules"])
            exam.save(update_fields=["rules", "updated_at"])
        change(request, exam, "UPDATED", dict(request.data))
        return success(exam_data(exam))


class MarksView(ResultsView):
    def post(self, request, exam_id):
        count = save_marks(
            request, exam_id, request.data.get("entries"), request.data.get("revisions", {})
        )
        return success({"saved": count})


class ReviewView(ResultsView):
    def post(self, request, exam_id, sheet_id):
        return success(sheet_data(review_sheet(request, exam_id, sheet_id, request.data)))


class CandidateView(ResultsView):
    @transaction.atomic
    def patch(self, request, exam_id, candidate_id):
        require_admin(request)
        exam = exam_for(request, exam_id, lock=True)
        candidate = get_object_or_404(ResultCandidate, exam=exam, id=candidate_id)
        if exam.subjects.exclude(state="DRAFT").exists():
            raise ValidationError(
                "Reopen result sheets before changing remarks or subject eligibility."
            )
        excluded = request.data.get("excludedSubjectIds", candidate.excluded_subject_ids)
        allowed = {str(s.subject_id) for s in exam.subjects.all()}
        if not isinstance(excluded, list) or not set(excluded).issubset(allowed):
            raise ValidationError("Excluded subjects must belong to this exam.")
        remark = str(request.data.get("remark", candidate.remark))
        if len(remark) > 2000:
            raise ValidationError("Remarks must be at most 2,000 characters.")
        candidate.excluded_subject_ids = excluded
        candidate.remark = remark
        candidate.save()
        for sheet in exam.subjects.all():
            sheet.revision += 1
            sheet.save(update_fields=["revision", "updated_at"])
        change(
            request,
            exam,
            "ELIGIBILITY",
            {"candidateId": str(candidate.id), "excludedSubjectIds": excluded, "remark": remark},
        )
        return success({"saved": True})


class ImportView(ResultsView):
    def post(self, request, exam_id):
        job = validate_import(request, exam_id, request.data)
        return success(
            {
                "id": str(job.id),
                "validCount": len(job.rows),
                "errors": job.errors,
                "state": job.state,
            }
        )


class ImportCommitView(ResultsView):
    def post(self, request, exam_id, job_id):
        job = commit_import(
            request, exam_id, job_id, valid_only=request.data.get("validOnly") is True
        )
        return success({"importedCount": job.imported_count, "state": job.state})


class HistoryView(ResultsView):
    def get(self, request, exam_id):
        require_admin(request)
        exam = exam_for(request, exam_id)
        return success(
            [
                {
                    "id": str(c.id),
                    "action": c.action,
                    "detail": c.detail,
                    "actor": c.actor.get_full_name() if c.actor else "Former user",
                    "date": c.created_at,
                }
                for c in exam.changes.select_related("actor")[:200]
            ]
        )


class PreviewView(ResultsView):
    def post(self, request):
        from .pdf import render_marksheet

        _, _, _, snapshots, warnings = build_snapshots(request, request.data)
        # Preview one selected student, while validating the complete selected cohort.
        try:
            index = min(max(int(request.data.get("previewIndex", 0)), 0), len(snapshots) - 1)
        except (ValueError, TypeError):
            raise ValidationError("Preview index must be a number.") from None
        return success(
            {
                "pdf": base64.b64encode(render_marksheet(snapshots[index])).decode(),
                "snapshot": snapshots[index],
                "warnings": warnings[:100],
                "total": len(snapshots),
            }
        )


class ReportsView(ResultsView):
    def get(self, request):
        require_admin(request)
        return success(
            [
                {"id": str(r.id), "name": r.name, "config": r.config}
                for r in ResultReport.objects.filter(
                    institute=request.institute, section__in=sections_for(request)
                ).filter(Q(config__kind__isnull=True) | ~Q(config__kind="MARKSHEET_STUDIO_V5"))
            ]
        )

    def post(self, request):
        from .reports import validate_report

        section, _, template, config = validate_report(request, request.data)
        report = ResultReport.objects.create(
            institute=request.institute,
            section=section,
            template=template,
            name=config["title"],
            config=config,
        )
        return success({"id": str(report.id)}, 201)


class BatchListView(ResultsView):
    def get(self, request):
        require_admin(request)
        qs = ResultBatch.objects.filter(
            institute=request.institute, section__in=sections_for(request)
        )
        if request.query_params.get("sectionId"):
            qs = qs.filter(section_id=identifier(request.query_params["sectionId"]))
        return success([batch_data(b) for b in qs[:30]])

    def post(self, request):
        return success(batch_data(create_batch(request, request.data)), 202)


class BatchDetailView(ResultsView):
    def get(self, request, batch_id):
        require_admin(request)
        batch = get_object_or_404(
            ResultBatch, id=batch_id, institute=request.institute, section__in=sections_for(request)
        )
        return success(batch_data(batch))

    @transaction.atomic
    def post(self, request, batch_id):
        require_admin(request)
        batch = get_object_or_404(
            ResultBatch.objects.select_for_update(),
            id=batch_id,
            institute=request.institute,
            section__in=sections_for(request),
        )
        if batch.state == "COMPLETED":
            return success(batch_data(batch))
        if batch.state in ("RUNNING", "QUEUED") and batch.updated_at > timezone.now() - timedelta(
            minutes=10
        ):
            raise ValidationError("The job is already queued or running.")
        batch.state = "QUEUED"
        batch.save()
        from modules.academics.tasks import render_result_batch

        transaction.on_commit(lambda: dispatch_batch(batch.id, render_result_batch))
        return success(batch_data(batch))


class DownloadView(ResultsView):
    def get(self, request, batch_id):
        require_admin(request)
        batch = get_object_or_404(
            ResultBatch, id=batch_id, institute=request.institute, section__in=sections_for(request)
        )
        if batch.state != "COMPLETED":
            raise ValidationError("Wait for generation to complete before downloading.")
        kind = request.query_params.get("fileType", "pdf")
        documents = list(batch.documents.all())
        output = io.BytesIO()
        if kind == "zip":
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
                for d in documents:
                    archive.writestr(
                        f"{d.snapshot['student']['roll']}-{d.id}.pdf".replace("/", "_").replace(
                            "\\", "_"
                        ),
                        bytes(d.pdf),
                    )
            mime, suffix = "application/zip", "zip"
        elif kind == "csv":
            text = io.StringIO()
            writer = csv.writer(text)
            writer.writerow(
                [
                    "Student",
                    "Roll",
                    "Exam",
                    "Subject",
                    "Marks",
                    "Maximum",
                    "Grade",
                    "Result",
                    "Overall total",
                    "Overall maximum",
                    "Percentage",
                    "GPA",
                    "Division",
                    "Rank",
                    "Grace",
                    "Included in total",
                    "Credits",
                    "Grade points",
                ]
            )

            def safe(value):
                value = str(value)
                return "'" + value if value.startswith(("=", "+", "-", "@", "\t", "\r")) else value

            for d in documents:
                for result in d.snapshot["results"]:
                    for row in result["rows"]:
                        writer.writerow(
                            [
                                safe(x)
                                for x in [
                                    d.snapshot["student"]["name"],
                                    d.snapshot["student"]["roll"],
                                    result["exam"],
                                    row["subject"],
                                    row["score"] or "",
                                    row["maximum"],
                                    row["grade"],
                                    row["result"],
                                    result["total"],
                                    result["maximum"],
                                    result["percentage"] or "",
                                    result.get("gpa") or "",
                                    result.get("division", ""),
                                    (result.get("rank") or {}).get("display", ""),
                                    row.get("grace", "0"),
                                    row.get("included", True),
                                    row.get("credits", ""),
                                    row.get("gradePoint") or "",
                                ]
                            ]
                        )
            output.write(text.getvalue().encode("utf-8-sig"))
            mime, suffix = "text/csv", "csv"
        elif kind == "pdf":
            from pypdf import PdfWriter

            writer = PdfWriter()
            selected = request.query_params.get("documentId")
            for d in documents:
                if not selected or str(d.id) == selected:
                    writer.append(io.BytesIO(bytes(d.pdf)))
            if not writer.pages:
                raise ValidationError("Choose a document in this batch.")
            writer.write(output)
            mime, suffix = "application/pdf", "pdf"
        else:
            raise ValidationError("Choose PDF, ZIP, or CSV.")
        return success(
            {
                "content": base64.b64encode(output.getvalue()).decode(),
                "mime": mime,
                "filename": f"marksheets-{batch.id}.{suffix}",
            }
        )


class LegacyView(ResultsView):
    def get(self, request):
        require_admin(request)
        qs = AcademicOperation.objects.filter(
            institute=request.institute, kind__in=["EXAM", "MARK"]
        )
        if request.institute_membership.branch_id:
            qs = qs.filter(branch_id=request.institute_membership.branch_id)
        return success(
            [
                {
                    "id": str(o.id),
                    "kind": o.kind,
                    "title": o.title,
                    "payload": o.payload,
                    "status": o.status,
                }
                for o in qs[:500]
            ]
        )


class LegacyMigrateView(ResultsView):
    @transaction.atomic
    def post(self, request, operation_id):
        require_admin(request)
        record = get_object_or_404(
            AcademicOperation.objects.select_for_update(),
            id=operation_id,
            institute=request.institute,
        )
        if (
            request.institute_membership.branch_id
            and record.branch_id != request.institute_membership.branch_id
        ):
            raise ValidationError("This record is outside your branch.")
        exam = exam_for(request, request.data.get("examId"), lock=True)
        if record.branch_id and record.branch_id != exam.section.branch_id:
            raise ValidationError("Choose an exam in the legacy record's branch.")
        if record.kind == "EXAM":
            if ResultExam.objects.filter(legacy_operation=record).exclude(pk=exam.pk).exists():
                raise ValidationError("This previous exam is already linked.")
            if exam.legacy_operation_id not in (None, record.id):
                raise ValidationError("This exam is linked to another previous record.")
            exam.legacy_operation = record
            exam.save(update_fields=["legacy_operation", "updated_at"])
        elif record.kind == "MARK":
            from modules.academics.models import ResultChange

            if ResultChange.objects.filter(
                action="LEGACY_MIGRATED", detail__legacyId=str(record.id)
            ).exists():
                return success({"migrated": True, "alreadyMigrated": True})
            component = get_object_or_404(
                ResultComponent,
                ResultDocument,
                id=identifier(request.data.get("componentId")),
                exam_subject__exam=exam,
            )
            if record.payload.get("maxMarks") is not None and component.maximum != number(
                record.payload["maxMarks"], "Previous maximum"
            ):
                raise ValidationError("The previous maximum marks differ from this exam component.")
            candidate_id = identifier(request.data.get("candidateId"))
            if ResultMark.objects.filter(candidate_id=candidate_id, component=component).exists():
                raise ValidationError("Marks already exist here. Reconcile them before migrating.")
            revisions = {str(sheet.id): sheet.revision for sheet in exam.subjects.all()}
            save_marks(
                request,
                exam.id,
                [
                    {
                        "candidateId": str(candidate_id),
                        "componentId": str(component.id),
                        "score": record.payload.get("score"),
                        "status": "PRESENT",
                        "note": "Migrated from previous marks record",
                    }
                ],
                revisions,
            )
        else:
            raise ValidationError("Only previous exams and marks can be migrated.")
        change(
            request, exam, "LEGACY_MIGRATED", {"legacyId": str(record.id), "title": record.title}
        )
        return success({"migrated": True})


class ExamSettingsView(ResultsView):
    def patch(self, request, exam_id):
        from .services import update_exam_setup

        exam = update_exam_setup(request, exam_id, request.data)
        return success(
            exam_data(
                ResultExam.objects.prefetch_related(
                    "subjects__subject", "subjects__components", "candidates"
                ).get(pk=exam.pk)
            )
        )


class FormulaPreviewView(ResultsView):
    def post(self, request, exam_id):
        from .calculations import validate_rules

        require_admin(request)
        exam = exam_for(request, exam_id)
        exam.rules = validate_rules(request.data.get("rules"))
        candidate = (
            exam.candidates.select_related("enrollment__student")
            .order_by("enrollment__roll_number")
            .first()
        )
        if not candidate:
            raise ValidationError("Add enrolled students before testing a formula.")
        marks = {
            (str(m.candidate_id), str(m.component_id)): m
            for m in ResultMark.objects.filter(candidate=candidate)
        }
        return success(
            {"name": candidate.enrollment.student.full_name, **summarize(exam, candidate, marks)}
        )


class VerifyDocumentView(ResultsView):
    def get(self, request, document_id):
        import hashlib

        require_admin(request)
        document = get_object_or_404(
            ResultDocument,
            id=document_id,
            batch__institute=request.institute,
            batch__section__in=sections_for(request),
        )
        return success(
            {
                "id": str(document.id),
                "student": document.snapshot["student"],
                "title": document.snapshot["config"]["title"],
                "exams": [r["exam"] for r in document.snapshot["results"]],
                "issued": document.batch.issue,
                "createdAt": document.created_at.isoformat(),
                "ready": document.pdf is not None,
                "sha256": hashlib.sha256(bytes(document.pdf)).hexdigest() if document.pdf else None,
                "batchId": str(document.batch_id),
                "superseded": ResultDocument.objects.filter(predecessor=document).exists(),
            }
        )
