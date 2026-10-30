from datetime import date, time

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from modules.academics.exam_services import update_exam_schedule
from modules.academics.models import (
    AcademicYear,
    ClassSection,
    ClassSubject,
    Exam,
    ExamPaperSchedule,
    ExamSubjectSelection,
    ExamTarget,
    Grade,
    Subject,
)
from modules.access_control.models import Permission, Role, RolePermission, UserRoleAssignment
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import StaffProfile

pytestmark = [pytest.mark.django_db, pytest.mark.urls("modules.academics.api.urls")]


@pytest.fixture
def subject_exam_context(api_client):
    institute = Institute.objects.create(name="Subject Setup Academy", code="SSA")
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
    admin = User.objects.create_user(email="admin@subjects.test", password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    api_client.force_authenticate(
        user=admin, token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    created = api_client.post(
        "/exams",
        {
            "requestId": "00000000-0000-0000-0000-000000000011",
            "campusId": str(branch.id),
            "academicYearId": str(year.id),
            "category": "HALF_YEARLY",
            "name": "Half yearly",
            "classSectionIds": [str(section.id)],
        },
        format="json",
    )
    assert created.status_code == 201
    return {
        "api_client": api_client,
        "institute": institute,
        "branch": branch,
        "year": year,
        "grade": grade,
        "section": section,
        "admin": admin,
        "exam": Exam.objects.get(id=created.json()["data"]["id"]),
    }


def add_subject(context, name, *, grade=None, section=None, code="", subject=None):
    subject = subject or Subject.objects.create(
        institute=context["institute"], branch=context["branch"], name=name, subject_code=code
    )
    mapping = ClassSubject.objects.create(
        institute=context["institute"],
        grade=grade or context["grade"],
        class_section=section,
        subject=subject,
        subject_code_override=f"{code}-LOCAL" if code and section else "",
        is_elective=name == "Art",
        is_lab=name == "Science Lab",
    )
    return subject, mapping


def subject_payload(context, revision, subject_ids):
    return {
        "expectedRevision": revision,
        "targets": [
            {
                "classSectionId": str(context["section"].id),
                "subjectIds": [str(item) for item in subject_ids],
            }
        ],
    }


def test_paper_marks_save_and_preserve_existing_schedule(subject_exam_context):
    context = subject_exam_context
    subject, _ = add_subject(context, "Math")
    url = f"/exams/{context['exam'].id}/subjects"
    assert (
        context["api_client"]
        .put(url, subject_payload(context, 1, [subject.id]), format="json")
        .status_code
        == 200
    )
    selection = ExamSubjectSelection.objects.get(target__exam=context["exam"])
    ExamPaperSchedule.objects.filter(selection=selection).update(
        scheduled_on=date(2026, 10, 26), start_time=time(9), end_time=time(10)
    )
    payload = subject_payload(context, 2, [subject.id])
    payload["targets"][0]["paperMarks"] = [
        {"subjectId": str(subject.id), "theoryMax": "80", "practicalMax": "20", "passMarks": "33", "durationMinutes": 120}
    ]
    response = context["api_client"].put(url, payload, format="json")
    assert response.status_code == 200
    selection.refresh_from_db()
    assert str(selection.theory_max) == "80.00"
    assert str(selection.practical_max) == "20.00"
    assert str(selection.pass_marks) == "33.00"
    assert selection.duration_minutes == 120
    assert selection.schedule.scheduled_on == date(2026, 10, 26)
    assert response.json()["data"]["targets"][0]["subjects"][0]["passMarks"] == "33.00"
    assert response.json()["data"]["targets"][0]["subjects"][0]["durationMinutes"] == 120
    payload["expectedRevision"] = 3
    payload["targets"][0]["paperMarks"][0]["passMarks"] = "101"
    assert context["api_client"].put(url, payload, format="json").status_code == 400


def test_subject_setup_selects_curriculum_subset_and_increments_revision(subject_exam_context):
    context = subject_exam_context
    math, _grade_math = add_subject(context, "Math", code="MTH")
    english, _english = add_subject(context, "English", code="ENG")
    _, section_math = add_subject(
        context, "Math", section=context["section"], code="MTH", subject=math
    )

    initial = context["api_client"].get(f"/exams/{context['exam'].id}/subjects")
    assert initial.status_code == 200
    data = initial.json()["data"]
    assert data["revision"] == 1
    assert data["targets"][0]["sectionName"] == "A"
    assert data["targets"][0]["gradeName"] == "Class 8"
    subjects = {item["id"]: item for item in data["targets"][0]["subjects"]}
    assert set(subjects) == {str(math.id), str(english.id)}
    assert subjects[str(math.id)]["code"] == "MTH-LOCAL"
    assert subjects[str(math.id)]["isElective"] is False
    assert subjects[str(math.id)]["isLab"] is False
    assert subjects[str(english.id)]["selected"] is False

    saved = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id, english.id]),
        format="json",
    )
    assert saved.status_code == 200
    assert saved.json()["data"]["revision"] == 2
    selected = {
        item["id"] for item in saved.json()["data"]["targets"][0]["subjects"] if item["selected"]
    }
    assert selected == {str(math.id), str(english.id)}
    assert (
        ExamSubjectSelection.objects.filter(
            target__exam=context["exam"], class_subject__in=[section_math, _english]
        ).count()
        == 2
    )
    assert list(context["exam"].changes.values_list("revision", flat=True)) == [1, 2]


def test_subject_setup_target_metadata_is_sorted_stably(subject_exam_context):
    context = subject_exam_context
    first = ClassSection.objects.create(
        branch=context["branch"],
        grade=context["grade"],
        academic_year=context["year"],
        section_name="0",
    )
    ExamTarget.objects.create(exam=context["exam"], class_section=first)

    response = context["api_client"].get(f"/exams/{context['exam'].id}/subjects")
    assert response.status_code == 200
    targets = response.json()["data"]["targets"]
    assert [item["sectionName"] for item in targets] == ["0", "A"]
    assert [item["classSectionId"] for item in targets] == [
        str(first.id),
        str(context["section"].id),
    ]


def test_subject_setup_rejects_ineligible_mapping_and_stale_revision(subject_exam_context):
    context = subject_exam_context
    math, _ = add_subject(context, "Math")
    science, _ = add_subject(
        context,
        "Science",
        grade=Grade.objects.create(institute=context["institute"], name="Class 9"),
    )

    ineligible = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [science.id]),
        format="json",
    )
    assert ineligible.status_code == 400
    assert "current curriculum" in str(ineligible.json())

    saved = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id]),
        format="json",
    )
    assert saved.status_code == 200
    stale = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, []),
        format="json",
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "revision_conflict"


def test_subject_setup_pair_grant_cannot_select_other_subject(subject_exam_context):
    context = subject_exam_context
    math, _ = add_subject(context, "Math", section=context["section"])
    english, _ = add_subject(context, "English", section=context["section"])
    teacher = User.objects.create_user(email="teacher@subjects.test", password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=teacher,
        institute=context["institute"],
        branch=context["branch"],
        role=InstituteMembership.Role.TEACHER,
    )
    StaffProfile.objects.create(institute=context["institute"], user=teacher)
    for action, configuration in (
        (
            "assessment.view",
            {
                "schemaVersion": 1,
                "examScope": "selected",
                "classSectionIds": [str(context["section"].id)],
            },
        ),
        (
            "assessment.edit",
            {
                "schemaVersion": 1,
                "examScope": "selected",
                "classSubjectPairs": [
                    {"classSectionId": str(context["section"].id), "subjectId": str(math.id)}
                ],
            },
        ),
    ):
        permission, _ = Permission.objects.update_or_create(
            permission_key=action,
            defaults={"module": "academics", "description": action, "is_active": True},
        )
        role = Role.objects.create(
            institute=context["institute"],
            branch=context["branch"],
            name=f"{action} math only",
            created_by=context["admin"],
        )
        RolePermission.objects.create(role=role, permission=permission, configuration=configuration)
        UserRoleAssignment.objects.create(
            user=teacher, institute=context["institute"], branch=context["branch"], role=role
        )

    client = APIClient()
    client.force_authenticate(
        user=teacher, token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    rejected = client.put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [english.id]),
        format="json",
    )
    assert rejected.status_code == 403

    allowed = client.put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id]),
        format="json",
    )
    assert allowed.status_code == 200


def test_existing_selection_is_readable_but_stale_mapping_cannot_be_resaved(subject_exam_context):
    context = subject_exam_context
    math, mapping = add_subject(context, "Math")
    saved = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id]),
        format="json",
    )
    assert saved.status_code == 200

    other_grade = Grade.objects.create(institute=context["institute"], name="Class 9")
    mapping.grade = other_grade
    mapping.save()

    readable = context["api_client"].get(f"/exams/{context['exam'].id}/subjects")
    assert readable.status_code == 200
    target = readable.json()["data"]["targets"][0]
    assert target["selectedSubjectIds"] == [str(math.id)]
    assert target["subjects"] == []
    assert target["staleSelections"] == [
        {
            "id": str(math.id),
            "name": "Math",
            "code": "",
            "isElective": False,
            "isLab": False,
            "staleMapping": True,
        }
    ]

    stale = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 2, [math.id]),
        format="json",
    )
    assert stale.status_code == 400
    assert "mapping changed" in str(stale.json())


def test_update_rebinds_selected_subject_when_a_new_current_mapping_takes_precedence(
    subject_exam_context,
):
    context = subject_exam_context
    math, grade_mapping = add_subject(context, "Math")
    _, section_mapping = add_subject(context, "Math", section=context["section"], subject=math)
    saved = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id]),
        format="json",
    )
    assert saved.status_code == 200
    assert ExamSubjectSelection.objects.get().class_subject_id == section_mapping.id

    other_section = ClassSection.objects.create(
        branch=context["branch"],
        grade=context["grade"],
        academic_year=context["year"],
        section_name="B",
    )
    section_mapping.class_section = other_section
    section_mapping.save()

    readable = context["api_client"].get(f"/exams/{context['exam'].id}/subjects")
    assert readable.status_code == 200
    target = readable.json()["data"]["targets"][0]
    assert target["subjects"][0]["selected"] is True
    assert target["staleSelections"] == []
    assert len(target["subjects"]) == 1

    rebound = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 2, [math.id]),
        format="json",
    )
    assert rebound.status_code == 200
    assert rebound.json()["data"]["revision"] == 3
    assert ExamSubjectSelection.objects.get().class_subject_id == grade_mapping.id
    assert rebound.json()["data"]["targets"][0]["staleSelections"] == []


def test_schedule_creates_one_blank_slot_per_selected_paper_and_saves_atomically(
    subject_exam_context,
):
    context = subject_exam_context
    math, _ = add_subject(context, "Math", section=context["section"], code="MTH")
    english, _ = add_subject(context, "English", section=context["section"], code="ENG")
    setup = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id, english.id]),
        format="json",
    )
    assert setup.status_code == 200
    selection = ExamSubjectSelection.objects.get(target__exam=context["exam"], class_subject__subject=math)
    assert str(selection.theory_max) == "100.00"
    assert str(selection.pass_marks) == "33.00"
    assert selection.duration_minutes == 180
    assert ExamPaperSchedule.objects.filter(selection__target__exam=context["exam"]).count() == 2

    url = f"/exams/{context['exam'].id}/schedule"
    initial = context["api_client"].get(url)
    assert initial.status_code == 200
    assert initial.json()["data"]["revision"] == 2
    papers = initial.json()["data"]["papers"]
    assert [paper["subjectName"] for paper in papers] == ["English", "Math"]
    assert all(paper["scheduledOn"] is None for paper in papers)
    assert all(paper["durationMinutes"] == 180 for paper in papers)

    exam = Exam.objects.get(id=context["exam"].id)
    exam.starts_on = date(2026, 10, 20)
    exam.ends_on = date(2026, 10, 30)
    exam.save()
    payload = {
        "expectedRevision": 2,
        "papers": [
            {
                "classSectionId": str(context["section"].id),
                "subjectId": str(math.id),
                "scheduledOn": "2026-10-26",
                "startTime": "09:00",
                "endTime": "10:00",
            },
            {
                "classSectionId": str(context["section"].id),
                "subjectId": str(english.id),
                "scheduledOn": None,
                "startTime": None,
                "endTime": None,
            },
        ],
    }
    saved = context["api_client"].put(url, payload, format="json")
    assert saved.status_code == 200
    assert saved.json()["data"]["revision"] == 3
    assert list(
        ExamPaperSchedule.objects.filter(selection__class_subject__subject=math).values_list(
            "scheduled_on", "start_time", "end_time"
        )
    ) == [(date(2026, 10, 26), time(9), time(10))]
    assert list(context["exam"].changes.values_list("action", flat=True)) == [
        "CREATE",
        "SUBJECT_SETUP",
        "SCHEDULE_SETUP",
    ]


def test_schedule_update_reads_all_slots_in_bulk(subject_exam_context):
    context = subject_exam_context
    subjects = [
        add_subject(context, name, section=context["section"])[0]
        for name in ("Math", "English", "Science", "History")
    ]
    context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [subject.id for subject in subjects]),
        format="json",
    )
    values = {
        "expectedRevision": 2,
        "papers": [
            {
                "classSectionId": str(context["section"].id),
                "subjectId": str(subject.id),
                "scheduledOn": date(2026, 10, 26),
                "startTime": time(9 + index, 0),
                "endTime": time(10 + index, 0),
            }
            for index, subject in enumerate(subjects)
        ],
    }

    with CaptureQueriesContext(connection) as queries:
        result = update_exam_schedule(
            actor=context["admin"],
            institute=context["institute"],
            exam_id=context["exam"].id,
            values=values,
        )

    schedule_reads = [
        query
        for query in queries.captured_queries
        if query["sql"].lstrip().upper().startswith("SELECT")
        and "EXAM_PAPER_SCHEDULES" in query["sql"].upper()
    ]
    assert len(schedule_reads) == 2  # One bulk read, plus the response read.
    assert result["revision"] == 3
    assert len(result["papers"]) == len(subjects)


@pytest.mark.parametrize(
    "patch, message",
    [
        ({"scheduledOn": "2026-10-26"}, "together"),
        (
            {"scheduledOn": "2026-10-26", "startTime": "10:00", "endTime": "09:00"},
            "later",
        ),
        ({"scheduledOn": "2026-11-01", "startTime": "09:00", "endTime": "10:00"}, "date range"),
    ],
)
def test_schedule_rejects_partial_invalid_and_out_of_range_slots(
    subject_exam_context, patch, message
):
    context = subject_exam_context
    math, _ = add_subject(context, "Math", section=context["section"])
    context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id]),
        format="json",
    )
    exam = Exam.objects.get(id=context["exam"].id)
    exam.starts_on = date(2026, 10, 20)
    exam.ends_on = date(2026, 10, 30)
    exam.save()
    payload = {
        "expectedRevision": 2,
        "papers": [
            {
                "classSectionId": str(context["section"].id),
                "subjectId": str(math.id),
                "scheduledOn": None,
                "startTime": None,
                "endTime": None,
                **patch,
            }
        ],
    }
    response = context["api_client"].put(f"/exams/{exam.id}/schedule", payload, format="json")
    assert response.status_code == 400
    assert message in str(response.json())
    assert Exam.objects.get(id=exam.id).revision == 2


def test_schedule_requires_exact_paper_pairs_and_expected_revision(subject_exam_context):
    context = subject_exam_context
    math, _ = add_subject(context, "Math", section=context["section"])
    english, _ = add_subject(context, "English", section=context["section"])
    context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id, english.id]),
        format="json",
    )
    url = f"/exams/{context['exam'].id}/schedule"
    blank = {"scheduledOn": None, "startTime": None, "endTime": None}
    missing = context["api_client"].put(
        url,
        {
            "expectedRevision": 2,
            "papers": [
                {
                    "classSectionId": str(context["section"].id),
                    "subjectId": str(math.id),
                    **blank,
                }
            ],
        },
        format="json",
    )
    assert missing.status_code == 400
    stale = context["api_client"].put(
        url,
        {
            "expectedRevision": 1,
            "papers": [
                {
                    "classSectionId": str(context["section"].id),
                    "subjectId": str(math.id),
                    **blank,
                },
                {
                    "classSectionId": str(context["section"].id),
                    "subjectId": str(english.id),
                    **blank,
                },
            ],
        },
        format="json",
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "revision_conflict"


def test_schedule_edit_permission_is_checked_per_changed_subject_pair(subject_exam_context):
    context = subject_exam_context
    math, _ = add_subject(context, "Math", section=context["section"])
    english, _ = add_subject(context, "English", section=context["section"])
    context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id, english.id]),
        format="json",
    )

    teacher = User.objects.create_user(email="teacher@schedule.test", password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=teacher,
        institute=context["institute"],
        branch=context["branch"],
        role=InstituteMembership.Role.TEACHER,
    )
    StaffProfile.objects.create(institute=context["institute"], user=teacher)
    for action, configuration in (
        (
            "assessment.view",
            {
                "schemaVersion": 1,
                "examScope": "selected",
                "classSectionIds": [str(context["section"].id)],
            },
        ),
        (
            "assessment.edit",
            {
                "schemaVersion": 1,
                "examScope": "selected",
                "classSubjectPairs": [
                    {"classSectionId": str(context["section"].id), "subjectId": str(math.id)}
                ],
            },
        ),
    ):
        permission, _ = Permission.objects.update_or_create(
            permission_key=action,
            defaults={"module": "academics", "description": action, "is_active": True},
        )
        role = Role.objects.create(
            institute=context["institute"],
            branch=context["branch"],
            name=f"{action} schedule scope",
            created_by=context["admin"],
        )
        RolePermission.objects.create(role=role, permission=permission, configuration=configuration)
        UserRoleAssignment.objects.create(
            user=teacher, institute=context["institute"], branch=context["branch"], role=role
        )

    client = APIClient()
    client.force_authenticate(
        user=teacher, token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    detail = client.get(f"/exams/{context['exam'].id}")
    assert detail.status_code == 200
    assert detail.json()["data"]["actions"]["schedule"] is True
    url = f"/exams/{context['exam'].id}/schedule"
    base = {
        "classSectionId": str(context["section"].id),
        "scheduledOn": None,
        "startTime": None,
        "endTime": None,
    }
    allowed = client.put(
        url,
        {
            "expectedRevision": 2,
            "papers": [
                {
                    **base,
                    "subjectId": str(math.id),
                    "scheduledOn": "2026-10-26",
                    "startTime": "09:00",
                    "endTime": "10:00",
                },
                {**base, "subjectId": str(english.id)},
            ],
        },
        format="json",
    )
    assert allowed.status_code == 200
    assert allowed.json()["data"]["revision"] == 3

    denied = client.put(
        url,
        {
            "expectedRevision": 3,
            "papers": [
                {
                    **base,
                    "subjectId": str(math.id),
                    "scheduledOn": "2026-10-26",
                    "startTime": "09:00",
                    "endTime": "10:00",
                },
                {
                    **base,
                    "subjectId": str(english.id),
                    "scheduledOn": "2026-10-26",
                    "startTime": "11:00",
                    "endTime": "12:00",
                },
            ],
        },
        format="json",
    )
    assert denied.status_code == 403
    assert Exam.objects.get(id=context["exam"].id).revision == 3


def test_schedule_remains_editable_after_setup_notice_publication(subject_exam_context):
    context = subject_exam_context
    math, _ = add_subject(context, "Math", section=context["section"])
    context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id]),
        format="json",
    )
    published = context["api_client"].post(
        f"/exams/{context['exam'].id}/publish", {"expectedRevision": 2}, format="json"
    )
    assert published.status_code == 200
    assert published.json()["data"]["actions"]["edit"] is False
    assert published.json()["data"]["actions"]["schedule"] is True
    assert published.json()["data"]["publicationSnapshot"]["snapshot"]["kind"] == (
        "EXAM_SETUP_NOTICE"
    )

    url = f"/exams/{context['exam'].id}/schedule"
    paper = {
        "classSectionId": str(context["section"].id),
        "subjectId": str(math.id),
        "scheduledOn": "2026-10-26",
        "startTime": "09:00",
        "endTime": "10:00",
    }
    saved = context["api_client"].put(
        url, {"expectedRevision": 3, "papers": [paper]}, format="json"
    )
    assert saved.status_code == 200
    assert saved.json()["data"]["revision"] == 4
    assert saved.json()["data"]["papers"][0]["scheduledOn"] == "2026-10-26"
    assert Exam.objects.get(id=context["exam"].id).status == Exam.Status.PUBLISHED

    subject_edit = context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 4, [math.id]),
        format="json",
    )
    assert subject_edit.status_code == 400
    general_edit = context["api_client"].patch(
        f"/exams/{context['exam'].id}",
        {"expectedRevision": 4, "name": "Changed"},
        format="json",
    )
    assert general_edit.status_code == 400


def test_published_exam_without_setup_notice_cannot_expose_or_edit_schedule(
    subject_exam_context,
):
    context = subject_exam_context
    math, _ = add_subject(context, "Math", section=context["section"])
    context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        subject_payload(context, 1, [math.id]),
        format="json",
    )
    Exam.objects.filter(id=context["exam"].id).update(status=Exam.Status.PUBLISHED)

    detail = context["api_client"].get(f"/exams/{context['exam'].id}")
    assert detail.status_code == 200
    assert detail.json()["data"]["actions"]["edit"] is False
    assert detail.json()["data"]["actions"]["schedule"] is False

    url = f"/exams/{context['exam'].id}/schedule"
    assert context["api_client"].get(url).status_code == 400
    denied = context["api_client"].put(
        url,
        {
            "expectedRevision": 2,
            "papers": [
                {
                    "classSectionId": str(context["section"].id),
                    "subjectId": str(math.id),
                    "scheduledOn": None,
                    "startTime": None,
                    "endTime": None,
                }
            ],
        },
        format="json",
    )
    assert denied.status_code == 400
