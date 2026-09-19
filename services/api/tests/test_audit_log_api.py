import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.finance.models import FinanceRecord
from platform_core.models import AuditEvent

pytestmark = pytest.mark.django_db


def make_institute(code: str, email: str, role: str = InstituteMembership.Role.INSTITUTE_ADMIN):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="MAIN", is_head_office=True
    )
    user = User.objects.create_user(email=email, password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        user=user,
        institute=institute,
        branch=branch if role == InstituteMembership.Role.BRANCH_ADMIN else None,
        role=role,
    )
    return institute, branch, user, membership


def authenticate(api_client, user, membership):
    api_client.force_authenticate(
        user=user, token={"client": "admin-web", "membership_id": str(membership.id)}
    )


def test_audit_log_is_tenant_scoped_and_records_admin_api_actions(api_client):
    institute, branch, admin, membership = make_institute("NORTH", "admin@north.test")
    other, other_branch, other_admin, _ = make_institute("SOUTH", "admin@south.test")
    AuditEvent.objects.create(
        institute=other,
        branch=other_branch,
        actor=other_admin,
        event_type="SECRET",
        message="Must not leak",
    )
    authenticate(api_client, admin, membership)

    institute_response = api_client.post(
        "/api/v1/admin/finance/records",
        {
            "branchId": str(branch.id),
            "kind": "EXPENSE",
            "title": "Power bill",
            "amount": "100.00",
            "entryDate": "2026-08-05",
        },
        format="json",
    )
    assert institute_response.status_code == 201
    assert AuditEvent.objects.filter(institute=institute, event_type="API_POST").exists()

    response = api_client.get("/api/v1/admin/audit-log?page=1&pageSize=100")

    assert response.status_code == 200
    events = response.json()["data"]["items"]
    assert any(event["event_type"] == "AUDIT_LOG_VIEWED" for event in events)
    assert all(event["message"] != "Must not leak" for event in events)
    assert all(
        event["branch"] in (None, {"id": str(branch.id), "name": "Main Campus"})
        for event in events
    )


def test_only_institute_admin_can_read_audit_log(api_client):
    institute, _, branch_admin, membership = make_institute(
        "BRANCH", "branch@branch.test", InstituteMembership.Role.BRANCH_ADMIN
    )
    authenticate(api_client, branch_admin, membership)

    response = api_client.get("/api/v1/admin/audit-log")

    assert response.status_code == 403
    assert not AuditEvent.objects.filter(
        institute=institute, event_type="AUDIT_LOG_VIEWED"
    ).exists()


def test_finance_record_detail_is_tenant_scoped_and_mutable(api_client):
    institute, branch, admin, membership = make_institute("NORTH", "admin@north.test")
    other, other_branch, _, _ = make_institute("SOUTH", "admin@south.test")
    record = FinanceRecord.objects.create(
        institute=institute,
        branch=branch,
        kind=FinanceRecord.Kind.EXPENSE,
        title="Power bill",
        category="Utilities",
        amount="100.00",
        entry_date="2026-08-05",
    )
    foreign = FinanceRecord.objects.create(
        institute=other,
        branch=other_branch,
        kind=FinanceRecord.Kind.EXPENSE,
        title="Foreign bill",
        amount="50.00",
        entry_date="2026-08-05",
    )
    authenticate(api_client, admin, membership)

    updated = api_client.patch(
        f"/api/v1/admin/finance/records/{record.id}",
        {"title": "Updated power bill", "amount": "125.00", "status": "Approved"},
        format="json",
    )
    foreign_read = api_client.get(f"/api/v1/admin/finance/records/{foreign.id}")
    deleted = api_client.delete(f"/api/v1/admin/finance/records/{record.id}")

    assert updated.status_code == 200
    assert updated.json()["data"]["title"] == "Updated power bill"
    assert updated.json()["data"]["amount"] == "125.00"
    assert foreign_read.status_code == 404
    assert deleted.status_code == 204
    assert not FinanceRecord.objects.filter(id=record.id).exists()
