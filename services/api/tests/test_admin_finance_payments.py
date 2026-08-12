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


def make_invoice(institute, branch, *, admission="NSA-0001", total="100.00", status="ISSUED"):
    student = Student.objects.create(
        institute=institute, branch=branch, admission_number=admission, first_name="Diya"
    )
    return FeeInvoice.objects.create(
        institute=institute, branch=branch, student=student,
        amount=Decimal(total), total=Decimal(total), status=status,
        issue_date=date.today(), due_date=date.today() + timedelta(days=10),
    )


@pytest.mark.django_db
def test_payment_generates_receipt_number_and_updates_status(api_client):
    institute, branch, token = make_admin(api_client)
    invoice = make_invoice(institute, branch)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    partial = api_client.post(
        "/api/v1/admin/fees/payments",
        {"invoiceId": str(invoice.id), "amount": "40.00", "method": "UPI", "reference": "TXN-1"},
        format="json",
    )
    invoice.refresh_from_db()
    status_after_partial = invoice.status
    final = api_client.post(
        "/api/v1/admin/fees/payments",
        {"invoiceId": str(invoice.id), "amount": "60.00"},
        format="json",
    )

    assert partial.status_code == 201
    data = partial.json()["data"]
    assert data["receiptNumber"].startswith("RCP-")
    assert data["method"] == "UPI"
    assert status_after_partial == "PARTIALLY_PAID"
    assert final.status_code == 201
    assert final.json()["data"]["receiptNumber"] != data["receiptNumber"]
    invoice.refresh_from_db()
    assert invoice.status == "PAID"
    assert AuditEvent.objects.filter(
        institute=institute, target_type="fee_payment", target_id=data["id"]
    ).exists()


@pytest.mark.django_db
def test_payment_rejected_for_draft_and_cancelled_invoices(api_client):
    institute, branch, token = make_admin(api_client)
    draft = make_invoice(institute, branch, status="DRAFT")
    cancelled = make_invoice(institute, branch, admission="NSA-0002", status="CANCELLED")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    draft_response = api_client.post(
        "/api/v1/admin/fees/payments",
        {"invoiceId": str(draft.id), "amount": "10.00"},
        format="json",
    )
    cancelled_response = api_client.post(
        "/api/v1/admin/fees/payments",
        {"invoiceId": str(cancelled.id), "amount": "10.00"},
        format="json",
    )

    assert draft_response.status_code == 400
    assert cancelled_response.status_code == 400
    assert FeePayment.objects.count() == 0


@pytest.mark.django_db
def test_payment_list_filters_and_tenant_isolation(api_client):
    institute, branch, token = make_admin(api_client)
    other_institute, other_branch, _ = make_admin(api_client, code="OTHER")
    invoice = make_invoice(institute, branch)
    foreign_invoice = make_invoice(other_institute, other_branch, admission="OTH-0001")
    mine = FeePayment.objects.create(
        institute=institute, invoice=invoice, amount=Decimal("25.00"),
        receipt_number="RCP-2026-0001", method="CASH",
    )
    FeePayment.objects.create(
        institute=other_institute, invoice=foreign_invoice, amount=Decimal("30.00"),
        receipt_number="RCP-2026-0001", method="CASH",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    everything = api_client.get("/api/v1/admin/fees/payments")
    upi_only = api_client.get("/api/v1/admin/fees/payments?method=UPI")
    by_invoice = api_client.get(f"/api/v1/admin/fees/payments?invoiceId={invoice.id}")
    foreign_payment = api_client.post(
        "/api/v1/admin/fees/payments",
        {"invoiceId": str(foreign_invoice.id), "amount": "10.00"},
        format="json",
    )

    items = everything.json()["data"]["items"]
    assert [row["id"] for row in items] == [str(mine.id)]
    assert items[0]["studentName"] == "Diya"
    assert items[0]["invoiceNumber"] == invoice.invoice_number
    assert upi_only.json()["data"]["items"] == []
    assert len(by_invoice.json()["data"]["items"]) == 1
    assert foreign_payment.status_code == 404
