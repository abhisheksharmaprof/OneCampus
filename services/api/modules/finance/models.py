import uuid
from decimal import Decimal

from django.db import models

from platform_core.models import TimeStampedModel


class FeeInvoice(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="fee_invoices"
    )
    branch = models.ForeignKey(
        "institutes.Branch", on_delete=models.PROTECT, related_name="fee_invoices"
    )
    student = models.ForeignKey(
        "people.Student", on_delete=models.PROTECT, related_name="fee_invoices"
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField()

    class Meta:
        ordering = ("-due_date",)
        indexes = [models.Index(fields=("institute", "branch", "due_date"))]


class FeePayment(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(FeeInvoice, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-paid_at",)
        indexes = [models.Index(fields=("paid_at",))]


class FinanceRecord(TimeStampedModel):
    class Kind(models.TextChoices):
        EXPENSE = "EXPENSE", "Expense"
        PAYROLL = "PAYROLL", "Payroll"
        BUDGET = "BUDGET", "Budget"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("institutes.Institute", on_delete=models.CASCADE, related_name="finance_records")
    branch = models.ForeignKey("institutes.Branch", on_delete=models.PROTECT, related_name="finance_records")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=80, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    entry_date = models.DateField()
    status = models.CharField(max_length=24, default="Draft")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("-entry_date", "-created_at")
        indexes = [models.Index(fields=("institute", "branch", "kind", "entry_date"))]
