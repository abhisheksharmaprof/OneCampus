"""Domain helpers for finance documents.

`next_document_number` MUST be called inside `transaction.atomic()` — it locks the
per-institute FinanceSettings row so concurrent creations never collide.
"""

from decimal import Decimal

from django.utils import timezone

from modules.finance.models import FeeInvoice, FinanceSettings

TWO_PLACES = Decimal("0.01")


def next_document_number(*, institute, kind: str) -> str:
    FinanceSettings.objects.get_or_create(institute=institute)
    settings = FinanceSettings.objects.select_for_update().get(institute=institute)
    if kind == "invoice":
        settings.invoice_sequence += 1
        prefix, sequence = settings.invoice_prefix, settings.invoice_sequence
        settings.save(update_fields=("invoice_sequence", "updated_at"))
    elif kind == "receipt":
        settings.receipt_sequence += 1
        prefix, sequence = settings.receipt_prefix, settings.receipt_sequence
        settings.save(update_fields=("receipt_sequence", "updated_at"))
    else:
        raise ValueError(f"Unknown document kind: {kind}")
    return f"{prefix}-{timezone.now().year}-{sequence:04d}"


def compute_totals(*, line_items, discount_amount, tax_amount):
    subtotal = sum(
        (Decimal(str(item["amount"])) * Decimal(str(item.get("qty", 1))) for item in line_items),
        Decimal("0.00"),
    ).quantize(TWO_PLACES)
    total = (subtotal - Decimal(discount_amount) + Decimal(tax_amount)).quantize(TWO_PLACES)
    return subtotal, total


def resolve_status(*, invoice, paid_total):
    if invoice.status in (FeeInvoice.Status.DRAFT, FeeInvoice.Status.CANCELLED):
        return invoice.status
    if invoice.total > 0 and paid_total >= invoice.total:
        return FeeInvoice.Status.PAID
    if paid_total > 0:
        return FeeInvoice.Status.PARTIALLY_PAID
    return FeeInvoice.Status.ISSUED
