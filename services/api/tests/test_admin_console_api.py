import pytest
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import connection

from modules.admin_console.models import AdminRecord
from modules.admin_console.registry import SCREEN_IDS
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership

pytestmark = pytest.mark.django_db


@pytest.fixture(scope="session", autouse=True)
def admin_record_table(django_db_setup, django_db_blocker):
    """Let these isolated tests run before the app is wired into INSTALLED_APPS.

    Once integration is complete, migrations create the table and this fixture is a
    no-op. This keeps the module testable without changing shared settings owned by
    another integration surface.
    """

    with django_db_blocker.unblock():
        existing = connection.introspection.table_names()
        created = AdminRecord._meta.db_table not in existing
        if created:
            with connection.schema_editor() as schema_editor:
                schema_editor.create_model(AdminRecord)
    yield
    if created:
        with django_db_blocker.unblock(), connection.schema_editor() as schema_editor:
            schema_editor.delete_model(AdminRecord)


@pytest.fixture(autouse=True)
def admin_console_urls(settings):
    settings.ROOT_URLCONF = "modules.admin_console.urls"


def make_tenant(code, email):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    main = Branch.objects.create(
        institute=institute,
        name="Main Campus",
        code="MAIN",
        is_head_office=True,
    )
    annex = Branch.objects.create(institute=institute, name="Annex", code="ANNEX")
    admin = User.objects.create_user(email=email, password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=admin,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    return institute, main, annex, admin, membership


def authenticate(api_client, admin, membership):
    api_client.force_authenticate(
        user=admin,
        token={"client": "admin-web", "membership_id": str(membership.id)},
    )


def create_record(institute, branch, title, *, status="ACTIVE", screen_id="CM2"):
    return AdminRecord.objects.create(
        institute=institute,
        branch=branch,
        screen_id=screen_id,
        record_type="role",
        title=title,
        status=status,
        data={"permissions": ["students.read"]},
    )


def test_catalog_contains_every_non_auth_screen_with_ui_metadata(api_client):
    institute, main, annex, admin, membership = make_tenant("NORTH", "admin@north.test")
    authenticate(api_client, admin, membership)

    response = api_client.get("/screens")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["count"] == len(SCREEN_IDS) == 54
    assert {item["id"] for item in data["items"]} == set(SCREEN_IDS)
    assert {"A1", "A2"}.isdisjoint(item["id"] for item in data["items"])
    role_screen = next(item for item in data["items"] if item["id"] == "RP1")
    assert role_screen == {
        "id": "RP1",
        "title": "Roles List",
        "section": "Roles & Permissions",
        "path": "/roles",
        "breadcrumb": "Roles & Permissions / Roles List",
        "icon": "roles",
        "dataSource": "accessControl",
        "supportsRecords": False,
        "description": "",
        "readOnly": False,
    }


def test_read_only_screens_allow_lists_but_reject_writes(api_client):
    institute, branch, _, admin, membership = make_tenant("READONLY", "admin@readonly.test")
    authenticate(api_client, admin, membership)

    listed = api_client.get("/screens/AL1")
    created = api_client.post(
        "/screens/AL1/records",
        {"title": "Forged event", "recordType": "audit", "status": "ACTIVE", "data": {}},
        format="json",
    )

    assert listed.status_code == 200
    assert listed.json()["data"]["screen"]["readOnly"] is True
    assert created.status_code == 405


def test_screen_records_are_tenant_isolated_and_branch_filter_is_exact(api_client):
    institute, main, annex, admin, membership = make_tenant("NORTH", "admin@north.test")
    other, other_main, other_annex, other_admin, other_membership = make_tenant(
        "SOUTH", "admin@south.test"
    )
    institute_wide = create_record(institute, None, "Institute role")
    main_record = create_record(institute, main, "Main role")
    annex_record = create_record(institute, annex, "Annex role")
    create_record(other, other_main, "Foreign role")
    authenticate(api_client, admin, membership)

    all_records = api_client.get("/screens/CM2")
    main_records = api_client.get(f"/screens/CM2?branchId={main.id}")
    foreign_branch = api_client.get(f"/screens/CM2?branchId={other_main.id}")

    assert all_records.status_code == 200
    assert {item["id"] for item in all_records.json()["data"]["records"]["items"]} == {
        str(institute_wide.id),
        str(main_record.id),
        str(annex_record.id),
    }
    assert [item["id"] for item in main_records.json()["data"]["records"]["items"]] == [
        str(main_record.id)
    ]
    assert foreign_branch.status_code == 404


def test_screen_detail_paginates_searches_filters_and_orders(api_client):
    institute, main, annex, admin, membership = make_tenant("NORTH", "admin@north.test")
    for title, record_status in (
        ("Alpha policy", "DRAFT"),
        ("Beta policy", "ACTIVE"),
        ("Gamma role", "ACTIVE"),
        ("Delta policy", "ACTIVE"),
        ("Epsilon policy", "ARCHIVED"),
    ):
        create_record(institute, main, title, status=record_status)
    authenticate(api_client, admin, membership)

    response = api_client.get(
        "/screens/CM2?page=2&pageSize=1&search=policy&status=ACTIVE&order=title"
    )

    assert response.status_code == 200
    records = response.json()["data"]["records"]
    assert records["count"] == 2
    assert records["page"] == 2
    assert records["totalPages"] == 2
    assert [item["title"] for item in records["items"]] == ["Delta policy"]

    first_page = api_client.get(
        "/screens/CM2?page=1&pageSize=1&search=policy&status=ACTIVE&order=title"
    )
    first_records = first_page.json()["data"]["records"]
    assert first_records["count"] == 2
    assert first_records["totalPages"] == 2
    assert [item["title"] for item in first_records["items"]] == ["Beta policy"]

    invalid = api_client.get("/screens/CM2?pageSize=101&order=not-a-field")
    assert invalid.status_code == 400
    assert set(invalid.json()["error"]["fieldErrors"]) == {"pageSize", "order"}


def test_record_create_validates_payload_and_branch_tenant(api_client):
    institute, main, annex, admin, membership = make_tenant("NORTH", "admin@north.test")
    other, other_main, other_annex, other_admin, other_membership = make_tenant(
        "SOUTH", "admin@south.test"
    )
    authenticate(api_client, admin, membership)

    created = api_client.post(
        "/screens/CM2/records",
        {
            "recordType": "custom-role",
            "title": "Admissions reviewer",
            "status": "ACTIVE",
            "data": {"permissions": ["admissions.read"]},
            "branchId": str(main.id),
        },
        format="json",
    )
    invalid_data = api_client.post(
        "/screens/CM2/records",
        {
            "recordType": "role",
            "title": "Invalid",
            "status": "ACTIVE",
            "data": ["must", "be", "an", "object"],
            "unexpected": True,
        },
        format="json",
    )
    foreign_branch = api_client.post(
        "/screens/CM2/records",
        {
            "recordType": "role",
            "title": "Foreign",
            "status": "ACTIVE",
            "branchId": str(other_main.id),
        },
        format="json",
    )

    assert created.status_code == 201
    item = created.json()["data"]
    assert item["screenId"] == "CM2"
    assert item["recordType"] == "custom-role"
    assert item["branchId"] == str(main.id)
    assert item["createdBy"]["id"] == str(admin.id)
    assert item["version"] == 1
    assert invalid_data.status_code == 400
    assert "unexpected" in invalid_data.json()["error"]["fieldErrors"]
    assert foreign_branch.status_code == 404


def test_invalid_and_dedicated_screens_are_rejected(api_client):
    institute, main, annex, admin, membership = make_tenant("NORTH", "admin@north.test")
    authenticate(api_client, admin, membership)

    unknown = api_client.get("/screens/ZZ9")
    dedicated = api_client.get("/screens/H1")

    assert unknown.status_code == 404
    assert dedicated.status_code == 409
    assert dedicated.json()["error"]["code"] == "DEDICATED_SCREEN"

    invalid_model = AdminRecord(
        institute=institute,
        screen_id="ZZ9",
        record_type="role",
        title="Invalid",
        status="ACTIVE",
        data=[],
    )
    with pytest.raises(DjangoValidationError) as error:
        invalid_model.full_clean()
    assert {"screen_id", "data"}.issubset(error.value.message_dict)


def test_patch_and_delete_enforce_tenant_screen_and_optimistic_version(api_client):
    institute, main, annex, admin, membership = make_tenant("NORTH", "admin@north.test")
    other, other_main, other_annex, other_admin, other_membership = make_tenant(
        "SOUTH", "admin@south.test"
    )
    record = create_record(institute, main, "Original")
    foreign = create_record(other, other_main, "Foreign")
    authenticate(api_client, admin, membership)

    updated = api_client.patch(
        f"/screens/CM2/records/{record.id}",
        {"title": "Updated", "version": 1},
        format="json",
    )
    stale_patch = api_client.patch(
        f"/screens/CM2/records/{record.id}",
        {"title": "Lost update", "version": 1},
        format="json",
    )
    wrong_screen = api_client.patch(
        f"/screens/CM1/records/{record.id}",
        {"title": "Wrong screen", "version": 2},
        format="json",
    )
    foreign_tenant = api_client.patch(
        f"/screens/CM2/records/{foreign.id}",
        {"title": "Leaked", "version": 1},
        format="json",
    )
    stale_delete = api_client.delete(
        f"/screens/CM2/records/{record.id}", {"version": 1}, format="json"
    )
    deleted = api_client.delete(f"/screens/CM2/records/{record.id}", {"version": 2}, format="json")

    assert updated.status_code == 200
    assert updated.json()["data"]["title"] == "Updated"
    assert updated.json()["data"]["version"] == 2
    assert stale_patch.status_code == 409
    assert stale_patch.json()["error"]["code"] == "VERSION_CONFLICT"
    assert wrong_screen.status_code == 404
    assert foreign_tenant.status_code == 404
    assert stale_delete.status_code == 409
    assert deleted.status_code == 204
    record.refresh_from_db()
    assert record.is_active is False
    assert record.version == 3


def test_staff_timetable_returns_combined_and_legacy_class_ids(api_client):
    from modules.people.models import StaffProfile

    institute, main, annex, admin, membership = make_tenant("NORTH", "admin@north.test")
    teacher = User.objects.create_user(email="teacher@north.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=teacher,
        institute=institute,
        branch=main,
        role=InstituteMembership.Role.TEACHER,
    )
    profile = StaffProfile.objects.create(institute=institute, user=teacher)
    bundle = {
        "config": {
            "workingDays": ["MON", "TUE"],
            "periods": [
                {"number": 1, "type": "teaching", "start": "08:00", "end": "08:40"},
                {"number": 2, "type": "teaching", "start": "08:40", "end": "09:20"},
            ],
        },
        "classes": [
            {"id": "c8a", "name": "Class 8 A"},
            {"id": "c8b", "name": "Class 8 B"},
        ],
        "subjects": [{"id": "s_fr", "name": "French"}],
        "rooms": [],
        "lastResult": {
            "entries": [
                {
                    "teacherId": str(teacher.id),
                    "day": "MON",
                    "period": 1,
                    "subjectId": "s_fr",
                    "classIds": ["c8a", "c8b"],
                    "classId": "c8a",
                },
                # Legacy entry from a bundle saved before combined lessons existed
                {
                    "teacherId": str(teacher.id),
                    "day": "TUE",
                    "period": 2,
                    "subjectId": "s_fr",
                    "classId": "c8b",
                },
            ]
        },
    }
    AdminRecord.objects.create(
        institute=institute,
        branch=main,
        screen_id="TT1",
        record_type="timetable",
        title="Published timetable",
        status="PUBLISHED",
        data={"bundle": bundle},
    )
    authenticate(api_client, admin, membership)

    response = api_client.get(f"/staff/{profile.id}/timetable")

    assert response.status_code == 200
    slots = response.json()["data"]["slots"]
    assert len(slots) == 2
    combined, legacy = slots
    assert combined["classIds"] == ["c8a", "c8b"]
    assert combined["classId"] == "c8a"
    assert combined["className"] == "Class 8 A / Class 8 B"
    assert legacy["classIds"] == ["c8b"]
    assert legacy["classId"] == "c8b"
    assert legacy["className"] == "Class 8 B"
