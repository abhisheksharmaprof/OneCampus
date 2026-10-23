"""Saved working copies for the user's original v5 studio, scoped like other results."""

import json
from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError

from modules.academics.models import ResultMark, ResultReport
from modules.documents.models import DocumentTemplate

from .permissions import require_admin, sections_for
from .reports import branding_snapshot, seed_templates
from .services import change, exam_for, identifier
from .views import ResultsView, success

KIND = "MARKSHEET_STUDIO_V5"
STATE_KEYS = {
    "headers",
    "rows",
    "identityMap",
    "subjectConfigs",
    "subjectOrder",
    "totalRule",
    "formulas",
    "gradeScale",
    "template",
    "selectedStudentIdx",
    "activeTab",
    "previewSubview",
    "batchViewMode",
    "searchQuery",
    "statusFilter",
    "lastSortKey",
}


def workspaces(request):
    require_admin(request)
    return ResultReport.objects.filter(
        institute=request.institute, section__in=sections_for(request), config__kind=KIND
    )


def describe(report, *, full=False):
    result = {
        "id": str(report.id),
        "name": report.name,
        "sectionId": str(report.section_id),
        "updatedAt": report.updated_at.isoformat(),
        "examId": report.config.get("examId"),
        "students": len(report.config.get("state", {}).get("rows", [])),
    }
    if full:
        result["state"] = report.config["state"]
    return result


def validate_state(state):
    if not isinstance(state, dict) or set(state) - STATE_KEYS:
        raise ValidationError("Invalid studio workspace fields.")
    try:
        serialized = json.dumps(state, allow_nan=False)
    except (TypeError, ValueError, OverflowError, RecursionError):
        raise ValidationError("Workspace must contain valid JSON values.") from None
    if len(serialized.encode()) > 2000000:
        raise ValidationError("Workspace exceeds 2 MB. Reduce uploaded image sizes before saving.")

    def check(value, depth=0):
        if depth > 15:
            raise ValidationError("Workspace is nested too deeply.")
        if isinstance(value, dict):
            if set(value) & {"__proto__", "constructor", "prototype"}:
                raise ValidationError("Unsupported workspace property.")
            for child in value.values():
                check(child, depth + 1)
        elif isinstance(value, list):
            for child in value:
                check(child, depth + 1)

    check(state)
    headers, rows = state.get("headers"), state.get("rows")
    if (
        not isinstance(headers, list)
        or not 1 <= len(headers) <= 700
        or any(not isinstance(h, str) or not h.strip() or len(h) > 200 for h in headers)
        or len(set(headers)) != len(headers)
    ):
        raise ValidationError("Use 1–700 unique, non-empty spreadsheet headers.")
    if not isinstance(rows, list) or len(rows) > 10000 or len(rows) * len(headers) > 200000:
        raise ValidationError("Save at most 10,000 rows and 200,000 cells per workspace.")
    if any(
        not isinstance(row, list)
        or len(row) != len(headers)
        or any(type(cell) not in (str, int, float, bool, type(None)) for cell in row)
        for row in rows
    ):
        raise ValidationError("Every row must match the header length and contain scalar cells.")
    for key in ("identityMap", "subjectConfigs", "totalRule", "formulas", "template"):
        if not isinstance(state.get(key), dict):
            raise ValidationError(f"Workspace {key} must be an object.")
    if not isinstance(state.get("gradeScale"), list) or not 1 <= len(state["gradeScale"]) <= 30:
        raise ValidationError("Define 1–30 grade rules.")
    if any(not isinstance(rule, dict) for rule in state["gradeScale"]):
        raise ValidationError("Every grade rule must be an object.")
    if any(not isinstance(config, dict) for config in state["subjectConfigs"].values()):
        raise ValidationError("Every subject configuration must be an object.")
    for key in ("cols", "sections", "sigImages", "studentPhotos", "visibleSubjects"):
        if key in state["template"] and not isinstance(state["template"][key], dict):
            raise ValidationError(f"Template {key} must be an object.")
    for key in ("subjectOrder",):
        if key in state and (
            not isinstance(state[key], list)
            or any(not isinstance(value, str) for value in state[key])
        ):
            raise ValidationError(f"Workspace {key} must contain text values.")
    return state


class StudioBrandingView(ResultsView):
    def get(self, request):
        require_admin(request)
        brand = branding_snapshot(request.institute)
        return success(
            {
                "instName": brand["name"],
                "instSub": "",
                "instAddr": brand["address"],
                "primaryColor": brand["color"],
                "lightColor": brand["color"] + "12",
                "borderColor": brand["color"] + "40",
                "customLogoDataUrl": "data:image/png;base64," + brand["logo"]
                if brand["logo"]
                else None,
                "warning": brand["warning"],
            }
        )


class StudioWorkspaceListView(ResultsView):
    def get(self, request):
        reports = workspaces(request)
        if request.query_params.get("sectionId"):
            reports = reports.filter(section_id=identifier(request.query_params["sectionId"]))
        return success(
            [
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "sectionId": str(row["section_id"]),
                    "updatedAt": row["updated_at"].isoformat(),
                    "examId": row["config__examId"],
                    "students": row["config__studentCount"] or 0,
                }
                for row in reports.order_by("-updated_at").values(
                    "id",
                    "name",
                    "section_id",
                    "updated_at",
                    "config__examId",
                    "config__studentCount",
                )[:100]
            ]
        )

    @transaction.atomic
    def post(self, request):
        require_admin(request)
        section = get_object_or_404(
            sections_for(request), id=identifier(request.data.get("sectionId"))
        )
        state = validate_state(request.data.get("state"))
        name = request.data.get("name", "")
        if not isinstance(name, str) or not name.strip() or len(name) > 120:
            raise ValidationError("Enter a workspace name of 1–120 characters.")
        exam = None
        if request.data.get("examId"):
            exam = exam_for(request, request.data["examId"])
            if exam.section_id != section.id:
                raise ValidationError("The source exam must belong to this section.")
        config = {
            "kind": KIND,
            "sectionId": str(section.id),
            "examId": str(exam.id) if exam else None,
            "state": state,
            "studentCount": len(state["rows"]),
        }
        if request.data.get("id"):
            report = get_object_or_404(
                workspaces(request).select_for_update(),
                id=identifier(request.data["id"]),
                section=section,
            )
            if request.data.get("updatedAt") != report.updated_at.isoformat():
                raise ValidationError(
                    "This workspace changed in another session. Reload it before saving."
                )
            report.config, report.name = config, name.strip()
            report.save(update_fields=["config", "name", "updated_at"])
        else:
            seed_templates(request.institute)
            template = DocumentTemplate.objects.get(
                institute=request.institute, category="MARKSHEET", name="Term report"
            )
            report = ResultReport.objects.create(
                institute=request.institute,
                section=section,
                template=template,
                name=name.strip(),
                config=config,
            )
        if exam:
            change(
                request, exam, "STUDIO_SAVED", {"workspaceId": str(report.id), "name": report.name}
            )
        return success(describe(report, full=True), 200 if request.data.get("id") else 201)


class StudioWorkspaceDetailView(ResultsView):
    def get(self, request, workspace_id):
        return success(describe(get_object_or_404(workspaces(request), id=workspace_id), full=True))


class StudioExamSourceView(ResultsView):
    def get(self, request, exam_id):
        require_admin(request)
        exam = exam_for(request, exam_id)
        sheets = list(exam.subjects.select_related("subject").prefetch_related("components"))
        candidates = list(
            exam.candidates.select_related("enrollment__student").order_by(
                "enrollment__roll_number"
            )
        )
        marks = {
            (str(m.candidate_id), str(m.component_id)): m
            for m in ResultMark.objects.filter(candidate__exam=exam)
        }
        headers = [
            "Roll No",
            "Student Name",
            "Class",
            "DOB",
            "Father Name",
            "Mother Name",
            "Attendance",
            "Remarks",
            "Student Photo URL",
            "Parent Phone",
            "Parent Email",
            "Imported Total",
        ]
        definitions, specs, subject_order, warnings = {}, [], [], []

        def header(label):
            name = label
            while name in headers:
                name += " · subject"
            headers.append(name)
            return name

        for sheet in sheets:
            components = list(sheet.components.all())
            split = len(components) == 2
            key = header(sheet.subject.name + (" Theory" if split else ""))
            practical = header(sheet.subject.name + " Practical") if split else ""
            opts = exam.rules.get("subjects", {}).get(str(sheet.subject_id), {})
            maximum = sum((c.maximum for c in components), Decimal(0))
            definitions[key] = {
                "isSubject": True,
                "displayName": opts.get("name") or sheet.subject.name,
                "code": opts.get("code") or sheet.subject.subject_code,
                "maxMarks": float(maximum),
                "passMarks": float(sum((c.pass_marks for c in components), Decimal(0))),
                "thMax": float(components[0].maximum if split else maximum),
                "prMax": float(components[1].maximum) if split else 0,
                "prCol": practical,
                "credits": opts.get("credits", 1),
                "inTotal": opts.get("include", True),
            }
            subject_order.append(key)
            specs.append((sheet, components, split))
            if len(components) > 2:
                warnings.append(
                    f"{sheet.subject.name}: {len(components)} components "
                    "are loaded as one combined subject mark."
                )
        rows = []
        for candidate in candidates:
            student = candidate.enrollment.student
            profile = candidate.profile
            row = [
                candidate.enrollment.roll_number,
                student.full_name,
                f"{exam.section.grade.name} {exam.section.section_name}",
                profile.get("dob")
                or (student.date_of_birth.isoformat() if student.date_of_birth else ""),
                profile.get("fatherName") or student.father_name,
                profile.get("motherName") or student.mother_name,
                profile.get("attendance", ""),
                candidate.remark,
                "",
                "",
                student.email_address,
                profile.get("importedTotal", ""),
            ]
            for sheet, components, split in specs:

                def value(component, candidate=candidate, sheet=sheet):
                    if str(sheet.subject_id) in candidate.excluded_subject_ids:
                        return "EX"
                    mark = marks.get((str(candidate.id), str(component.id)))
                    if not mark or mark.score is None and mark.status == "PRESENT":
                        return ""
                    if mark.status != "PRESENT":
                        return "AB" if mark.status == "ABSENT" else "EX"
                    return float(mark.score)

                values = [value(c) for c in components]
                if split:
                    row.extend(values)
                else:
                    row.append(
                        "AB"
                        if "AB" in values
                        else ""
                        if "" in values
                        else "EX"
                        if all(v == "EX" for v in values)
                        else sum(v for v in values if isinstance(v, (int, float)))
                    )
            rows.append(row)
        for h in headers:
            definitions.setdefault(
                h,
                {
                    "isSubject": False,
                    "displayName": h,
                    "code": "",
                    "maxMarks": 100,
                    "passMarks": 0,
                    "thMax": 100,
                    "prMax": 0,
                    "prCol": "",
                    "credits": 0,
                    "inTotal": False,
                },
            )
        rules = exam.rules
        gpa = {
            "average": "avg_gp",
            "credit": "credit_sgpa",
            "us4": "us_4",
            "percentage": "pct_div_10",
        }
        state = {
            "headers": headers,
            "rows": rows,
            "subjectConfigs": definitions,
            "subjectOrder": subject_order + [h for h in headers if h not in subject_order],
            "identityMap": {
                "studentName": "Student Name",
                "rollNo": "Roll No",
                "classSec": "Class",
                "dob": "DOB",
                "fatherName": "Father Name",
                "motherName": "Mother Name",
                "attendance": "Attendance",
                "remarks": "Remarks",
                "photo": "Student Photo URL",
                "phone": "Parent Phone",
                "email": "Parent Email",
                "totalCol": "Imported Total",
            },
            "totalRule": {
                "mode": {"fixed": "fixed_custom", "imported": "mapped_col"}.get(
                    rules.get("aggregateMode"), rules.get("aggregateMode", "all")
                ),
                "bestN": rules.get("bestN", 5),
                "fixedCount": rules.get("fixedCount", len(sheets)),
                "fixedMaxMarks": rules.get("fixedMaximum", 100 * len(sheets)),
            },
            "formulas": {
                "pctMode": rules.get("percentageMode", "standard"),
                "gpaMode": gpa.get(rules.get("gpaMode"), "avg_gp"),
                "decimals": rules.get("decimals", 2),
                "customExpr": rules.get("formula", "SUM / MAX_SUM * 100"),
                "graceMax": rules.get("grace", 0),
                "passOverallPct": rules.get("overallPass", 0),
                "requireEverySubPass": rules.get("requireEverySubject", True),
                "compartmentMaxSubs": rules.get("compartment", 0),
                "rankMethod": rules.get("rankMethod", "competition"),
                "rankBasis": "cgpa"
                if rules.get("rankBasis") == "gpa"
                else rules.get("rankBasis", "percentage"),
                "rankEligibility": "pass_only"
                if rules.get("rankEligibility") == "passed"
                else "all",
                "rankFormat": "of_total"
                if rules.get("rankFormat", "of_total") == "of_total"
                else rules.get("rankFormat"),
            },
            "gradeScale": [
                {
                    "min": g["minimum"],
                    "max": 100,
                    "grade": g["label"],
                    "gp": g.get("points", float(g["minimum"]) / 10),
                    "remark": g.get("remark", ""),
                }
                for g in rules["grades"]
            ],
            "template": {
                "examTitle": exam.name,
                "session": exam.section.academic_year.name,
                "cols": {"split": any(len(c) == 2 for _, c, _ in specs)},
                "sections": {"coscholastic": False},
            },
            "selectedStudentIdx": 0,
            "activeTab": "import",
        }
        if any(
            v == ""
            for row in rows
            for v in row[len(headers) - sum(2 if s else 1 for _, _, s in specs) :]
        ):
            warnings.append(
                "Some source marks are missing. This studio uses the reference's calculations; "
                "complete and review marks before sharing exports."
            )
        return success(
            {"state": state, "examId": str(exam.id), "name": exam.name, "warnings": warnings}
        )
