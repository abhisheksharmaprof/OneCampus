import base64
import io
import uuid
from datetime import date

import pytest
from pypdf import PdfReader

from modules.academics.models import (
    AcademicYear,
    ClassSection,
    ClassSubject,
    Grade,
    ResultBatch,
    ResultDocument,
    ResultMark,
    StudentEnrollment,
    Subject,
    SubjectTeacherAssignment,
)
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import StaffProfile, Student

pytestmark = [pytest.mark.django_db, pytest.mark.urls("modules.academics.results.urls")]


@pytest.fixture
def school(api_client):
    institute = Institute.objects.create(name="Result School", code="RESULTS")
    branch = Branch.objects.create(institute=institute, name="Main", code="MAIN")
    year = AcademicYear.objects.create(
        institute=institute,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_current=True,
    )
    grade = Grade.objects.create(institute=institute, name="Class 8")
    section = ClassSection.objects.create(
        branch=branch, grade=grade, academic_year=year, section_name="A"
    )
    subject = Subject.objects.create(
        institute=institute, branch=branch, name="Mathematics", subject_code="MATH"
    )
    ClassSubject.objects.create(
        institute=institute, grade=grade, class_section=section, subject=subject
    )
    for i in range(2):
        student = Student.objects.create(
            institute=institute,
            branch=branch,
            first_name="Same" if i else "Ada",
            last_name="Student",
            admission_number=f"A{i}",
        )
        StudentEnrollment.objects.create(
            student=student, class_section=section, academic_year=year, roll_number=str(i + 1)
        )
    user = User.objects.create_user(email="results@test.local", password="TestPass123!")
    membership = InstituteMembership.objects.create(
        user=user, institute=institute, role="INSTITUTE_ADMIN"
    )
    api_client.force_authenticate(
        user=user, token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    return {
        "institute": institute,
        "branch": branch,
        "section": section,
        "subject": subject,
        "user": user,
    }


def create(client, school, name="Half-yearly", maximum=100):
    response = client.post(
        "/exams",
        {
            "name": name,
            "sectionId": str(school["section"].id),
            "examType": "HALF_YEARLY",
            "subjects": [
                {"subjectId": str(school["subject"].id), "maximum": maximum, "passMarks": 0}
            ],
        },
        format="json",
    )
    assert response.status_code == 201, response.data
    return client.get(f"/exams/{response.data['data']['id']}").data["data"]


def save(client, detail, scores):
    entries = [
        {
            "candidateId": c["id"],
            "componentId": detail["subjects"][0]["components"][0]["id"],
            "score": s,
            "status": "PRESENT",
        }
        for c, s in zip(detail["candidates"], scores, strict=True)
    ]
    return client.post(
        f"/exams/{detail['exam']['id']}/marks",
        {"entries": entries, "revisions": {s["id"]: s["revision"] for s in detail["subjects"]}},
        format="json",
    )


def config(client, detail):
    templates = client.get("/bootstrap").data["data"]["templates"]
    return {
        "sectionId": detail["exam"]["sectionId"],
        "examIds": [detail["exam"]["id"]],
        "enrollmentIds": [c["enrollmentId"] for c in detail["candidates"]],
        "templateId": templates[0]["id"],
        "mode": "single",
        "title": "Half-yearly report",
    }


def test_manual_validation_conflicts_and_review_lock(api_client, school):
    detail = create(api_client, school)
    assert save(api_client, detail, ["101", "0"]).status_code == 400
    assert not ResultMark.objects.exists()
    assert save(api_client, detail, ["80", "0"]).status_code == 200
    assert save(api_client, detail, ["70", "0"]).status_code == 400
    detail = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]
    assert detail["results"][0]["percentage"] == "80.00"
    sheet = detail["subjects"][0]
    path = f"/exams/{detail['exam']['id']}/sheets/{sheet['id']}/review"
    assert (
        api_client.post(
            path, {"action": "submit", "revision": sheet["revision"]}, format="json"
        ).status_code
        == 200
    )
    assert (
        api_client.post(
            path, {"action": "approve", "revision": sheet["revision"] + 1}, format="json"
        ).status_code
        == 200
    )
    assert save(api_client, detail, ["70", "0"]).status_code == 400
    assert (
        api_client.post(
            path, {"action": "reopen", "revision": sheet["revision"] + 2}, format="json"
        ).status_code
        == 400
    )
    assert (
        api_client.post(
            path,
            {
                "action": "reopen",
                "revision": sheet["revision"] + 2,
                "reason": "Correction requested",
            },
            format="json",
        ).status_code
        == 200
    )


def test_import_validation_duplicates_and_idempotency(api_client, school):
    detail = create(api_client, school)
    component = detail["subjects"][0]["components"][0]["id"]
    path = f"/exams/{detail['exam']['id']}/imports"
    rows = [
        {
            "identifier": "1",
            "name": "Ada Student",
            "componentId": component,
            "score": "80",
            "maximum": "100",
        },
        {"identifier": "2", "componentId": component, "score": "200"},
    ]
    data = {"key": str(uuid.uuid4()), "rows": rows, "matchBy": "roll", "filename": "marks.xlsx"}
    response = api_client.post(path, data, format="json")
    assert response.status_code == 200, response.data
    job = response.data["data"]
    assert job["validCount"] == 1 and len(job["errors"]) == 1
    assert api_client.post(path, data, format="json").data["data"]["id"] == job["id"]
    commit = f"{path}/{job['id']}/commit"
    assert api_client.post(commit, {}, format="json").status_code == 400
    assert api_client.post(commit, {"validOnly": True}, format="json").status_code == 200
    assert (
        api_client.post(commit, {"validOnly": True}, format="json").data["data"]["importedCount"]
        == 1
    )
    assert ResultMark.objects.count() == 1
    row = rows[0]
    response = api_client.post(path, {"key": str(uuid.uuid4()), "rows": [row, row]}, format="json")
    assert response.data["data"]["validCount"] == 0 and len(response.data["data"]["errors"]) == 2


def test_preview_bulk_pdf_and_immutable_snapshot(
    api_client, school, django_capture_on_commit_callbacks
):
    detail = create(api_client, school)
    assert save(api_client, detail, ["80", "60"]).status_code == 200
    payload = config(api_client, detail)
    preview = api_client.post("/preview", payload, format="json")
    assert preview.status_code == 200, preview.data
    assert (
        "Ada Student"
        in PdfReader(io.BytesIO(base64.b64decode(preview.data["data"]["pdf"])))
        .pages[0]
        .extract_text()
    )
    assert (
        api_client.post(
            "/batches", {**payload, "issue": True, "key": str(uuid.uuid4())}, format="json"
        ).status_code
        == 400
    )
    with django_capture_on_commit_callbacks(execute=True):
        response = api_client.post("/batches", {**payload, "key": str(uuid.uuid4())}, format="json")
    assert response.status_code == 202, response.data
    batch = ResultBatch.objects.get(pk=response.data["data"]["id"])
    assert batch.state == "COMPLETED", batch.errors
    download = api_client.get(f"/batches/{batch.id}/download?fileType=pdf")
    assert len(PdfReader(io.BytesIO(base64.b64decode(download.data["data"]["content"]))).pages) == 2
    assert api_client.get(f"/batches/{batch.id}/download?fileType=zip").status_code == 200
    school["institute"].name = "Changed School"
    school["institute"].save()
    assert ResultDocument.objects.first().snapshot["school"]["name"] == "Result School"


def test_weighted_results_normalize_exam_maxima(api_client, school):
    first = create(api_client, school, "Unit test", 20)
    second = create(api_client, school, "Annual", 100)
    assert save(api_client, first, ["10", "20"]).status_code == 200
    assert save(api_client, second, ["80", "60"]).status_code == 200
    payload = config(api_client, first)
    payload.update(
        mode="weighted",
        examIds=[first["exam"]["id"], second["exam"]["id"]],
        weights={first["exam"]["id"]: "25", second["exam"]["id"]: "75"},
    )
    response = api_client.post("/preview", payload, format="json")
    assert response.status_code == 200, response.data
    assert response.data["data"]["snapshot"]["summary"]["percentage"] == "72.50"


def test_tenant_and_teacher_scope(api_client, school):
    detail = create(api_client, school)
    outsider = Institute.objects.create(name="Other", code="OTHER-RESULT")
    membership = InstituteMembership.objects.create(
        user=school["user"], institute=outsider, role="INSTITUTE_ADMIN"
    )
    api_client.force_authenticate(
        user=school["user"], token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    assert api_client.get(f"/exams/{detail['exam']['id']}").status_code == 404
    teacher = User.objects.create_user(email="teacher@result.test", password="Password123!")
    membership = InstituteMembership.objects.create(
        user=teacher, institute=school["institute"], branch=school["branch"], role="TEACHER"
    )
    api_client.force_authenticate(
        user=teacher, token={"client": "staff-mobile", "membership_id": str(membership.id)}
    )
    assert api_client.get(f"/exams/{detail['exam']['id']}").status_code == 404
    StaffProfile.objects.create(
        user=teacher, institute=school["institute"], employee_code="RESULT-T"
    )
    SubjectTeacherAssignment.objects.create(
        class_section=school["section"], subject=school["subject"], teacher=teacher
    )
    assert api_client.get(f"/exams/{detail['exam']['id']}").status_code == 200
    assert api_client.post("/exams", {}, format="json").status_code == 403


def test_rank_uses_full_roster_when_only_one_student_is_exported(api_client, school):
    detail = create(api_client, school)
    assert save(api_client, detail, ["60", "90"]).status_code == 200
    payload = config(api_client, detail)
    payload.update(showRank=True, enrollmentIds=[detail["candidates"][0]["enrollmentId"]])
    response = api_client.post("/preview", payload, format="json")
    assert response.status_code == 200, response.data
    rank = response.data["data"]["snapshot"]["results"][0]["rank"]
    assert rank["position"] == 2 and rank["cohort"] == 2


def test_clearing_a_draft_score_restores_missing_state(api_client, school):
    detail = create(api_client, school)
    assert save(api_client, detail, ["60", "90"]).status_code == 200
    detail = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]
    assert save(api_client, detail, [None, "90"]).status_code == 200
    assert ResultMark.objects.count() == 1
    detail = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]
    assert detail["results"][0]["missing"] == 1


def test_subject_exclusion_does_not_block_review_when_old_marks_exist(api_client, school):
    detail = create(api_client, school)
    assert save(api_client, detail, ["60", "90"]).status_code == 200
    response = api_client.patch(
        f"/exams/{detail['exam']['id']}/candidates/{detail['candidates'][0]['id']}",
        {"excludedSubjectIds": [str(school["subject"].id)]},
        format="json",
    )
    assert response.status_code == 200, response.data
    detail = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]
    sheet = detail["subjects"][0]
    response = api_client.post(
        f"/exams/{detail['exam']['id']}/sheets/{sheet['id']}/review",
        {"action": "submit", "revision": sheet["revision"]},
        format="json",
    )
    assert response.status_code == 200, response.data


def test_issued_correction_keeps_previous_pdf_and_links_successor(
    api_client, school, django_capture_on_commit_callbacks
):
    detail = create(api_client, school)
    assert save(api_client, detail, ["80", "60"]).status_code == 200
    detail = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]
    sheet = detail["subjects"][0]
    path = f"/exams/{detail['exam']['id']}/sheets/{sheet['id']}/review"
    assert (
        api_client.post(
            path, {"action": "submit", "revision": sheet["revision"]}, format="json"
        ).status_code
        == 200
    )
    assert (
        api_client.post(
            path, {"action": "approve", "revision": sheet["revision"] + 1}, format="json"
        ).status_code
        == 200
    )
    payload = config(api_client, detail)
    with django_capture_on_commit_callbacks(execute=True):
        first = api_client.post(
            "/batches", {**payload, "issue": True, "key": str(uuid.uuid4())}, format="json"
        )
    assert first.status_code == 202, first.data
    original = ResultDocument.objects.filter(batch_id=first.data["data"]["id"]).first()
    original_pdf = bytes(original.pdf)
    original_total = original.snapshot["results"][0]["total"]
    assert (
        api_client.post(
            path,
            {
                "action": "reopen",
                "revision": sheet["revision"] + 2,
                "reason": "Corrected transcription",
            },
            format="json",
        ).status_code
        == 200
    )
    detail = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]
    assert save(api_client, detail, ["90", "70"]).status_code == 200
    detail = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]
    sheet = detail["subjects"][0]
    assert (
        api_client.post(
            path, {"action": "submit", "revision": sheet["revision"]}, format="json"
        ).status_code
        == 200
    )
    assert (
        api_client.post(
            path, {"action": "approve", "revision": sheet["revision"] + 1}, format="json"
        ).status_code
        == 200
    )
    with django_capture_on_commit_callbacks(execute=True):
        second = api_client.post(
            "/batches", {**payload, "issue": True, "key": str(uuid.uuid4())}, format="json"
        )
    assert second.status_code == 202, second.data
    successor = ResultDocument.objects.get(
        batch_id=second.data["data"]["id"], enrollment=original.enrollment
    )
    original.refresh_from_db()
    assert successor.predecessor_id == original.id
    assert (
        bytes(original.pdf) == original_pdf
        and original.snapshot["results"][0]["total"] == original_total
    )


@pytest.mark.parametrize(
    "body", [{"examIds": [{}]}, {"rows": None}, {"rules": []}, {"previewIndex": "not-a-number"}]
)
def test_bad_payloads_return_validation_errors(api_client, school, body):
    detail = create(api_client, school)
    payload = config(api_client, detail)
    response = api_client.post("/preview", {**payload, **body}, format="json")
    assert response.status_code == 400, response.data


def test_exam_setup_can_change_safely_without_losing_marks(api_client, school):
    detail = create(api_client, school)
    assert save(api_client, detail, ["80", "60"]).status_code == 200
    exam = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]["exam"]
    component = exam["subjects"][0]["components"][0]
    payload = {
        "name": exam["name"],
        "examType": exam["examType"],
        "updatedAt": exam["updatedAt"],
        "rules": exam["rules"],
        "subjects": [
            {"subjectId": str(school["subject"].id), "components": [{**component, "maximum": "70"}]}
        ],
    }
    path = f"/exams/{exam['id']}/settings"
    assert api_client.patch(path, payload, format="json").status_code == 400
    payload["subjects"][0]["components"][0]["maximum"] = "200"
    response = api_client.patch(path, payload, format="json")
    assert response.status_code == 200, response.data
    assert ResultMark.objects.count() == 2
    assert response.data["data"]["subjects"][0]["components"][0]["maximum"] == "200.00"
    assert api_client.patch(path, payload, format="json").status_code == 400


@pytest.mark.parametrize(
    "template_name", ["Term report", "Compact result slip", "Detailed with rank"]
)
def test_all_presets_paginate_long_subject_lists(api_client, school, template_name):
    from modules.academics.results.pdf import render_marksheet

    detail = create(api_client, school)
    assert save(api_client, detail, ["80", "60"]).status_code == 200
    payload = config(api_client, detail)
    templates = api_client.get("/bootstrap").data["data"]["templates"]
    payload["templateId"] = next(t["id"] for t in templates if t["name"] == template_name)
    response = api_client.post("/preview", payload, format="json")
    assert response.status_code == 200, response.data
    snapshot = response.data["data"]["snapshot"]
    row = snapshot["results"][0]["rows"][0]
    snapshot["results"][0]["rows"] = [
        {**row, "subject": f"Extended Subject {i:02d} with a long descriptive name"}
        for i in range(40)
    ]
    pdf = render_marksheet(snapshot)
    pages = PdfReader(io.BytesIO(pdf)).pages
    assert len(pages) > 1
    assert "Extended Subject 39" in "\n".join(page.extract_text() for page in pages)


def test_formula_parser_rejects_code_and_invalid_math():
    from rest_framework.exceptions import ValidationError

    from modules.academics.results.engine import expression

    assert expression("ROUND(SUM / MAX_SUM * 100, 1)", {"SUM": 81, "MAX_SUM": 90}) == 90
    for value in [
        "__import__('os').system('id')",
        "SUM.__class__",
        "[SUM][0]",
        "2 ** 999",
        "1 / 0",
        "ROUND(1, 100)",
        "9" * 241,
    ]:
        with pytest.raises(ValidationError):
            expression(value)


def test_ranking_policies_are_deterministic():
    from modules.academics.results.engine import rank_results

    def row(id_, score):
        return {
            "candidateId": id_,
            "percentage": str(score),
            "total": str(score),
            "gpa": "8",
            "maximum": "100",
            "missing": 0,
            "result": "Pass",
            "rows": [{"score": str(score)}],
        }

    results = [row("a", 90), row("b", 80), row("c", 80), row("d", 70)]
    for method, expected in [
        ("competition", [1, 2, 2, 4]),
        ("dense", [1, 2, 2, 3]),
        ("unique", [1, 2, 3, 4]),
    ]:
        ranks = rank_results(results, {"rankMethod": method})
        assert [ranks[r["candidateId"]]["position"] for r in results] == expected
    results[0]["result"] = "Compartment"
    assert "a" not in rank_results(results, {"rankEligibility": "passed"})


def test_engine_preview_and_profile_import(api_client, school):
    detail = create(api_client, school)
    assert save(api_client, detail, ["79", "66"]).status_code == 200
    detail = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]
    rules = {
        **detail["exam"]["rules"],
        "percentageMode": "custom",
        "formula": "SUM / MAX_SUM * 100",
        "gpaMode": "credit",
        "subjects": {str(school["subject"].id): {"credits": 4}},
    }
    preview = api_client.post(
        f"/exams/{detail['exam']['id']}/formula-preview", {"rules": rules}, format="json"
    )
    assert preview.status_code == 200, preview.data
    assert preview.data["data"]["percentage"] == "79.00"
    assert api_client.get(f"/exams/{detail['exam']['id']}").data["data"]["exam"]["rules"] != rules
    imported = api_client.post(
        f"/exams/{detail['exam']['id']}/imports",
        {
            "key": str(uuid.uuid4()),
            "matchBy": "roll",
            "replace": True,
            "rows": [
                {
                    "identifier": "1",
                    "componentId": detail["subjects"][0]["components"][0]["id"],
                    "score": "82",
                    "status": "PRESENT",
                    "profile": {
                        "fatherName": "Guardian reference",
                        "importedTotal": "82",
                        "remarks": "Well done",
                    },
                }
            ],
        },
        format="json",
    )
    assert imported.status_code == 200, imported.data
    committed = api_client.post(
        f"/exams/{detail['exam']['id']}/imports/{imported.data['data']['id']}/commit",
        {},
        format="json",
    )
    assert committed.status_code == 200, committed.data
    fresh = api_client.get(f"/exams/{detail['exam']['id']}").data["data"]
    assert fresh["candidates"][0]["profile"]["fatherName"] == "Guardian reference"
    assert fresh["results"][0]["remark"] == "Well done"
    assert (
        StudentEnrollment.objects.get(id=fresh["candidates"][0]["enrollmentId"]).student.father_name
        != "Guardian reference"
    )


def test_appearance_validation_and_pdf_options(api_client, school):
    detail = create(api_client, school)
    assert save(api_client, detail, ["82", "75"]).status_code == 200
    payload = config(api_client, detail)
    options = {
        "design": "university",
        "typography": "mono",
        "frame": "double",
        "columns": [
            "serial",
            "code",
            "score",
            "maximum",
            "passing",
            "grade",
            "gradePoint",
            "credits",
            "classStats",
            "bars",
            "words",
            "percentage",
            "status",
        ],
        "sections": [
            "total",
            "percentage",
            "gpa",
            "grade",
            "rank",
            "division",
            "words",
            "graph",
            "remarks",
            "legend",
            "qr",
            "watermark",
        ],
    }
    preview = api_client.post("/preview", {**payload, "appearance": options}, format="json")
    assert preview.status_code == 200, preview.data
    pdf = PdfReader(io.BytesIO(base64.b64decode(preview.data["data"]["pdf"])))
    text = "".join(page.extract_text() for page in pdf.pages)
    assert "GPA / SGPA" in text and "Grade scale" in text and "Eighty-two" in text
    for invalid in [
        {"accent": "red"},
        {"columns": ["<script>"]},
        {"logo": "not base64"},
        {"hiddenSubjects": ["outside-exam"]},
    ]:
        assert (
            api_client.post(
                "/preview", {**payload, "appearance": invalid}, format="json"
            ).status_code
            == 400
        )


def test_best_n_grace_weighted_and_fixed_rules():
    from decimal import Decimal
    from types import SimpleNamespace as NS

    from modules.academics.results.calculations import summarize

    def collection(values):
        return NS(all=lambda: values)

    components = [
        NS(id=str(i), name="Written", maximum=Decimal(100), pass_marks=Decimal(40))
        for i in range(3)
    ]
    subjects = [
        NS(subject_id=str(i), subject=NS(name=f"Subject {i}"), components=collection([component]))
        for i, component in enumerate(components)
    ]
    rules = {
        "grades": [
            {"minimum": 80, "label": "A", "points": 9},
            {"minimum": 40, "label": "P", "points": 5},
            {"minimum": 0, "label": "F", "points": 0},
        ],
        "decimals": 2,
        "aggregateMode": "best_n",
        "bestN": 2,
    }
    exam = NS(id="exam", name="Exam", rules=rules, subjects=collection(subjects))
    candidate = NS(id="student", excluded_subject_ids=[], remark="", profile={})
    marks = {
        ("student", str(i)): NS(status="PRESENT", score=Decimal(score))
        for i, score in enumerate(["90", "70", "38"])
    }
    result = summarize(exam, candidate, marks)
    assert result["total"] == "160" and result["maximum"] == "200" and result["result"] == "Pass"
    assert result["rows"][2]["included"] is False
    exam.rules = {
        **rules,
        "aggregateMode": "all",
        "grace": 2,
        "gpaMode": "credit",
        "percentageMode": "weighted",
        "subjects": {"0": {"credits": 4}, "1": {"credits": 2}, "2": {"credits": 1}},
    }
    result = summarize(exam, candidate, marks)
    assert result["grace"] == "2" and result["result"] == "Pass" and result["percentage"] == "77.14"
    assert marks[("student", "2")].score == 38
    assert result["gpa"] == "7.29"
    exam.rules = {**rules, "aggregateMode": "all", "compartment": 1, "overallPass": 33}
    assert summarize(exam, candidate, marks)["result"] == "Compartment"
    exam.rules = {**rules, "aggregateMode": "imported"}
    assert summarize(exam, candidate, marks)["result"] == "Incomplete"
    candidate.profile = {"importedTotal": "220"}
    assert summarize(exam, candidate, marks)["total"] == "220"


def test_document_verification_and_custom_issuance(
    api_client, school, django_capture_on_commit_callbacks
):
    detail = create(api_client, school)
    assert save(api_client, detail, ["80", "90"]).status_code == 200
    payload = config(api_client, detail)
    payload["appearance"] = {
        "design": "royal",
        "sections": ["total", "percentage", "qr", "legend"],
        "crest": "royal",
    }
    with django_capture_on_commit_callbacks(execute=True):
        response = api_client.post("/batches", {**payload, "key": str(uuid.uuid4())}, format="json")
    assert response.status_code == 202, response.data
    document = ResultDocument.objects.filter(batch_id=response.data["data"]["id"]).first()
    assert document.snapshot["documentId"] == str(document.id)
    verified = api_client.get(f"/documents/{document.id}/verify")
    assert verified.status_code == 200, verified.data
    assert len(verified.data["data"]["sha256"]) == 64 and verified.data["data"]["issued"] is False
    document.batch.institute = Institute.objects.create(
        name="Different School", code="VERIFY-OTHER"
    )
    document.batch.save(update_fields=["institute"])
    assert api_client.get(f"/documents/{document.id}/verify").status_code == 404


@pytest.mark.parametrize("mode", ["classic", "modern", "university", "royal"])
def test_reference_layouts_preserve_marks_and_pagination(api_client, school, mode):
    detail = create(api_client, school)
    assert save(api_client, detail, ["80", "90"]).status_code == 200
    payload = config(api_client, detail)
    preview = api_client.post(
        "/preview",
        {
            **payload,
            "appearance": {
                "design": mode,
                "frame": "double",
                "crest": "shield",
                "sections": ["total", "percentage", "gpa", "division", "words", "legend"],
            },
        },
        format="json",
    )
    assert preview.status_code == 200, preview.data
    reader = PdfReader(io.BytesIO(base64.b64decode(preview.data["data"]["pdf"])))
    text = "".join(p.extract_text() for p in reader.pages)
    assert "80" in text and "GPA / SGPA" in text and "Grade scale" in text


def test_v5_studio_source_and_saved_workspaces(api_client, school):
    detail = create(api_client, school)
    assert save(api_client, detail, ["80", "90"]).status_code == 200
    source = api_client.get(f"/studio/exams/{detail['exam']['id']}/source")
    assert source.status_code == 200, source.data
    state = source.data["data"]["state"]
    assert len(state["rows"]) == 2 and state["rows"][0][1] == "Ada Student"
    assert state["rows"][0][-1] == 80
    payload = {
        "sectionId": str(school["section"].id),
        "examId": detail["exam"]["id"],
        "name": "Original v5 working copy",
        "state": state,
    }
    response = api_client.post("/studio/workspaces", payload, format="json")
    assert response.status_code == 201, response.data
    workspace = response.data["data"]
    assert api_client.get("/studio/workspaces").data["data"][0]["students"] == 2
    assert api_client.get(f"/studio/workspaces/{workspace['id']}").data["data"]["state"] == state
    assert not any(
        report["id"] == workspace["id"] for report in api_client.get("/reports").data["data"]
    )
    updated = api_client.post(
        "/studio/workspaces",
        {
            **payload,
            "id": workspace["id"],
            "updatedAt": workspace["updatedAt"],
            "name": "Rearranged",
        },
        format="json",
    )
    assert updated.status_code == 200, updated.data
    stale = api_client.post(
        "/studio/workspaces",
        {**payload, "id": workspace["id"], "updatedAt": workspace["updatedAt"]},
        format="json",
    )
    assert stale.status_code == 400
    assert ResultMark.objects.filter(candidate__exam_id=detail["exam"]["id"], score=80).exists()
    from modules.academics.models import ResultReport

    report = ResultReport.objects.get(id=workspace["id"])
    report.institute = Institute.objects.create(name="Other v5 school", code="OTHER-V5")
    report.save(update_fields=["institute"])
    assert api_client.get(f"/studio/workspaces/{workspace['id']}").status_code == 404


def test_v5_studio_validates_saved_data_and_permissions(api_client, school):
    from rest_framework.exceptions import ValidationError

    from modules.academics.results.studio import validate_state

    detail = create(api_client, school)
    state = api_client.get(f"/studio/exams/{detail['exam']['id']}/source").data["data"]["state"]
    for invalid in [
        {**state, "rows": [[{}]]},
        {**state, "headers": ["Duplicate", "Duplicate"]},
        {**state, "template": {"__proto__": {}}},
        {**state, "gradeScale": []},
        {**state, "gradeScale": ["bad rule"]},
        {**state, "subjectConfigs": {"English": []}},
        {**state, "template": {"sections": []}},
        {**state, "headers": ["A"], "rows": [["x" * 2000001]]},
    ]:
        with pytest.raises(ValidationError):
            validate_state(invalid)
    membership = InstituteMembership.objects.get(user=school["user"], institute=school["institute"])
    membership.role = "TEACHER"
    membership.branch = school["branch"]
    membership.save(update_fields=["role", "branch"])
    assert api_client.get("/studio/workspaces").status_code == 403
    assert api_client.get(f"/studio/exams/{detail['exam']['id']}/source").status_code == 403
