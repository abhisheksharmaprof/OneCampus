from decimal import Decimal

import pytest
from django.db import transaction

from modules.finance.models import FeeInvoice, FinanceSettings
from modules.finance.services import compute_totals, next_document_number, resolve_status
from modules.institutes.models import Institute


@pytest.mark.django_db
def test_next_document_number_increments_per_institute_and_kind():
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    other = Institute.objects.create(name="Other Academy", code="OTHER")

    with transaction.atomic():
        first = next_document_number(institute=institute, kind="invoice")
        second = next_document_number(institute=institute, kind="invoice")
        receipt = next_document_number(institute=institute, kind="receipt")
        other_first = next_document_number(institute=other, kind="invoice")

    assert first.startswith("INV-") and first.endswith("-0001")
    assert second.endswith("-0002")
    assert receipt.startswith("RCP-") and receipt.endswith("-0001")
    assert other_first.endswith("-0001")
    settings = FinanceSettings.objects.get(institute=institute)
    assert settings.invoice_sequence == 2
    assert settings.receipt_sequence == 1


@pytest.mark.django_db
def test_next_document_number_uses_configured_prefix():
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    FinanceSettings.objects.create(institute=institute, invoice_prefix="FEE")
    with transaction.atomic():
        number = next_document_number(institute=institute, kind="invoice")
    assert number.startswith("FEE-")


@pytest.mark.django_db
def test_next_document_number_rejects_unknown_kind():
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    with pytest.raises(ValueError):
        with transaction.atomic():
            next_document_number(institute=institute, kind="voucher")


def test_compute_totals_rounds_half_up():
    subtotal, total = compute_totals(
        line_items=[{"description": "Fee", "qty": 1, "amount": "1234.565"}],
        discount_amount=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
    )
    assert subtotal == Decimal("1234.57")
    assert total == Decimal("1234.57")


def test_compute_totals_sums_line_items_with_qty():
    subtotal, total = compute_totals(
        line_items=[
            {"description": "Tuition", "qty": 2, "amount": "1500.50"},
            {"description": "Library", "qty": 1, "amount": "99.50"},
        ],
        discount_amount=Decimal("100.00"),
        tax_amount=Decimal("50.00"),
    )
    assert subtotal == Decimal("3100.50")
    assert total == Decimal("3050.50")


def test_resolve_status_transitions():
    invoice = FeeInvoice(status=FeeInvoice.Status.ISSUED, total=Decimal("100.00"))
    assert resolve_status(invoice=invoice, paid_total=Decimal("0.00")) == FeeInvoice.Status.ISSUED
    assert resolve_status(invoice=invoice, paid_total=Decimal("40.00")) == FeeInvoice.Status.PARTIALLY_PAID
    assert resolve_status(invoice=invoice, paid_total=Decimal("100.00")) == FeeInvoice.Status.PAID
    cancelled = FeeInvoice(status=FeeInvoice.Status.CANCELLED, total=Decimal("100.00"))
    assert resolve_status(invoice=cancelled, paid_total=Decimal("100.00")) == FeeInvoice.Status.CANCELLED
