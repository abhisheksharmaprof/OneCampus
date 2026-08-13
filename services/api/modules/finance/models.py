import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel


class FinanceSettings(TimeStampedModel):
    """Per-institute finance configuration and document-number sequences (one row per institute)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.OneToOneField(
        "institutes.Institute", on_delete=models.CASCADE, related_name="finance_settings"
    )
    invoice_prefix = models.CharField(max_length=10, default="INV")
    receipt_prefix = models.CharField(max_length=10, default="RCP")
    invoice_sequence = models.PositiveIntegerField(default=0)
    receipt_sequence = models.PositiveIntegerField(default=0)
    tax_label = models.CharField(max_length=40, blank=True, default="Tax")
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))
    invoice_footer = models.TextField(blank=True, default="")
    receipt_footer = models.TextField(blank=True, default="")


class FeePlan(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="fee_plans"
    )
    branch = models.ForeignKey(
        "institutes.Branch",
        on_delete=models.PROTECT,
        related_name="fee_plans",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=120)
    academic_year = models.CharField(max_length=16, blank=True, default="")
    applies_to = models.JSONField(default=list, blank=True)  # list of Grade UUID strings
    items = models.JSONField(default=list, blank=True)  # [{"head", "amount" (str), "period"}]
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("institute", "is_active"))]


class FeeInvoice(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        ISSUED = "ISSUED", "Issued"
        PARTIALLY_PAID = "PARTIALLY_PAID", "Partially paid"
        PAID = "PAID", "Paid"
        CANCELLED = "CANCELLED", "Cancelled"

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
    invoice_number = models.CharField(max_length=32, blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ISSUED)
    issue_date = models.DateField(null=True, blank=True)
    # Line-item amounts are stored as strings to avoid JSON float precision loss.
    line_items = models.JSONField(default=list, blank=True)  # [{"description","period","qty","amount"}]
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    notes = models.TextField(blank=True, default="")
    plan = models.ForeignKey(
        FeePlan, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices"
    )
    template = models.ForeignKey(
        "documents.DocumentTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fee_invoices",
    )
    # Legacy column kept in sync with `total` so existing consumers (student profile fees tab)
    # keep working; new code reads/writes `total`.
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField()

    class Meta:
        ordering = ("-due_date",)
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "invoice_number"),
                condition=~Q(invoice_number=""),
                name="uq_invoice_number_per_institute",
            ),
            models.UniqueConstraint(
                fields=("institute", "plan", "student"),
                condition=Q(plan__isnull=False) & ~Q(status="CANCELLED"),
                name="uq_plan_invoice_per_student",
            ),
        ]
        indexes = [
            models.Index(fields=("institute", "branch", "due_date")),
            models.Index(fields=("institute", "status")),
            models.Index(fields=("institute", "student")),
            models.Index(fields=("institute", "due_date")),
        ]


class FeePayment(TimeStampedModel):
    class Method(models.TextChoices):
        CASH = "CASH", "Cash"
        UPI = "UPI", "UPI"
        CARD = "CARD", "Card"
        BANK = "BANK", "Bank transfer"
        CHEQUE = "CHEQUE", "Cheque"
        OTHER = "OTHER", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Denormalised from invoice so receipt numbers can be unique per institute at the DB level.
    institute = models.ForeignKey(
        "institutes.Institute",
        on_delete=models.CASCADE,
        related_name="fee_payments",
        null=True,
        blank=True,
    )
    invoice = models.ForeignKey(FeeInvoice, on_delete=models.PROTECT, related_name="payments")
    receipt_number = models.CharField(max_length=32, blank=True, default="")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    method = models.CharField(max_length=10, choices=Method.choices, default=Method.CASH)
    reference = models.CharField(max_length=120, blank=True, default="")
    remarks = models.TextField(blank=True, default="")
    paid_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-paid_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "receipt_number"),
                condition=~Q(receipt_number=""),
                name="uq_receipt_number_per_institute",
            )
        ]
        indexes = [
            models.Index(fields=("paid_at",)),
            models.Index(fields=("institute", "paid_at")),
        ]


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
