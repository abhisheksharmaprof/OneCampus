from datetime import date, timedelta
from decimal import Decimal

import pytest

from modules.finance.models import FeeInvoice, FeePayment
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student
from platform_core.models import AuditEvent


def make_admin(api_client, *, code="NSA"):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code=f"{code}-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email=f"admin@{code.lower()}.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    return institute, branch, login.json()["data"]["accessToken"]


def make_student(institute, branch, admission="NSA-0001", first_name="Diya"):
    return Student.objects.create(
        institute=institute, branch=branch, admission_number=admission, first_name=first_name
    )


INVOICE_BODY = {
    "issueDate": str(date.today()),
    "dueDate": str(date.today() + timedelta(days=15)),
    "lineItems": [
        {"description": "Tuition fee", "period": "Term 1", "qty": 1, "amount": "5000.00"},
        {"description": "Lab fee", "qty": 2, "amount": "250.00"},
    ],
    "discountAmount": "500.00",
    "taxAmount": "100.00",
    "notes": "Pay at the office counter.",
}


@pytest.mark.django_db
def test_create_invoice_generates_number_and_computes_totals(api_client):
    institute, branch, token = make_admin(api_client)
    student = make_student(institute, branch)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id)},
        format="json",
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["invoiceNumber"].startswith("INV-")
    assert data["subtotal"] == "5500.00"
    assert data["total"] == "5100.00"
    assert data["status"] == "ISSUED"
    assert data["studentName"] == "Diya"
    invoice = FeeInvoice.objects.get(id=data["id"])
    assert invoice.amount == Decimal("5100.00")  # legacy column stays in sync
    assert AuditEvent.objects.filter(
        institute=institute, target_type="fee_invoice", target_id=invoice.id
    ).exists()


@pytest.mark.django_db
def test_create_invoice_rejects_tampered_or_invalid_input(api_client):
    institute, branch, token = make_admin(api_client)
    student = make_student(institute, branch)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    no_items = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id), "lineItems": []},
        format="json",
    )
    negative = api_client.post(
        "/api/v1/admin/fees/invoices",
        {
            **INVOICE_BODY,
            "studentId": str(student.id),
            "lineItems": [{"description": "Tuition", "amount": "-10.00"}],
        },
        format="json",
    )
    discount_too_big = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id), "discountAmount": "99999.00"},
        format="json",
    )
    due_before_issue = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id), "dueDate": "2000-01-01"},
        format="json",
    )

    assert no_items.status_code == 400
    assert negative.status_code == 400
    assert discount_too_big.status_code == 400
    assert discount_too_big.json()["error"]["fieldErrors"]["discountAmount"]
    assert due_before_issue.status_code == 400


@pytest.mark.django_db
def test_invoice_list_filters_and_tenant_isolation(api_client):
    institute, branch, token = make_admin(api_client)
    other_institute, other_branch, _ = make_admin(api_client, code="OTHER")
    student = make_student(institute, branch)
    foreign_student = make_student(other_institute, other_branch, admission="OTH-0001", first_name="Zara")
    mine = FeeInvoice.objects.create(
        institute=institute, branch=branch, student=student,
        amount=Decimal("100.00"), total=Decimal("100.00"), status="ISSUED",
        due_date=date.today() - timedelta(days=5),
    )
    FeeInvoice.objects.create(
        institute=institute, branch=branch, student=student,
        amount=Decimal("50.00"), total=Decimal("50.00"), status="PAID",
        due_date=date.today(),
    )
    foreign = FeeInvoice.objects.create(
        institute=other_institute, branch=other_branch, student=foreign_student,
        amount=Decimal("77.00"), total=Decimal("77.00"), due_date=date.today(),
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    everything = api_client.get("/api/v1/admin/fees/invoices")
    issued_only = api_client.get("/api/v1/admin/fees/invoices?status=ISSUED")
    foreign_detail = api_client.get(f"/api/v1/admin/fees/invoices/{foreign.id}")

    ids = [row["id"] for row in everything.json()["data"]["items"]]
    assert str(foreign.id) not in ids
    assert len(ids) == 2
    assert [row["id"] for row in issued_only.json()["data"]["items"]] == [str(mine.id)]
    assert foreign_detail.status_code == 404


@pytest.mark.django_db
def test_patch_edits_drafts_only_and_cancel_blocked_with_payments(api_client):
    institute, branch, token = make_admin(api_client)
    student = make_student(institute, branch)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    draft = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id), "status": "DRAFT"},
        format="json",
    ).json()["data"]
    issued = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id)},
        format="json",
    ).json()["data"]

    edit_draft = api_client.patch(
        f"/api/v1/admin/fees/invoices/{draft['id']}",
        {"lineItems": [{"description": "Tuition", "qty": 1, "amount": "900.00"}],
         "discountAmount": "0.00", "taxAmount": "0.00"},
        format="json",
    )
    issue_draft = api_client.patch(
        f"/api/v1/admin/fees/invoices/{draft['id']}", {"status": "ISSUED"}, format="json"
    )
    edit_issued = api_client.patch(
        f"/api/v1/admin/fees/invoices/{issued['id']}", {"notes": "changed"}, format="json"
    )
    invoice = FeeInvoice.objects.get(id=issued["id"])
    FeePayment.objects.create(institute=institute, invoice=invoice, amount=Decimal("10.00"), receipt_number="RCP-X-1")
    cancel_paid = api_client.patch(
        f"/api/v1/admin/fees/invoices/{issued['id']}", {"status": "CANCELLED"}, format="json"
    )

    assert edit_draft.status_code == 200
    assert edit_draft.json()["data"]["total"] == "900.00"
    assert issue_draft.status_code == 200
    assert issue_draft.json()["data"]["status"] == "ISSUED"
    assert edit_issued.status_code == 400
    assert cancel_paid.status_code == 400
    assert cancel_paid.json()["error"]["fieldErrors"]["status"] == [
        "Cannot cancel an invoice that has payments."
    ]


@pytest.mark.django_db
def test_cancel_without_payments_succeeds(api_client):
    institute, branch, token = make_admin(api_client)
    student = make_student(institute, branch)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    created = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id)},
        format="json",
    ).json()["data"]

    cancelled = api_client.patch(
        f"/api/v1/admin/fees/invoices/{created['id']}", {"status": "CANCELLED"}, format="json"
    )

    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["status"] == "CANCELLED"
