from datetime import date

import pytest
from rest_framework.test import APIClient

from modules.academics.models import (
    AcademicYear,
    ClassSection,
    ClassSubject,
    Exam,
    ExamElectiveStudentAssignment,
    Grade,
    Room,
    StudentEnrollment,
    Subject,
)
from modules.access_control.models import Permission, Role, RolePermission, UserRoleAssignment
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student

pytestmark = [pytest.mark.django_db, pytest.mark.urls("modules.academics.api.urls")]


@pytest.fixture
def coverage_context(api_client):
    institute = Institute.objects.create(name="Coverage Academy", code="CVA")
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
    admin = User.objects.create_user(email="admin@coverage.test", password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    api_client.force_authenticate(
        user=admin, token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    created = api_client.post(
        "/exams",
        {
            "requestId": "00000000-0000-0000-0000-000000000081",
            "campusId": str(branch.id),
            "academicYearId": str(year.id),
            "category": "HALF_YEARLY",
            "name": "Coverage exam",
            "classSectionIds": [str(section.id)],
        },
        format="json",
    )
    assert created.status_code == 201
    exam = Exam.objects.get(id=created.json()["data"]["id"])
    return {
        "api_client": api_client,
        "institute": institute,
        "branch": branch,
        "year": year,
        "grade": grade,
        "section": section,
        "admin": admin,
        "exam": exam,
    }


def add_coverage_subject(context, name, *, elective=False, section=None):
    subject = Subject.objects.create(
        institute=context["institute"], branch=context["branch"], name=name
    )
    mapping = ClassSubject.objects.create(
        institute=context["institute"],
        grade=context["grade"],
        class_section=section,
        subject=subject,
        is_elective=elective,
    )
    return subject, mapping


def add_student(context, admission_number, *, section=None, active=True, roll=None):
    section = section or context["section"]
    student = Student.objects.create(
        institute=context["institute"],
        branch=context["branch"],
        admission_number=admission_number,
        first_name=f"Student {admission_number}",
        is_active=active,
    )
    enrollment = StudentEnrollment.objects.create(
        student=student,
        class_section=section,
        academic_year=context["year"],
        roll_number=roll or admission_number,
    )
    return student, enrollment


def select_papers(context, subject_ids, revision=1):
    return context["api_client"].put(
        f"/exams/{context['exam'].id}/subjects",
        {
            "expectedRevision": revision,
            "targets": [
                {
                    "classSectionId": str(context["section"].id),
                    "subjectIds": [str(subject_id) for subject_id in subject_ids],
                }
            ],
        },
        format="json",
    )


def candidates_url(context, section=None, subject=None):
    return (
        f"/exams/{context['exam'].id}/coverage/"
        f"{section or context['section'].id}/{subject.id}/candidates"
    )


def test_non_elective_paper_covers_active_enrollments_automatically(coverage_context):
    context = coverage_context
    math, _ = add_coverage_subject(context, "Math")
    add_student(context, "ST-001")
    add_student(context, "ST-002")
    selected = select_papers(context, [math.id])
    assert selected.status_code == 200

    response = context["api_client"].get(f"/exams/{context['exam'].id}/coverage")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["complete"] is True
    assert data["activeStudentCount"] == 2
    assert data["coveredStudentCount"] == 2
    assert data["uncoveredStudentCount"] == 0
    assert data["nonElectivePaperCount"] == 1
    assert data["electivePaperCount"] == 0
    assert data["sections"][0]["coveredStudentCount"] == 2


def test_elective_coverage_requires_explicit_assignment_and_is_revision_checked(
    coverage_context,
):
    context = coverage_context
    art, _ = add_coverage_subject(context, "Art", elective=True)
    student, _ = add_student(context, "ST-010")
    assert select_papers(context, [art.id]).status_code == 200
    coverage_url = f"/exams/{context['exam'].id}/coverage"

    missing = context["api_client"].get(coverage_url)
    assert missing.status_code == 200
    assert missing.json()["data"]["complete"] is False
    assert missing.json()["data"]["uncoveredStudents"][0]["studentId"] == str(student.id)

    url = candidates_url(context, subject=art)
    conflict = context["api_client"].put(
        url,
        {"expectedRevision": 1, "studentIds": [str(student.id)]},
        format="json",
    )
    assert conflict.status_code == 409

    saved = context["api_client"].put(
        url,
        {"expectedRevision": 2, "studentIds": [str(student.id)]},
        format="json",
    )
    assert saved.status_code == 200
    assert saved.json()["data"]["revision"] == 3
    assert saved.json()["data"]["assignedStudentIds"] == [str(student.id)]
    assert context["api_client"].get(coverage_url).json()["data"]["complete"] is True
    assert ExamElectiveStudentAssignment.objects.count() == 1


def test_elective_assignment_rejects_wrong_section_and_inactive_student(coverage_context):
    context = coverage_context
    art, _ = add_coverage_subject(context, "Art", elective=True)
    assert select_papers(context, [art.id]).status_code == 200
    other_section = ClassSection.objects.create(
        branch=context["branch"],
        grade=context["grade"],
        academic_year=context["year"],
        section_name="B",
    )
    wrong_section_student, _ = add_student(context, "ST-020", section=other_section, roll="B-01")
    inactive_student, _ = add_student(context, "ST-021", active=False)
    url = candidates_url(context, subject=art)

    for candidate in (wrong_section_student, inactive_student):
        denied = context["api_client"].put(
            url,
            {"expectedRevision": 2, "studentIds": [str(candidate.id)]},
            format="json",
        )
        assert denied.status_code == 400
    assert ExamElectiveStudentAssignment.objects.count() == 0
    assert Exam.objects.get(id=context["exam"].id).revision == 2


def test_elective_assignment_requires_pair_scoped_edit_permission(coverage_context):
    context = coverage_context
    art, _ = add_coverage_subject(context, "Art", elective=True)
    student, _ = add_student(context, "ST-030")
    assert select_papers(context, [art.id]).status_code == 200

    reader = User.objects.create_user(email="reader@coverage.test", password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=reader,
        institute=context["institute"],
        branch=context["branch"],
        role=InstituteMembership.Role.TEACHER,
    )
    view_permission = Permission.objects.get(permission_key="assessment.view")
    role = Role.objects.create(
        institute=context["institute"],
        branch=context["branch"],
        name="Coverage reader",
        is_system_role=False,
        created_by=context["admin"],
    )
    RolePermission.objects.create(role=role, permission=view_permission)
    UserRoleAssignment.objects.create(
        user=reader, institute=context["institute"], branch=context["branch"], role=role
    )
    client = APIClient()
    client.force_authenticate(
        user=reader, token={"client": "admin-web", "membership_id": str(membership.id)}
    )

    denied = client.put(
        candidates_url(context, subject=art),
        {"expectedRevision": 2, "studentIds": [str(student.id)]},
        format="json",
    )

    assert denied.status_code == 403
    assert ExamElectiveStudentAssignment.objects.count() == 0


def test_published_setup_notice_still_allows_elective_coverage_edits(coverage_context):
    context = coverage_context
    art, _ = add_coverage_subject(context, "Art", elective=True)
    student, _ = add_student(context, "ST-040")
    assert select_papers(context, [art.id]).status_code == 200
    published = context["api_client"].post(
        f"/exams/{context['exam'].id}/publish", {"expectedRevision": 2}, format="json"
    )
    assert published.status_code == 200
    assert published.json()["data"]["status"] == "PUBLISHED"
    assert published.json()["data"]["actions"]["schedule"] is True

    saved = context["api_client"].put(
        candidates_url(context, subject=art),
        {"expectedRevision": 3, "studentIds": [str(student.id)]},
        format="json",
    )

    assert saved.status_code == 200
    assert saved.json()["data"]["revision"] == 4
    assert context["api_client"].get(f"/exams/{context['exam'].id}/coverage").status_code == 200


def _schedule_exam(context, exam, subject, *, starts="09:00", ends="10:00", revision=2):
    return context["api_client"].put(
        f"/exams/{exam.id}/schedule",
        {
            "expectedRevision": revision,
            "papers": [
                {
                    "classSectionId": str(context["section"].id),
                    "subjectId": str(subject.id),
                    "scheduledOn": "2026-10-26",
                    "startTime": starts,
                    "endTime": ends,
                }
            ],
        },
        format="json",
    )


def test_paper_room_and_invigilator_save_and_validate_campus(coverage_context):
    context = coverage_context
    subject, _ = add_coverage_subject(context, "Math")
    add_student(context, "ST-RESOURCE")
    assert select_papers(context, [subject.id]).status_code == 200
    room = Room.objects.create(
        institute=context["institute"], branch=context["branch"], name="Room 101"
    )
    payload = {
        "expectedRevision": 2,
        "papers": [
            {
                "classSectionId": str(context["section"].id),
                "subjectId": str(subject.id),
                "scheduledOn": "2026-10-26",
                "startTime": "09:00",
                "endTime": "10:00",
                "roomId": str(room.id),
                "invigilatorId": str(context["admin"].id),
            }
        ],
    }
    response = context["api_client"].put(
        f"/exams/{context['exam'].id}/schedule", payload, format="json"
    )
    assert response.status_code == 200
    paper = response.json()["data"]["papers"][0]
    assert paper["roomId"] == str(room.id)
    assert paper["invigilatorId"] == str(context["admin"].id)
    room.is_active = False
    room.save()
    other_room = Room.objects.create(
        institute=context["institute"], branch=context["branch"], name="Inactive", is_active=False
    )
    payload["expectedRevision"] = 3
    payload["papers"][0]["roomId"] = str(other_room.id)
    assert (
        context["api_client"]
        .put(f"/exams/{context['exam'].id}/schedule", payload, format="json")
        .status_code
        == 400
    )


def test_resource_overlap_is_reported_before_publication(coverage_context):
    context = coverage_context
    math, _ = add_coverage_subject(context, "Math")
    english, _ = add_coverage_subject(context, "English")
    add_student(context, "ST-OVERLAP")
    assert select_papers(context, [math.id, english.id]).status_code == 200
    room = Room.objects.create(
        institute=context["institute"], branch=context["branch"], name="Room 101"
    )
    payload = {
        "expectedRevision": 2,
        "papers": [
            {
                "classSectionId": str(context["section"].id),
                "subjectId": str(subject.id),
                "scheduledOn": "2026-10-26",
                "startTime": "09:00",
                "endTime": "10:00",
                "roomId": str(room.id),
            }
            for subject in (math, english)
        ],
    }
    assert (
        context["api_client"]
        .put(f"/exams/{context['exam'].id}/schedule", payload, format="json")
        .status_code
        == 200
    )
    response = context["api_client"].get(f"/exams/{context['exam'].id}/timetable")
    assert response.status_code == 200
    assert any(item["code"] == "RESOURCE_OVERLAP" for item in response.json()["data"]["conflicts"])


def test_combined_publication_rolls_back_notice_on_blocker(coverage_context):
    context = coverage_context
    subject, _ = add_coverage_subject(context, "Art", elective=True)
    add_student(context, "ST-ATOMIC")
    assert select_papers(context, [subject.id]).status_code == 200
    assert _schedule_exam(context, context["exam"], subject).status_code == 200
    response = context["api_client"].post(
        f"/exams/{context['exam'].id}/publish-complete", {"expectedRevision": 3}, format="json"
    )
    assert response.status_code == 400
    context["exam"].refresh_from_db()
    assert context["exam"].status == Exam.Status.DRAFT
    assert context["exam"].revision == 3
    assert not context["exam"].publications.exists()


def test_combined_publication_creates_both_snapshots(coverage_context):
    context = coverage_context
    subject, _ = add_coverage_subject(context, "Math")
    add_student(context, "ST-COMPLETE")
    assert select_papers(context, [subject.id]).status_code == 200
    assert _schedule_exam(context, context["exam"], subject).status_code == 200
    response = context["api_client"].post(
        f"/exams/{context['exam'].id}/publish-complete", {"expectedRevision": 3}, format="json"
    )
    assert response.status_code == 200
    context["exam"].refresh_from_db()
    assert context["exam"].status == Exam.Status.PUBLISHED
    assert context["exam"].revision == 5
    assert set(context["exam"].publications.values_list("snapshot__kind", flat=True)) == {
        "EXAM_SETUP_NOTICE",
        "EXAM_TIMETABLE",
    }


def test_combined_publication_accepts_existing_notice_and_rejects_stale_revision(coverage_context):
    context = coverage_context
    subject, _ = add_coverage_subject(context, "Math")
    add_student(context, "ST-NOTICE")
    assert select_papers(context, [subject.id]).status_code == 200
    assert _schedule_exam(context, context["exam"], subject).status_code == 200
    notice = context["api_client"].post(
        f"/exams/{context['exam'].id}/publish", {"expectedRevision": 3}, format="json"
    )
    assert notice.status_code == 200
    url = f"/exams/{context['exam'].id}/publish-complete"
    assert (
        context["api_client"].post(url, {"expectedRevision": 3}, format="json").status_code == 409
    )
    assert (
        context["api_client"].post(url, {"expectedRevision": 4}, format="json").status_code == 200
    )
    assert context["exam"].publications.filter(snapshot__kind="EXAM_SETUP_NOTICE").count() == 1
    assert context["exam"].publications.filter(snapshot__kind="EXAM_TIMETABLE").count() == 1


def test_timetable_publication_requires_schedule_and_live_coverage(coverage_context):
    context = coverage_context
    art, _ = add_coverage_subject(context, "Art", elective=True)
    student, _ = add_student(context, "ST-050")
    assert select_papers(context, [art.id]).status_code == 200
    assert _schedule_exam(context, context["exam"], art).status_code == 200

    validation = context["api_client"].get(f"/exams/{context['exam'].id}/timetable")
    assert validation.status_code == 200
    assert validation.json()["data"]["ready"] is False
    assert any(
        item["code"] == "CANDIDATE_UNCOVERED" for item in validation.json()["data"]["blockers"]
    )

    blocked = context["api_client"].post(
        f"/exams/{context['exam'].id}/timetable/publish",
        {"expectedRevision": 3},
        format="json",
    )
    assert blocked.status_code == 400
    assert not context["exam"].publications.filter(snapshot__kind="EXAM_TIMETABLE").exists()

    assigned = context["api_client"].put(
        candidates_url(context, subject=art),
        {"expectedRevision": 3, "studentIds": [str(student.id)]},
        format="json",
    )
    assert assigned.status_code == 200
    published = context["api_client"].post(
        f"/exams/{context['exam'].id}/timetable/publish",
        {"expectedRevision": 4},
        format="json",
    )
    assert published.status_code == 200
    data = published.json()["data"]
    assert data["ready"] is True
    assert data["publication"]["revision"] == 5
    assert data["publication"]["snapshot"]["papers"][0]["candidateStudentIds"] == [str(student.id)]
    assert Exam.objects.get(id=context["exam"].id).status == Exam.Status.DRAFT
    assert Exam.objects.get(id=context["exam"].id).revision == 5
    assert (
        Exam.objects.get(id=context["exam"].id)
        .publications.filter(snapshot__kind="EXAM_SETUP_NOTICE")
        .count()
        == 0
    )
    assert (
        context["api_client"]
        .get(f"/exams/{context['exam'].id}/timetable")
        .json()["data"]["publication"]
    )
    assert (
        context["api_client"]
        .put(
            f"/exams/{context['exam'].id}/schedule",
            {
                "expectedRevision": 5,
                "papers": [
                    {
                        "classSectionId": str(context["section"].id),
                        "subjectId": str(art.id),
                        "scheduledOn": "2026-10-26",
                        "startTime": "10:00",
                        "endTime": "11:00",
                    }
                ],
            },
            format="json",
        )
        .status_code
        == 400
    )


def test_candidate_time_overlap_blocks_timetable_publish_but_adjacent_times_are_allowed(
    coverage_context,
):
    context = coverage_context
    math, _ = add_coverage_subject(context, "Math")
    science, _ = add_coverage_subject(context, "Science")
    add_student(context, "ST-060")
    assert select_papers(context, [math.id, science.id]).status_code == 200
    update = context["api_client"].put(
        f"/exams/{context['exam'].id}/schedule",
        {
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
                    "subjectId": str(science.id),
                    "scheduledOn": "2026-10-26",
                    "startTime": "09:30",
                    "endTime": "10:30",
                },
            ],
        },
        format="json",
    )
    assert update.status_code == 200
    assert (
        context["api_client"]
        .get(f"/exams/{context['exam'].id}/timetable")
        .json()["data"]["conflicts"]
    )

    adjacent = context["api_client"].put(
        f"/exams/{context['exam'].id}/schedule",
        {
            "expectedRevision": 3,
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
                    "subjectId": str(science.id),
                    "scheduledOn": "2026-10-26",
                    "startTime": "10:00",
                    "endTime": "11:00",
                },
            ],
        },
        format="json",
    )
    assert adjacent.status_code == 200
    ready = context["api_client"].get(f"/exams/{context['exam'].id}/timetable").json()["data"]
    assert ready["ready"] is True
    assert ready["conflicts"] == []


def test_published_timetable_blocks_candidate_overlap_across_exams(coverage_context):
    context = coverage_context
    math, _ = add_coverage_subject(context, "Math")
    add_student(context, "ST-061")
    assert select_papers(context, [math.id]).status_code == 200
    assert _schedule_exam(context, context["exam"], math).status_code == 200
    first = context["api_client"].post(
        f"/exams/{context['exam'].id}/timetable/publish", {"expectedRevision": 3}, format="json"
    )
    assert first.status_code == 200

    second_response = context["api_client"].post(
        "/exams",
        {
            "requestId": "00000000-0000-0000-0000-000000000082",
            "campusId": str(context["branch"].id),
            "academicYearId": str(context["year"].id),
            "category": "CLASS_TEST",
            "name": "Second exam",
            "classSectionIds": [str(context["section"].id)],
        },
        format="json",
    )
    assert second_response.status_code == 201
    second = Exam.objects.get(id=second_response.json()["data"]["id"])
    selected = context["api_client"].put(
        f"/exams/{second.id}/subjects",
        {
            "expectedRevision": 1,
            "targets": [
                {"classSectionId": str(context["section"].id), "subjectIds": [str(math.id)]}
            ],
        },
        format="json",
    )
    assert selected.status_code == 200
    assert _schedule_exam(context, second, math).status_code == 200
    validation = context["api_client"].get(f"/exams/{second.id}/timetable").json()["data"]
    assert validation["ready"] is False
    assert validation["conflicts"][0]["otherExamName"] == "Coverage exam"
    blocked = context["api_client"].post(
        f"/exams/{second.id}/timetable/publish", {"expectedRevision": 3}, format="json"
    )
    assert blocked.status_code == 400
    assert not second.publications.filter(snapshot__kind="EXAM_TIMETABLE").exists()


def test_timetable_publish_permission_is_separate_from_setup_notice(coverage_context):
    context = coverage_context
    math, _ = add_coverage_subject(context, "Math")
    add_student(context, "ST-070")
    assert select_papers(context, [math.id]).status_code == 200
    assert _schedule_exam(context, context["exam"], math).status_code == 200
    teacher = User.objects.create_user(email="publisher@coverage.test", password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=teacher,
        institute=context["institute"],
        branch=context["branch"],
        role=InstituteMembership.Role.TEACHER,
    )
    permission = Permission.objects.get(permission_key="assessment.publish")
    role = Role.objects.create(
        institute=context["institute"],
        branch=context["branch"],
        name="Notice publisher",
        is_system_role=False,
        created_by=context["admin"],
    )
    RolePermission.objects.create(role=role, permission=permission)
    UserRoleAssignment.objects.create(
        user=teacher,
        institute=context["institute"],
        branch=context["branch"],
        role=role,
    )
    client = APIClient()
    client.force_authenticate(
        user=teacher, token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    denied = client.post(
        f"/exams/{context['exam'].id}/timetable/publish", {"expectedRevision": 3}, format="json"
    )
    assert denied.status_code == 403
