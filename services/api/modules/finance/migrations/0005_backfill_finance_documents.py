from collections import defaultdict
from decimal import Decimal

from django.db import migrations


def backfill(apps, schema_editor):
    FeeInvoice = apps.get_model("finance", "FeeInvoice")
    FeePayment = apps.get_model("finance", "FeePayment")
    FinanceSettings = apps.get_model("finance", "FinanceSettings")

    invoice_seq = defaultdict(int)
    receipt_seq = defaultdict(int)

    for invoice in FeeInvoice.objects.prefetch_related("payments").order_by("created_at").iterator(chunk_size=500):
        invoice_seq[invoice.institute_id] += 1
        seq = invoice_seq[invoice.institute_id]
        paid = sum((p.amount for p in invoice.payments.all()), Decimal("0.00"))
        invoice.invoice_number = f"INV-{invoice.created_at.year}-{seq:04d}"
        invoice.issue_date = invoice.created_at.date()
        invoice.subtotal = invoice.amount
        invoice.total = invoice.amount
        if invoice.amount > 0:
            invoice.line_items = [
                {"description": "Fees", "period": "", "qty": 1, "amount": str(invoice.amount)}
            ]
        if paid <= 0:
            invoice.status = "ISSUED"
        elif paid >= invoice.amount:
            invoice.status = "PAID"
        else:
            invoice.status = "PARTIALLY_PAID"
        invoice.save(
            update_fields=("invoice_number", "issue_date", "subtotal", "total", "line_items", "status")
        )

    for payment in FeePayment.objects.select_related("invoice").order_by("paid_at").iterator(chunk_size=500):
        payment.institute_id = payment.invoice.institute_id
        receipt_seq[payment.institute_id] += 1
        payment.receipt_number = f"RCP-{payment.paid_at.year}-{receipt_seq[payment.institute_id]:04d}"
        payment.save(update_fields=("institute", "receipt_number"))

    for institute_id, seq in invoice_seq.items():
        settings, _ = FinanceSettings.objects.get_or_create(institute_id=institute_id)
        settings.invoice_sequence = seq
        settings.receipt_sequence = receipt_seq.get(institute_id, 0)
        settings.save(update_fields=("invoice_sequence", "receipt_sequence"))


class Migration(migrations.Migration):
    dependencies = [
        ("finance", "0004_feeplan_financesettings_invoicetemplate_and_more"),
    ]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
