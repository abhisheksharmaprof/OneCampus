from datetime import date, timedelta
from decimal import Decimal

import pytest

from modules.finance.models import FeeInvoice, FeePayment
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student


@pytest.fixture
def context(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="NSA-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@nsa.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    diya = Student.objects.create(
        institute=institute, branch=branch, admission_number="NSA-0001", first_name="Diya"
    )
    arjun = Student.objects.create(
        institute=institute, branch=branch, admission_number="NSA-0002", first_name="Arjun"
    )
    overdue = FeeInvoice.objects.create(
        institute=institute, branch=branch, student=diya,
        amount=Decimal("100.00"), total=Decimal("100.00"), status="PARTIALLY_PAID",
        issue_date=date.today() - timedelta(days=40),
        due_date=date.today() - timedelta(days=10),
    )
    FeeInvoice.objects.create(
        institute=institute, branch=branch, student=arjun,
        amount=Decimal("200.00"), total=Decimal("200.00"), status="ISSUED",
        issue_date=date.today(), due_date=date.today() + timedelta(days=20),
    )
    FeeInvoice.objects.create(  # cancelled — must be excluded everywhere
        institute=institute, branch=branch, student=arjun,
        amount=Decimal("999.00"), total=Decimal("999.00"), status="CANCELLED",
        due_date=date.today(),
    )
    FeePayment.objects.create(
        institute=institute, invoice=overdue, amount=Decimal("30.00"),
        receipt_number="RCP-2026-0001",
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")
    return {"institute": institute, "diya": diya, "arjun": arjun}


@pytest.mark.django_db
def test_summary_returns_real_aggregates(api_client, context):
    response = api_client.get("/api/v1/admin/fees/summary")

    data = response.json()["data"]
    assert data["collectedThisMonth"] == "30.00"
    assert data["outstandingTotal"] == "270.00"  # (100 - 30) + 200
    assert data["overdueCount"] == 1
    assert data["receiptsToday"] == 1
    assert len(data["monthlySeries"]) == 12
    assert data["monthlySeries"][-1]["collected"] == "30.00"


@pytest.mark.django_db
def test_dues_lists_outstanding_per_student(api_client, context):
    response = api_client.get("/api/v1/admin/fees/dues")
    filtered = api_client.get("/api/v1/admin/fees/dues?minDaysOverdue=5")

    rows = {row["studentName"]: row for row in response.json()["data"]["items"]}
    assert rows["Diya"]["billed"] == "100.00"
    assert rows["Diya"]["paid"] == "30.00"
    assert rows["Diya"]["outstanding"] == "70.00"
    assert rows["Diya"]["daysOverdue"] == 10
    assert rows["Arjun"]["outstanding"] == "200.00"
    assert rows["Arjun"]["daysOverdue"] == 0
    filtered_names = [row["studentName"] for row in filtered.json()["data"]["items"]]
    assert filtered_names == ["Diya"]


@pytest.mark.django_db
def test_insights_are_tenant_scoped(api_client, context):
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    other_branch = Branch.objects.create(
        institute=other, name="Other Campus", code="OTHER-MAIN", is_head_office=True
    )
    stranger = Student.objects.create(
        institute=other, branch=other_branch, admission_number="OTH-0001", first_name="Zara"
    )
    FeeInvoice.objects.create(
        institute=other, branch=other_branch, student=stranger,
        amount=Decimal("5000.00"), total=Decimal("5000.00"), status="ISSUED",
        due_date=date.today(),
    )

    summary = api_client.get("/api/v1/admin/fees/summary")
    dues = api_client.get("/api/v1/admin/fees/dues")

    assert summary.json()["data"]["outstandingTotal"] == "270.00"
    names = [row["studentName"] for row in dues.json()["data"]["items"]]
    assert "Zara" not in names


@pytest.mark.django_db
def test_dues_branch_filter_scopes_payments_and_rejects_bad_params(api_client, context):
    bad_min_days = api_client.get("/api/v1/admin/fees/dues?minDaysOverdue=abc")
    bad_class = api_client.get("/api/v1/admin/fees/dues?classId=not-a-uuid")
    bad_branch_summary = api_client.get("/api/v1/admin/fees/summary?branchId=not-a-uuid")

    assert bad_min_days.status_code == 400
    assert bad_class.status_code == 400
    assert bad_branch_summary.status_code == 400

    institute = context["institute"]
    diya = context["diya"]
    main_branch = Branch.objects.get(institute=institute, is_head_office=True)
    other_branch = Branch.objects.create(
        institute=institute, name="North Campus", code="NSA-NORTH", is_head_office=False
    )
    other_invoice = FeeInvoice.objects.create(
        institute=institute, branch=other_branch, student=diya,
        amount=Decimal("500.00"), total=Decimal("500.00"), status="ISSUED",
        due_date=date.today() + timedelta(days=5),
    )
    FeePayment.objects.create(
        institute=institute, invoice=other_invoice, amount=Decimal("500.00"),
        receipt_number="RCP-2026-0002",
    )

    scoped = api_client.get(f"/api/v1/admin/fees/dues?branchId={main_branch.id}")
    rows = {row["studentName"]: row for row in scoped.json()["data"]["items"]}
    assert rows["Diya"]["paid"] == "30.00"
