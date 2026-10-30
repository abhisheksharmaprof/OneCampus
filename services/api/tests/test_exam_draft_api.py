from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier

import pytest
from django.db import close_old_connections, connection
from rest_framework.test import APIClient

from modules.academics import exam_services
from modules.academics.models import AcademicOperation, AcademicYear, ClassSection, Exam, Grade
from modules.access_control.models import Permission, Role, RolePermission, UserRoleAssignment
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership

pytestmark = [pytest.mark.django_db, pytest.mark.urls("modules.academics.api.urls")]


def setup_admin_exam_scope(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
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
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    api_client.force_authenticate(
        user=admin, token={"client": "admin-web", "membership_id": str(membership.id)}
    )
    return institute, branch, year, section


def draft_payload(branch, year, section, request_id="00000000-0000-0000-0000-000000000001"):
    return {
        "requestId": request_id,
        "campusId": str(branch.id),
        "academicYearId": str(year.id),
        "category": "CLASS_TEST",
        "name": "Algebra check",
        "classSectionIds": [str(section.id)],
    }


def test_exam_draft_create_replay_and_revision_edit(api_client):
    institute, branch, year, section = setup_admin_exam_scope(api_client)
    payload = draft_payload(branch, year, section)

    created = api_client.post("/exams", payload, format="json")
    assert created.status_code == 201
    assert created.json()["data"]["revision"] == 1
    exam_id = created.json()["data"]["id"]
    assert Exam.objects.filter(
        institute=institute, id=exam_id, targets__class_section=section
    ).exists()

    replay = api_client.post("/exams", payload, format="json")
    assert replay.status_code == 200
    assert replay.json()["data"] == {
        "requestId": payload["requestId"],
        "examId": exam_id,
        "savedRevision": 1,
    }
    changed_payload = {**payload, "name": "Different title"}
    conflict = api_client.post("/exams", changed_payload, format="json")
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "request_key_conflict"

    updated = api_client.patch(
        f"/exams/{exam_id}", {"expectedRevision": 1, "name": "Updated title"}, format="json"
    )
    assert updated.status_code == 200
    assert updated.json()["data"]["revision"] == 2
    assert updated.json()["data"]["name"] == "Updated title"
    assert list(Exam.objects.get(id=exam_id).changes.values_list("revision", flat=True)) == [1, 2]

    replay_after_edit = api_client.post("/exams", payload, format="json")
    assert replay_after_edit.status_code == 200
    assert replay_after_edit.json()["data"] == {
        "requestId": payload["requestId"],
        "examId": exam_id,
        "savedRevision": 1,
    }

    stale = api_client.patch(
        f"/exams/{exam_id}", {"expectedRevision": 1, "name": "Lost update"}, format="json"
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "revision_conflict"

    Exam.objects.get(id=exam_id).delete()
    unavailable_replay = api_client.post("/exams", payload, format="json")
    assert unavailable_replay.status_code == 409
    assert unavailable_replay.json()["error"]["code"] == "request_target_unavailable"

    second_section = ClassSection.objects.create(
        branch=branch, grade=section.grade, academic_year=year, section_name="B"
    )
    multi_class_test = api_client.post(
        "/exams",
        {
            **draft_payload(branch, year, section, "00000000-0000-0000-0000-000000000003"),
            "classSectionIds": [str(section.id), str(second_section.id)],
        },
        format="json",
    )
    assert multi_class_test.status_code == 201
    multi_section_exam_id = multi_class_test.json()["data"]["id"]
    assert Exam.objects.get(id=multi_section_exam_id).targets.count() == 2

    another_grade = Grade.objects.create(institute=institute, name="Class 9")
    another_grade_section = ClassSection.objects.create(
        branch=branch, grade=another_grade, academic_year=year, section_name="A"
    )
    cross_grade_test = api_client.post(
        "/exams",
        {
            **draft_payload(branch, year, section, "00000000-0000-0000-0000-000000000004"),
            "classSectionIds": [str(section.id), str(another_grade_section.id)],
        },
        format="json",
    )
    assert cross_grade_test.status_code == 400
    assert "same grade" in cross_grade_test.json()["error"]["fieldErrors"]["classSectionIds"][0]


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="SQLite cannot prove PostgreSQL row locking or unique-key race behavior.",
)
def test_simultaneous_identical_create_requests_replay_one_receipt(api_client):
    institute, branch, year, section = setup_admin_exam_scope(api_client)
    membership = InstituteMembership.objects.get(institute=institute)
    actor_id = membership.user_id
    membership_id = membership.id
    payload = draft_payload(branch, year, section)
    barrier = Barrier(2)

    def create_from_separate_connection():
        close_old_connections()
        try:
            actor = User.objects.get(id=actor_id)
            client = APIClient()
            client.force_authenticate(
                user=actor,
                token={"client": "admin-web", "membership_id": str(membership_id)},
            )
            barrier.wait(timeout=10)
            response = client.post("/exams", payload, format="json")
            return response.status_code, response.json()["data"]
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _index: create_from_separate_connection(), range(2)))

    assert sorted(status for status, _data in results) == [200, 201]
    exam_ids = {data.get("examId", data.get("id")) for _status, data in results}
    assert len(exam_ids) == 1
    assert {data["savedRevision"] for _status, data in results if "savedRevision" in data} == {1}
    assert Exam.objects.filter(institute=institute).count() == 1
    assert Exam.objects.get(institute=institute).changes.count() == 1


@pytest.mark.django_db(transaction=True)
@pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="SQLite does not implement SELECT FOR UPDATE row locking.",
)
def test_simultaneous_stale_updates_commit_only_one_revision(api_client):
    institute, branch, year, section = setup_admin_exam_scope(api_client)
    membership = InstituteMembership.objects.get(institute=institute)
    actor_id = membership.user_id
    membership_id = membership.id
    created = api_client.post("/exams", draft_payload(branch, year, section), format="json")
    exam_id = created.json()["data"]["id"]
    barrier = Barrier(2)

    def update_from_separate_connection(name):
        close_old_connections()
        try:
            actor = User.objects.get(id=actor_id)
            client = APIClient()
            client.force_authenticate(
                user=actor,
                token={"client": "admin-web", "membership_id": str(membership_id)},
            )
            barrier.wait(timeout=10)
            response = client.patch(
                f"/exams/{exam_id}",
                {"expectedRevision": 1, "name": name},
                format="json",
            )
            return response.status_code, response.json()
        finally:
            close_old_connections()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(
            pool.map(
                update_from_separate_connection,
                ("Concurrent edit A", "Concurrent edit B"),
            )
        )

    assert sorted(status for status, _body in results) == [200, 409]
    conflicts = sum(
        body.get("error", {}).get("code") == "revision_conflict"
        for _status, body in results
    )
    assert conflicts == 1
    exam = Exam.objects.get(id=exam_id)
    assert exam.revision == 2
    assert list(exam.changes.values_list("revision", flat=True)) == [1, 2]


def test_generic_exam_operation_is_hidden_and_not_writable(api_client):
    institute, branch, year, section = setup_admin_exam_scope(api_client)
    legacy = AcademicOperation.objects.create(
        institute=institute, kind=AcademicOperation.Kind.EXAM, title="Old event", branch=branch
    )
    created = api_client.post(
        "/operations", {"kind": "EXAM", "title": "Another old event"}, format="json"
    )
    assert created.status_code == 405
    listed = api_client.get("/operations")
    assert listed.status_code == 200
    assert legacy.id not in {item["id"] for item in listed.json()["data"]["items"]}
    assert (
        api_client.patch(
            f"/operations/{legacy.id}", {"title": "Changed"}, format="json"
        ).status_code
        == 405
    )
    assert api_client.delete(f"/operations/{legacy.id}").status_code == 405


def test_exam_publish_captures_immutable_setup_snapshot_and_checks_revision(api_client):
    _, branch, year, section = setup_admin_exam_scope(api_client)
    created = api_client.post("/exams", draft_payload(branch, year, section), format="json")
    exam_id = created.json()["data"]["id"]
    published = api_client.post(
        f"/exams/{exam_id}/publish", {"expectedRevision": 1}, format="json"
    )
    assert published.status_code == 200
    data = published.json()["data"]
    assert data["status"] == "PUBLISHED"
    assert data["revision"] == 2
    assert data["actions"]["edit"] is False
    assert data["actions"]["publish"] is False
    assert data["publicationSnapshot"]["snapshot"]["kind"] == "EXAM_SETUP_NOTICE"
    assert data["publicationSnapshot"]["snapshot"]["classSections"][0]["id"] == str(section.id)
    assert api_client.post(
        f"/exams/{exam_id}/publish", {"expectedRevision": 1}, format="json"
    ).status_code == 409
    assert api_client.patch(
        f"/exams/{exam_id}", {"expectedRevision": 2, "name": "Changed"}, format="json"
    ).status_code == 400


def test_scoped_custom_role_can_publish_only_covered_exam(api_client):
    institute, branch, year, section_a = setup_admin_exam_scope(api_client)
    section_b = ClassSection.objects.create(
        branch=branch, grade=section_a.grade, academic_year=year, section_name="B"
    )
    in_scope = api_client.post("/exams", draft_payload(branch, year, section_a), format="json")
    out_scope = api_client.post(
        "/exams",
        draft_payload(branch, year, section_b, "00000000-0000-0000-0000-000000000002"),
        format="json",
    )
    teacher = User.objects.create_user(
        email="exam-controller@northstar.test", password="StrongPass123!"
    )
    membership = InstituteMembership.objects.create(
        user=teacher, institute=institute, branch=branch, role=InstituteMembership.Role.TEACHER
    )
    role = Role.objects.create(institute=institute, branch=branch, name="Scoped Publisher")
    selected_scope = {
        "schemaVersion": 1,
        "examScope": "selected",
        "classSectionIds": [str(section_a.id)],
    }
    for key in ("assessment.create", "assessment.view", "assessment.publish"):
        permission, _ = Permission.objects.update_or_create(
            permission_key=key,
            defaults={"module": "academics", "description": key, "is_active": True},
        )
        RolePermission.objects.create(
            role=role, permission=permission, configuration=selected_scope
        )
    UserRoleAssignment.objects.create(user=teacher, role=role, institute=institute, branch=branch)
    api_client.force_authenticate(
        user=teacher, token={"client": "admin-web", "membership_id": str(membership.id)}
    )

    allowed = api_client.post(
        f"/exams/{in_scope.json()['data']['id']}/publish", {"expectedRevision": 1}, format="json"
    )
    denied = api_client.post(
        f"/exams/{out_scope.json()['data']['id']}/publish", {"expectedRevision": 1}, format="json"
    )
    assert allowed.status_code == 200
    assert allowed.json()["data"]["status"] == "PUBLISHED"
    assert allowed.json()["data"]["actions"]["edit"] is False
    assert denied.status_code == 403


def test_exam_rejects_ineligible_coordinator_with_field_error(api_client):
    institute, branch, year, section = setup_admin_exam_scope(api_client)
    inactive = User.objects.create_user(
        email="inactive@northstar.test", password="StrongPass123!", is_active=False
    )
    payload = {
        **draft_payload(branch, year, section),
        "coordinatorId": str(inactive.id),
    }
    response = api_client.post("/exams", payload, format="json")
    assert response.status_code == 400
    assert "coordinatorId" in response.json()["error"]["fieldErrors"]
    assert "active institute member" in response.json()["error"]["fieldErrors"]["coordinatorId"][0]


def test_exam_options_only_return_scoped_shape_and_section_identity_is_protected(api_client):
    institute, branch, year, section = setup_admin_exam_scope(api_client)
    options = api_client.get("/exams/options")
    assert options.status_code == 200
    data = options.json()["data"]
    assert {"campuses", "academicYears", "categories", "actions"} <= set(data)
    assert data["campuses"] == [{"id": str(branch.id), "name": "Main"}]
    assert data["actions"] == {"create": True, "view": True, "edit": True, "publish": True}
    assert data["currentAcademicYearId"] == str(year.id)

    section_options = api_client.get(
        f"/exams/options?kind=sections&campusId={branch.id}&academicYearId={year.id}"
    )
    assert section_options.status_code == 200
    assert section_options.json()["data"]["items"][0]["id"] == str(section.id)
    assert "sectionName" in section_options.json()["data"]["items"][0]

    terms = api_client.get(
        f"/exams/options?kind=terms&campusId={branch.id}&academicYearId={year.id}"
    )
    assert terms.status_code == 200
    assert "items" in terms.json()["data"]
    coordinators = api_client.get(f"/exams/options?kind=coordinators&campusId={branch.id}")
    assert coordinators.status_code == 200
    assert "items" in coordinators.json()["data"]

    created = api_client.post("/exams", draft_payload(branch, year, section), format="json")
    assert created.status_code == 201
    listed = api_client.get("/exams")
    assert listed.status_code == 200
    assert listed.json()["data"]["results"][0]["targetSummary"] == ["Class 8 A"]
    changed = api_client.patch(f"/sections/{section.id}", {"sectionName": "B"}, format="json")
    assert changed.status_code == 200
    another_grade = Grade.objects.create(institute=institute, name="Class 9")
    moved = api_client.patch(
        f"/sections/{section.id}", {"gradeId": str(another_grade.id)}, format="json"
    )
    assert moved.status_code == 400
    assert "exam" in moved.json()["error"]["fieldErrors"]["classSection"][0].lower()


def test_duplicate_replay_rechecks_source_view_scope(api_client, monkeypatch):
    _, branch, year, section = setup_admin_exam_scope(api_client)
    source = api_client.post("/exams", draft_payload(branch, year, section), format="json")
    source_id = source.json()["data"]["id"]
    duplicate = {
        "requestId": "00000000-0000-0000-0000-000000000002",
        "campusId": str(branch.id),
        "academicYearId": str(year.id),
        "classSectionIds": [str(section.id)],
        "name": "Algebra check copy",
    }
    created = api_client.post(f"/exams/{source_id}/duplicate", duplicate, format="json")
    assert created.status_code == 201

    monkeypatch.setattr(exam_services, "scope_covers", lambda *args, **kwargs: False)
    denied = api_client.post(f"/exams/{source_id}/duplicate", duplicate, format="json")
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "permission_required"
