from datetime import date
from decimal import Decimal

import pytest

from modules.finance.models import FeeInvoice
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student


@pytest.mark.django_db
def test_fee_collections_validate_branch_scope_and_prevent_overpayment(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="MAIN", is_head_office=True
    )
    other_institute = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_branch = Branch.objects.create(
        institute=other_institute,
        name="Other Campus",
        code="OTHER-MAIN",
        is_head_office=True,
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    student = Student.objects.create(
        institute=institute,
        branch=branch,
        admission_number="NSA-0001",
        first_name="Diya",
    )
    invoice = FeeInvoice.objects.create(
        institute=institute,
        branch=branch,
        student=student,
        amount=Decimal("100.00"),
        total=Decimal("100.00"),
        due_date=date.today(),
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")

    foreign = api_client.get(f"/api/v1/admin/fees/invoices?branchId={foreign_branch.id}")
    first_payment = api_client.post(
        "/api/v1/admin/fees/payments",
        {"invoiceId": str(invoice.id), "amount": "70.00"},
        format="json",
    )
    overpayment = api_client.post(
        "/api/v1/admin/fees/payments",
        {"invoiceId": str(invoice.id), "amount": "40.00"},
        format="json",
    )

    assert foreign.status_code == 404
    assert first_payment.status_code == 201
    assert overpayment.status_code == 400
    assert overpayment.json()["error"]["fieldErrors"]["amount"] == [
        "Payment exceeds the outstanding balance."
    ]
