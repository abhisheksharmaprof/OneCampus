# Finance Suite Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Finance tab into a production-grade suite (invoices with server-generated numbers, printable receipts, dues, fee plans, backend-persisted templates with institute branding, settings) backed by real tenant-scoped Django APIs — removing all demo data and localStorage persistence.

**Architecture:** Backend first: extend `FeeInvoice`/`FeePayment`, add `InvoiceTemplate`/`FeePlan`/`FinanceSettings` models, per-institute number sequences under `select_for_update`, new DRF endpoints following the existing `{success, data}` envelope + `paginate_admin_queryset` + `audit_mutation` patterns. Frontend second: `features/finance/` becomes a shell (`FinanceSuitePage`) with a left sub-sidebar routing to focused section components, all data through typed wrappers in `finance.api.ts`, and one shared template→HTML renderer (`invoiceRender.ts`) powering both live preview and popup printing.

**Tech Stack:** Django 5 + DRF + pytest (`uv run pytest`), React 19 + TypeScript + Vite + Vitest/RTL, lucide-react icons. No new libraries.

**Spec:** `docs/superpowers/specs/2026-08-12-finance-suite-redesign-design.md` (approved).

**Conventions you must follow (from this codebase):**
- API responses are `{"success": true, "data": ...}`; errors raise DRF `ValidationError` (rendered as `{"error": {"fieldErrors": ...}}`).
- All serializer field names are camelCase with `source="snake_case"`.
- Every queryset filters by `request.institute` (set by `IsCurrentInstituteAdmin`); object lookups use `get_object_or_404(Model, id=..., institute=request.institute)`.
- Every mutation calls `audit_mutation(request=..., verb=..., target_label=..., target_type=..., target_id=..., extra_meta=...)`.
- Money is `Decimal` everywhere; amounts inside JSONFields are stored as **strings**.
- Frontend API calls go through `adminRequest<T>(accessToken, path, options)` from `../admin/admin.api` (path is relative to `/api/v1/admin/`, e.g. `'fees/invoices?page=1'`). Paginated responses are `PageData<T>`.
- Backend commands run from `services/api/`: `uv run pytest tests/<file> -v`, `uv run python manage.py makemigrations finance`.
- Frontend commands run from `apps/institute-admin-web/`: `npx vitest run <file>`, `npm run typecheck`.

---

## File Map

**Backend (services/api/):**
| File | Action | Responsibility |
|---|---|---|
| `modules/finance/models.py` | Modify | Add `FinanceSettings`, `InvoiceTemplate`, `FeePlan`; extend `FeeInvoice`, `FeePayment` |
| `modules/finance/migrations/0004_*.py` | Create (generated) | Schema migration |
| `modules/finance/migrations/0005_backfill_finance_documents.py` | Create | Backfill invoice/receipt numbers, statuses, totals |
| `modules/finance/services.py` | Create | `next_document_number`, `compute_totals`, `resolve_status` |
| `modules/finance/api/views.py` | Modify | Rework invoice list/create; add invoice detail, bulk-generate; rework payments (add GET) |
| `modules/finance/api/templates_views.py` | Create | InvoiceTemplate CRUD + preset seeding |
| `modules/finance/api/plans_views.py` | Create | FeePlan CRUD |
| `modules/finance/api/insights_views.py` | Create | `fees/summary`, `fees/dues` |
| `modules/finance/api/settings_views.py` | Create | `finance/settings` GET/PATCH |
| `modules/institutes/api/admin_urls.py` | Modify | Mount new routes |
| `tests/test_finance_services.py` | Create | Number generation + totals unit tests |
| `tests/test_admin_finance_invoices.py` | Create | Invoice endpoints |
| `tests/test_admin_finance_payments.py` | Create | Payment endpoints |
| `tests/test_admin_finance_bulk.py` | Create | Bulk generate |
| `tests/test_admin_finance_templates.py` | Create | Templates |
| `tests/test_admin_finance_plans.py` | Create | Fee plans |
| `tests/test_admin_finance_insights.py` | Create | Summary + dues |
| `tests/test_admin_finance_settings.py` | Create | Finance settings |
| `tests/test_admin_finance_api.py` | Modify | Keep legacy test green (set `total` on created invoice) |

**Frontend (apps/institute-admin-web/src/):**
| File | Action | Responsibility |
|---|---|---|
| `features/finance/finance.api.ts` | Create | Types + `adminRequest` wrappers for every endpoint |
| `features/finance/invoiceRender.ts` | Create | Template layout → A4 HTML (escape, placeholders, computed rows), `openPrintWindow` |
| `features/finance/invoiceRender.test.ts` | Create | Escaping/placeholder/math tests |
| `features/finance/FinanceSuitePage.tsx` | Rewrite | Shell: sub-sidebar + section router only |
| `features/finance/sections/OverviewSection.tsx` | Create | KPIs + monthly chart + quick actions |
| `features/finance/sections/InvoicesSection.tsx` | Create | Table + filters + bulk generate + cancel |
| `features/finance/sections/InvoiceEditor.tsx` | Create | Split editor + live preview (create invoice) |
| `features/finance/sections/PaymentsSection.tsx` | Create | Payments list + record payment + print receipt |
| `features/finance/sections/DuesSection.tsx` | Create | Defaulter list |
| `features/finance/sections/FeePlansSection.tsx` | Create | Fee plan CRUD |
| `features/finance/sections/TemplatesSection.tsx` | Create | Template Studio |
| `features/finance/sections/SettingsSection.tsx` | Create | Finance settings form |
| `features/finance/sections/shared.tsx` | Create | Loading/error/empty state helpers + money formatter |
| `features/finance/finance-suite.css` | Rewrite | Consolidated suite styles |
| `features/finance/invoiceTemplates.ts` | Delete | Superseded by invoiceRender.ts + backend templates |
| `adminNavigation.ts` | Modify | Add `/finance/dues` route; retitle fee-structure → Fee plans |
| `App.tsx` | Modify | Extend `financeSectionByRoute`; drop deleted page imports |
| `App.test.tsx` | Modify | Update finance navigation expectations |
| `features/settings/BrandingPage.tsx` | Modify | Fix `primaryColor` → `brandColor` read bug |
| `features/finance/FinanceWorkspacePage.tsx`, `FinanceOverviewPage.tsx`, `FeeCollectionsPage.tsx`, `FeeStructurePage.tsx` | Delete | Dead/superseded pages (verify import sites first) |

`FinanceModulePage.tsx` (Expenses/Payroll/Budget/Reports) is **kept unchanged** — the shell links to those existing routes under an "Operations" group.

---

### Task 1: Backend models + schema migration

**Files:**
- Modify: `services/api/modules/finance/models.py`
- Create (generated): `services/api/modules/finance/migrations/0004_*.py`

- [ ] **Step 1: Replace the contents of `models.py`**

Keep `FinanceRecord` exactly as-is at the bottom of the file. Replace everything above it with:

```python
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


class InvoiceTemplate(TimeStampedModel):
    class Kind(models.TextChoices):
        INVOICE = "INVOICE", "Invoice"
        RECEIPT = "RECEIPT", "Receipt"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="invoice_templates"
    )
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.INVOICE)
    layout = models.JSONField(default=dict, blank=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ("name",)
        indexes = [models.Index(fields=("institute", "kind"))]


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
        InvoiceTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices"
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
            )
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
```

- [ ] **Step 2: Generate the migration**

Run: `cd services/api && uv run python manage.py makemigrations finance`
Expected: creates `modules/finance/migrations/0004_...py` (adds FinanceSettings, InvoiceTemplate, FeePlan; adds fields/constraints/indexes to FeeInvoice and FeePayment). No prompts — every new field has a default or is nullable.

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd services/api && uv run pytest tests/test_admin_finance_api.py -v`
Expected: PASS (new fields all have defaults; legacy behaviour untouched so far).

- [ ] **Step 4: Commit**

```bash
git add services/api/modules/finance/models.py services/api/modules/finance/migrations/
git commit -m "feat(finance): add FinanceSettings/InvoiceTemplate/FeePlan models, extend FeeInvoice and FeePayment"
```

---

### Task 2: Backfill data migration

**Files:**
- Create: `services/api/modules/finance/migrations/0005_backfill_finance_documents.py`

- [ ] **Step 1: Create the empty migration**

Run: `cd services/api && uv run python manage.py makemigrations finance --empty -n backfill_finance_documents`
Expected: creates `modules/finance/migrations/0005_backfill_finance_documents.py`.

- [ ] **Step 2: Write the backfill**

Replace the generated file's contents with (keep the generated `dependencies` line — it must point at the 0004 migration name from Task 1):

```python
from collections import defaultdict
from decimal import Decimal

from django.db import migrations


def backfill(apps, schema_editor):
    FeeInvoice = apps.get_model("finance", "FeeInvoice")
    FeePayment = apps.get_model("finance", "FeePayment")
    FinanceSettings = apps.get_model("finance", "FinanceSettings")

    invoice_seq = defaultdict(int)
    receipt_seq = defaultdict(int)

    for invoice in FeeInvoice.objects.prefetch_related("payments").order_by("created_at").iterator():
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

    for payment in FeePayment.objects.select_related("invoice").order_by("paid_at").iterator():
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
        ("finance", "0004_REPLACE_WITH_ACTUAL_0004_NAME"),
    ]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
```

(Replace `0004_REPLACE_WITH_ACTUAL_0004_NAME` with the real filename generated in Task 1 — the auto-generated dependency will already be correct if you only edit the operations/function.)

- [ ] **Step 3: Verify migrations apply cleanly**

Run: `cd services/api && uv run pytest tests/test_admin_finance_api.py -v`
Expected: PASS (pytest-django builds the test DB by running all migrations, including the backfill).

- [ ] **Step 4: Commit**

```bash
git add services/api/modules/finance/migrations/0005_backfill_finance_documents.py
git commit -m "feat(finance): backfill invoice/receipt numbers, statuses and totals"
```

---

### Task 3: Finance services (number generation, totals, status)

**Files:**
- Create: `services/api/modules/finance/services.py`
- Test: `services/api/tests/test_finance_services.py`

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_finance_services.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_finance_services.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.finance.services'`.

- [ ] **Step 3: Implement `services.py`**

Create `services/api/modules/finance/services.py`:

```python
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
```

If `TimeStampedModel` does not have an `updated_at` field (check `services/api/platform_core/models.py`), drop `"updated_at"` from the `update_fields` tuples.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_finance_services.py -v`
Expected: 4 PASSED.

- [ ] **Step 5: Commit**

```bash
git add services/api/modules/finance/services.py services/api/tests/test_finance_services.py
git commit -m "feat(finance): document number sequences, totals and status helpers"
```

---

### Task 4: Invoice endpoints (list/create rework + detail/patch/cancel)

**Files:**
- Modify: `services/api/modules/finance/api/views.py` (replace the invoice serializers/views; keep `FinanceRecord*` and payment views as-is for now)
- Modify: `services/api/modules/institutes/api/admin_urls.py` (currently line 80: `path("fees/invoices", ...)`)
- Modify: `services/api/tests/test_admin_finance_api.py` (keep legacy test green)
- Test: `services/api/tests/test_admin_finance_invoices.py`

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_admin_finance_invoices.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_admin_finance_invoices.py -v`
Expected: FAIL — creates return 400 (old serializer requires `amount`), detail URLs 404 (route missing).

- [ ] **Step 3: Rework `views.py` invoice section**

In `services/api/modules/finance/api/views.py`, replace the imports block and everything from `class InvoiceSerializer` through `class FeeInvoiceListCreateView` (keep `FeePaymentCreateView` and `FinanceRecord*` untouched for now) with:

```python
from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import StudentEnrollment
from modules.finance.models import FeeInvoice, FeePayment, FinanceRecord, InvoiceTemplate
from modules.finance.services import compute_totals, next_document_number
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from modules.people.models import Student
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset

ACTIVE_ENROLLMENTS = Prefetch(
    "student__academic_enrollments",
    queryset=StudentEnrollment.objects.filter(left_at__isnull=True).select_related(
        "class_section__grade"
    ),
    to_attr="active_enrollments",
)


def invoice_queryset(institute):
    return (
        FeeInvoice.objects.filter(institute=institute)
        .select_related("student")
        .prefetch_related("payments", ACTIVE_ENROLLMENTS)
    )


class LineItemSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=200)
    period = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    qty = serializers.IntegerField(min_value=1, max_value=999, default=1)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00")
    )


class InvoiceSerializer(serializers.ModelSerializer):
    invoiceNumber = serializers.CharField(source="invoice_number", read_only=True)
    studentId = serializers.UUIDField(source="student_id", read_only=True)
    studentName = serializers.SerializerMethodField()
    admissionNumber = serializers.CharField(source="student.admission_number", read_only=True)
    className = serializers.SerializerMethodField()
    issueDate = serializers.DateField(source="issue_date", read_only=True)
    dueDate = serializers.DateField(source="due_date", read_only=True)
    lineItems = serializers.JSONField(source="line_items", read_only=True)
    discountAmount = serializers.DecimalField(
        source="discount_amount", max_digits=12, decimal_places=2, read_only=True
    )
    taxAmount = serializers.DecimalField(
        source="tax_amount", max_digits=12, decimal_places=2, read_only=True
    )
    templateId = serializers.UUIDField(source="template_id", read_only=True)
    totalPaid = serializers.SerializerMethodField()

    class Meta:
        model = FeeInvoice
        fields = (
            "id", "invoiceNumber", "studentId", "studentName", "admissionNumber",
            "className", "status", "issueDate", "dueDate", "lineItems", "subtotal",
            "discountAmount", "taxAmount", "total", "notes", "templateId", "totalPaid",
            # Legacy fields kept for the student-profile fees tab:
            "amount", "due_date",
        )

    def get_studentName(self, invoice) -> str:
        return invoice.student.full_name

    def get_className(self, invoice) -> str:
        enrollments = getattr(invoice.student, "active_enrollments", None)
        if enrollments is None:
            enrollment = invoice.student.academic_enrollments.filter(
                left_at__isnull=True
            ).select_related("class_section__grade").first()
        else:
            enrollment = enrollments[0] if enrollments else None
        if enrollment is None:
            return ""
        section = enrollment.class_section
        return f"{section.grade.name} {section.section_name}".strip()

    def get_totalPaid(self, invoice) -> str:
        return str(sum((payment.amount for payment in invoice.payments.all()), Decimal("0.00")))


class InvoiceWriteSerializer(serializers.Serializer):
    studentId = serializers.UUIDField()
    issueDate = serializers.DateField()
    dueDate = serializers.DateField()
    lineItems = LineItemSerializer(many=True, allow_empty=False)
    discountAmount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), default=Decimal("0.00")
    )
    taxAmount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), default=Decimal("0.00")
    )
    notes = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )
    templateId = serializers.UUIDField(required=False, allow_null=True, default=None)
    status = serializers.ChoiceField(
        choices=(FeeInvoice.Status.DRAFT, FeeInvoice.Status.ISSUED),
        default=FeeInvoice.Status.ISSUED,
    )

    def validate(self, attrs):
        if attrs["dueDate"] < attrs["issueDate"]:
            raise serializers.ValidationError(
                {"dueDate": ["Due date cannot be before the issue date."]}
            )
        return attrs


class InvoicePatchSerializer(serializers.Serializer):
    issueDate = serializers.DateField(required=False)
    dueDate = serializers.DateField(required=False)
    lineItems = LineItemSerializer(many=True, allow_empty=False, required=False)
    discountAmount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), required=False
    )
    taxAmount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), required=False
    )
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    templateId = serializers.UUIDField(required=False, allow_null=True)
    status = serializers.ChoiceField(
        choices=(FeeInvoice.Status.DRAFT, FeeInvoice.Status.ISSUED, FeeInvoice.Status.CANCELLED),
        required=False,
    )


def serialize_line_items(validated_items):
    return [
        {
            "description": item["description"],
            "period": item.get("period", ""),
            "qty": item.get("qty", 1),
            "amount": str(item["amount"]),
        }
        for item in validated_items
    ]


def apply_invoice_totals(invoice, *, line_items, discount_amount, tax_amount):
    subtotal, total = compute_totals(
        line_items=line_items, discount_amount=discount_amount, tax_amount=tax_amount
    )
    if discount_amount > subtotal:
        raise serializers.ValidationError(
            {"discountAmount": ["Discount cannot exceed the subtotal."]}
        )
    if total <= 0:
        raise serializers.ValidationError(
            {"lineItems": ["Invoice total must be greater than zero."]}
        )
    invoice.line_items = line_items
    invoice.subtotal = subtotal
    invoice.discount_amount = discount_amount
    invoice.tax_amount = tax_amount
    invoice.total = total
    invoice.amount = total


class FeeInvoiceListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: InvoiceSerializer(many=True)})
    def get(self, request):
        invoices = invoice_queryset(request.institute)
        branch_id = request.query_params.get("branchId")
        if branch_id:
            get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
            invoices = invoices.filter(branch_id=branch_id)
        student_id = request.query_params.get("studentId")
        if student_id:
            invoices = invoices.filter(student_id=student_id)
        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter in FeeInvoice.Status.values:
            invoices = invoices.filter(status=status_filter)
        class_id = request.query_params.get("classId")
        if class_id:
            enrolled = StudentEnrollment.objects.filter(
                class_section__grade_id=class_id, left_at__isnull=True
            ).values("student_id")
            invoices = invoices.filter(student_id__in=enrolled)
        date_from = request.query_params.get("dateFrom")
        if date_from:
            invoices = invoices.filter(due_date__gte=date_from)
        date_to = request.query_params.get("dateTo")
        if date_to:
            invoices = invoices.filter(due_date__lte=date_to)
        search = request.query_params.get("search", "").strip()
        if search:
            invoices = invoices.filter(
                Q(student__first_name__icontains=search)
                | Q(student__last_name__icontains=search)
                | Q(student__admission_number__icontains=search)
                | Q(invoice_number__icontains=search)
            )
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=invoices, serializer_class=InvoiceSerializer
                ),
            }
        )

    @extend_schema(
        request=InvoiceWriteSerializer,
        responses={status.HTTP_201_CREATED: InvoiceSerializer},
    )
    def post(self, request):
        serializer = InvoiceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            student = get_object_or_404(
                Student, id=values["studentId"], institute=request.institute, is_active=True
            )
            template = None
            if values["templateId"]:
                template = get_object_or_404(
                    InvoiceTemplate, id=values["templateId"], institute=request.institute
                )
            invoice = FeeInvoice(
                institute=request.institute,
                branch=student.branch,
                student=student,
                invoice_number=next_document_number(institute=request.institute, kind="invoice"),
                status=values["status"],
                issue_date=values["issueDate"],
                due_date=values["dueDate"],
                notes=values["notes"],
                template=template,
            )
            apply_invoice_totals(
                invoice,
                line_items=serialize_line_items(values["lineItems"]),
                discount_amount=values["discountAmount"],
                tax_amount=values["taxAmount"],
            )
            invoice.save()
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"fee invoice {invoice.invoice_number} for {student.full_name}",
            target_type="fee_invoice",
            target_id=invoice.id,
            extra_meta={
                "invoiceNumber": invoice.invoice_number,
                "total": str(invoice.total),
                "status": invoice.status,
                "studentId": str(student.id),
            },
        )
        fresh = invoice_queryset(request.institute).get(id=invoice.id)
        return Response(
            {"success": True, "data": InvoiceSerializer(fresh).data},
            status=status.HTTP_201_CREATED,
        )


class FeeInvoiceDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: InvoiceSerializer})
    def get(self, request, invoice_id):
        invoice = get_object_or_404(invoice_queryset(request.institute), id=invoice_id)
        return Response({"success": True, "data": InvoiceSerializer(invoice).data})

    @extend_schema(request=InvoicePatchSerializer, responses={status.HTTP_200_OK: InvoiceSerializer})
    def patch(self, request, invoice_id):
        serializer = InvoicePatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            invoice = get_object_or_404(
                FeeInvoice.objects.select_for_update(),
                id=invoice_id,
                institute=request.institute,
            )
            if values.get("status") == FeeInvoice.Status.CANCELLED:
                if invoice.payments.exists():
                    raise serializers.ValidationError(
                        {"status": ["Cannot cancel an invoice that has payments."]}
                    )
                invoice.status = FeeInvoice.Status.CANCELLED
                invoice.save(update_fields=("status", "updated_at"))
                verb, meta = "Updated", {"action": "cancelled"}
            else:
                if invoice.status != FeeInvoice.Status.DRAFT:
                    raise serializers.ValidationError(
                        {"status": ["Only draft invoices can be edited."]}
                    )
                issue_date = values.get("issueDate", invoice.issue_date)
                due_date = values.get("dueDate", invoice.due_date)
                if issue_date and due_date < issue_date:
                    raise serializers.ValidationError(
                        {"dueDate": ["Due date cannot be before the issue date."]}
                    )
                invoice.issue_date = issue_date
                invoice.due_date = due_date
                invoice.notes = values.get("notes", invoice.notes)
                if "templateId" in values:
                    invoice.template = (
                        get_object_or_404(
                            InvoiceTemplate, id=values["templateId"], institute=request.institute
                        )
                        if values["templateId"]
                        else None
                    )
                line_items = (
                    serialize_line_items(values["lineItems"])
                    if "lineItems" in values
                    else invoice.line_items
                )
                apply_invoice_totals(
                    invoice,
                    line_items=line_items,
                    discount_amount=values.get("discountAmount", invoice.discount_amount),
                    tax_amount=values.get("taxAmount", invoice.tax_amount),
                )
                if values.get("status") == FeeInvoice.Status.ISSUED:
                    invoice.status = FeeInvoice.Status.ISSUED
                invoice.save()
                verb, meta = "Updated", {"action": "edited", "total": str(invoice.total)}
        audit_mutation(
            request=request,
            verb=verb,
            target_label=f"fee invoice {invoice.invoice_number}",
            target_type="fee_invoice",
            target_id=invoice.id,
            extra_meta={"invoiceNumber": invoice.invoice_number, **meta},
        )
        fresh = invoice_queryset(request.institute).get(id=invoice.id)
        return Response({"success": True, "data": InvoiceSerializer(fresh).data})
```

Note: if `TimeStampedModel` has no `updated_at` field, drop it from `update_fields`.

- [ ] **Step 4: Mount the detail route**

In `services/api/modules/institutes/api/admin_urls.py`, update the finance imports and add the route directly after the existing `fees/invoices` path (line ~80):

```python
from modules.finance.api.views import (
    FeeInvoiceDetailView,
    FeeInvoiceListCreateView,
    FeePaymentCreateView,
    FinanceRecordListCreateView,
)
```

```python
    path("fees/invoices", FeeInvoiceListCreateView.as_view(), name="admin-fee-invoices"),
    path(
        "fees/invoices/<uuid:invoice_id>",
        FeeInvoiceDetailView.as_view(),
        name="admin-fee-invoice-detail",
    ),
```

(Match the actual current import style in that file — it may import views individually.)

- [ ] **Step 5: Keep the legacy test green**

In `services/api/tests/test_admin_finance_api.py`, the invoice is created directly via the ORM with only `amount`; the payment guard will now check `total`. Update the creation call:

```python
    invoice = FeeInvoice.objects.create(
        institute=institute,
        branch=branch,
        student=student,
        amount=Decimal("100.00"),
        total=Decimal("100.00"),
        due_date=date.today(),
    )
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_admin_finance_invoices.py tests/test_admin_finance_api.py -v`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add services/api/modules/finance/api/views.py services/api/modules/institutes/api/admin_urls.py services/api/tests/test_admin_finance_invoices.py services/api/tests/test_admin_finance_api.py
git commit -m "feat(finance): invoice numbers, line items, totals, status; draft edit + cancel endpoints"
```

---

### Task 5: Payment endpoints (GET list + extended POST with receipts)

**Files:**
- Modify: `services/api/modules/finance/api/views.py` (replace `FeePaymentCreateView` with `FeePaymentListCreateView`)
- Modify: `services/api/modules/institutes/api/admin_urls.py` (line ~81)
- Test: `services/api/tests/test_admin_finance_payments.py`

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_admin_finance_payments.py`:

```python
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
    final = api_client.post(
        "/api/v1/admin/fees/payments",
        {"invoiceId": str(invoice.id), "amount": "60.00"},
        format="json",
    )

    assert partial.status_code == 201
    data = partial.json()["data"]
    assert data["receiptNumber"].startswith("RCP-")
    assert data["method"] == "UPI"
    invoice.refresh_from_db()
    assert invoice.status == "PAID"
    assert final.json()["data"]["receiptNumber"] != data["receiptNumber"]
    payment_id = data["id"]
    assert AuditEvent.objects.filter(
        institute=institute, target_type="fee_payment", target_id=payment_id
    ).exists()
    # partial state was PARTIALLY_PAID between the two payments
    assert FeeInvoice.objects.get(id=invoice.id).status == "PAID"


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

    items = everything.json()["data"]["items"]
    assert [row["id"] for row in items] == [str(mine.id)]
    assert items[0]["studentName"] == "Diya"
    assert items[0]["invoiceNumber"] == invoice.invoice_number
    assert upi_only.json()["data"]["items"] == []
    assert len(by_invoice.json()["data"]["items"]) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_admin_finance_payments.py -v`
Expected: FAIL — GET `fees/payments` returns 405 (no `get` handler), POST response lacks `receiptNumber`.

- [ ] **Step 3: Replace `FeePaymentCreateView`**

In `views.py`, replace the whole `FeePaymentCreateView` class with:

```python
from modules.finance.services import compute_totals, next_document_number, resolve_status
```

(extend the existing services import at the top), then:

```python
class PaymentSerializer(serializers.ModelSerializer):
    receiptNumber = serializers.CharField(source="receipt_number", read_only=True)
    invoiceId = serializers.UUIDField(source="invoice_id", read_only=True)
    invoiceNumber = serializers.CharField(source="invoice.invoice_number", read_only=True)
    studentId = serializers.UUIDField(source="invoice.student_id", read_only=True)
    studentName = serializers.SerializerMethodField()
    admissionNumber = serializers.CharField(
        source="invoice.student.admission_number", read_only=True
    )
    paidAt = serializers.DateTimeField(source="paid_at", read_only=True)

    class Meta:
        model = FeePayment
        fields = (
            "id", "receiptNumber", "invoiceId", "invoiceNumber", "studentId",
            "studentName", "admissionNumber", "amount", "method", "reference",
            "remarks", "paidAt",
        )

    def get_studentName(self, payment) -> str:
        return payment.invoice.student.full_name


class PaymentWriteSerializer(serializers.Serializer):
    invoiceId = serializers.UUIDField()
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    method = serializers.ChoiceField(
        choices=FeePayment.Method.choices, default=FeePayment.Method.CASH
    )
    reference = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=120
    )
    remarks = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )


class FeePaymentListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: PaymentSerializer(many=True)})
    def get(self, request):
        payments = FeePayment.objects.filter(institute=request.institute).select_related(
            "invoice__student"
        )
        branch_id = request.query_params.get("branchId")
        if branch_id:
            get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
            payments = payments.filter(invoice__branch_id=branch_id)
        invoice_id = request.query_params.get("invoiceId")
        if invoice_id:
            payments = payments.filter(invoice_id=invoice_id)
        student_id = request.query_params.get("studentId")
        if student_id:
            payments = payments.filter(invoice__student_id=student_id)
        method = request.query_params.get("method", "").strip().upper()
        if method in FeePayment.Method.values:
            payments = payments.filter(method=method)
        date_from = request.query_params.get("dateFrom")
        if date_from:
            payments = payments.filter(paid_at__date__gte=date_from)
        date_to = request.query_params.get("dateTo")
        if date_to:
            payments = payments.filter(paid_at__date__lte=date_to)
        search = request.query_params.get("search", "").strip()
        if search:
            payments = payments.filter(
                Q(invoice__student__first_name__icontains=search)
                | Q(invoice__student__last_name__icontains=search)
                | Q(receipt_number__icontains=search)
                | Q(invoice__invoice_number__icontains=search)
            )
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=payments, serializer_class=PaymentSerializer
                ),
            }
        )

    @extend_schema(request=PaymentWriteSerializer, responses={status.HTTP_201_CREATED: PaymentSerializer})
    def post(self, request):
        serializer = PaymentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            invoice = get_object_or_404(
                FeeInvoice.objects.select_for_update(),
                id=values["invoiceId"],
                institute=request.institute,
            )
            if invoice.status in (FeeInvoice.Status.DRAFT, FeeInvoice.Status.CANCELLED):
                raise serializers.ValidationError(
                    {"invoiceId": ["Payments can only be recorded against issued invoices."]}
                )
            amount_paid = invoice.payments.aggregate(total=Sum("amount"))["total"] or Decimal(
                "0.00"
            )
            amount = values["amount"]
            if amount > invoice.total - amount_paid:
                raise serializers.ValidationError(
                    {"amount": ["Payment exceeds the outstanding balance."]}
                )
            payment = FeePayment.objects.create(
                institute=request.institute,
                invoice=invoice,
                amount=amount,
                receipt_number=next_document_number(institute=request.institute, kind="receipt"),
                method=values["method"],
                reference=values["reference"],
                remarks=values["remarks"],
            )
            invoice.status = resolve_status(invoice=invoice, paid_total=amount_paid + amount)
            invoice.save(update_fields=("status", "updated_at"))
        audit_mutation(
            request=request,
            verb="PAYMENT",
            target_label=(
                f"fee payment {payment.receipt_number} of {amount} "
                f"for invoice {invoice.invoice_number}"
            ),
            target_type="fee_payment",
            target_id=payment.id,
            extra_meta={
                "receiptNumber": payment.receipt_number,
                "amount": str(amount),
                "method": payment.method,
                "invoiceId": str(invoice.id),
                "invoiceNumber": invoice.invoice_number,
                "invoiceStatus": invoice.status,
            },
        )
        return Response(
            {"success": True, "data": PaymentSerializer(payment).data},
            status=status.HTTP_201_CREATED,
        )
```

Note the legacy test (`test_admin_finance_api.py`) asserts the overpayment `fieldErrors` shape — that behaviour is preserved. If `TimeStampedModel` has no `updated_at`, drop it from `update_fields`.

- [ ] **Step 4: Update the URL**

In `admin_urls.py`, replace the `FeePaymentCreateView` import/route with:

```python
    path("fees/payments", FeePaymentListCreateView.as_view(), name="admin-fee-payments"),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_admin_finance_payments.py tests/test_admin_finance_api.py -v`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add services/api/modules/finance/api/views.py services/api/modules/institutes/api/admin_urls.py services/api/tests/test_admin_finance_payments.py
git commit -m "feat(finance): payments list endpoint, receipt numbers, methods, invoice status updates"
```

---

### Task 6: Bulk invoice generation

**Files:**
- Modify: `services/api/modules/finance/api/views.py` (add `FeeInvoiceBulkGenerateView`)
- Modify: `services/api/modules/institutes/api/admin_urls.py`
- Test: `services/api/tests/test_admin_finance_bulk.py`

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_admin_finance_bulk.py`:

```python
from datetime import date, timedelta
from decimal import Decimal

import pytest

from modules.academics.models import AcademicYear, ClassSection, Grade, StudentEnrollment
from modules.finance.models import FeeInvoice, FeePlan
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
    grade = Grade.objects.create(institute=institute, name="Class 8")
    year = AcademicYear.objects.create(
        institute=institute,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_current=True,
    )
    section = ClassSection.objects.create(
        branch=branch, grade=grade, academic_year=year, section_name="A"
    )
    students = []
    for index in range(3):
        student = Student.objects.create(
            institute=institute,
            branch=branch,
            admission_number=f"NSA-000{index + 1}",
            first_name=f"Student{index + 1}",
        )
        StudentEnrollment.objects.create(
            student=student,
            class_section=section,
            academic_year=year,
            roll_number=str(index + 1),
        )
        students.append(student)
    plan = FeePlan.objects.create(
        institute=institute,
        name="Term 1 fees",
        academic_year="2026-27",
        applies_to=[str(grade.id)],
        items=[
            {"head": "Tuition fee", "amount": "5000.00", "period": "Term 1"},
            {"head": "Library fee", "amount": "300.00", "period": "Term 1"},
        ],
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")
    return {
        "institute": institute, "branch": branch, "grade": grade,
        "plan": plan, "students": students,
    }


BODY = lambda ctx: {
    "feePlanId": str(ctx["plan"].id),
    "classIds": [str(ctx["grade"].id)],
    "issueDate": str(date.today()),
    "dueDate": str(date.today() + timedelta(days=15)),
}


@pytest.mark.django_db
def test_bulk_generate_creates_invoices_for_enrolled_students(api_client, context):
    response = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate", BODY(context), format="json"
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["created"] == 3
    assert data["skipped"] == 0
    invoices = FeeInvoice.objects.filter(institute=context["institute"], plan=context["plan"])
    assert invoices.count() == 3
    sample = invoices.first()
    assert sample.total == Decimal("5300.00")
    assert sample.status == "ISSUED"
    assert sample.invoice_number.startswith("INV-")
    numbers = set(invoices.values_list("invoice_number", flat=True))
    assert len(numbers) == 3


@pytest.mark.django_db
def test_bulk_generate_is_idempotent(api_client, context):
    first = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate", BODY(context), format="json"
    )
    second = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate", BODY(context), format="json"
    )

    assert first.json()["data"]["created"] == 3
    assert second.json()["data"]["created"] == 0
    assert second.json()["data"]["skipped"] == 3
    assert FeeInvoice.objects.filter(plan=context["plan"]).count() == 3


@pytest.mark.django_db
def test_bulk_generate_rejects_foreign_or_inactive_plan(api_client, context):
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_plan = FeePlan.objects.create(
        institute=other, name="Foreign plan", items=[{"head": "Fee", "amount": "10.00"}]
    )
    context["plan"].is_active = False
    context["plan"].save(update_fields=("is_active",))

    foreign = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate",
        {**BODY(context), "feePlanId": str(foreign_plan.id)},
        format="json",
    )
    inactive = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate", BODY(context), format="json"
    )

    assert foreign.status_code == 404
    assert inactive.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_admin_finance_bulk.py -v`
Expected: FAIL with 404 on `fees/invoices/bulk-generate` (route missing).

- [ ] **Step 3: Implement the view**

Add to `views.py` (after `FeeInvoiceDetailView`), plus `FeePlan` in the models import:

```python
class BulkGenerateSerializer(serializers.Serializer):
    feePlanId = serializers.UUIDField()
    classIds = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    issueDate = serializers.DateField()
    dueDate = serializers.DateField()
    templateId = serializers.UUIDField(required=False, allow_null=True, default=None)

    def validate(self, attrs):
        if attrs["dueDate"] < attrs["issueDate"]:
            raise serializers.ValidationError(
                {"dueDate": ["Due date cannot be before the issue date."]}
            )
        return attrs


class FeeInvoiceBulkGenerateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(request=BulkGenerateSerializer, responses={status.HTTP_201_CREATED: dict})
    def post(self, request):
        serializer = BulkGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            plan = get_object_or_404(
                FeePlan, id=values["feePlanId"], institute=request.institute, is_active=True
            )
            template = None
            if values["templateId"]:
                template = get_object_or_404(
                    InvoiceTemplate, id=values["templateId"], institute=request.institute
                )
            line_items = [
                {
                    "description": item.get("head", ""),
                    "period": item.get("period", ""),
                    "qty": 1,
                    "amount": str(item.get("amount", "0")),
                }
                for item in plan.items
            ]
            subtotal, total = compute_totals(
                line_items=line_items,
                discount_amount=Decimal("0.00"),
                tax_amount=Decimal("0.00"),
            )
            if total <= 0:
                raise serializers.ValidationError(
                    {"feePlanId": ["The fee plan has no billable items."]}
                )
            enrollments = (
                StudentEnrollment.objects.filter(
                    class_section__grade_id__in=values["classIds"],
                    left_at__isnull=True,
                    student__institute=request.institute,
                    student__is_active=True,
                )
                .select_related("student")
            )
            students = {enrollment.student_id: enrollment.student for enrollment in enrollments}
            already_invoiced = set(
                FeeInvoice.objects.filter(
                    institute=request.institute, plan=plan, student_id__in=students.keys()
                )
                .exclude(status=FeeInvoice.Status.CANCELLED)
                .values_list("student_id", flat=True)
            )
            created = []
            for student_id, student in students.items():
                if student_id in already_invoiced:
                    continue
                invoice = FeeInvoice(
                    institute=request.institute,
                    branch=student.branch,
                    student=student,
                    plan=plan,
                    template=template,
                    invoice_number=next_document_number(
                        institute=request.institute, kind="invoice"
                    ),
                    status=FeeInvoice.Status.ISSUED,
                    issue_date=values["issueDate"],
                    due_date=values["dueDate"],
                    line_items=line_items,
                    subtotal=subtotal,
                    total=total,
                    amount=total,
                )
                invoice.save()
                created.append(invoice)
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"{len(created)} fee invoices from plan '{plan.name}'",
            target_type="fee_plan",
            target_id=plan.id,
            extra_meta={
                "feePlanId": str(plan.id),
                "createdCount": len(created),
                "skippedCount": len(students) - len(created),
                "total": str(total),
            },
        )
        return Response(
            {
                "success": True,
                "data": {"created": len(created), "skipped": len(students) - len(created)},
            },
            status=status.HTTP_201_CREATED,
        )
```

- [ ] **Step 4: Mount the route (before the `<uuid:invoice_id>` path)**

```python
    path(
        "fees/invoices/bulk-generate",
        FeeInvoiceBulkGenerateView.as_view(),
        name="admin-fee-invoices-bulk-generate",
    ),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_admin_finance_bulk.py -v`
Expected: 3 PASSED.

- [ ] **Step 6: Commit**

```bash
git add services/api/modules/finance/api/views.py services/api/modules/institutes/api/admin_urls.py services/api/tests/test_admin_finance_bulk.py
git commit -m "feat(finance): idempotent bulk invoice generation from fee plans"
```

---

### Task 7: Invoice template endpoints (CRUD + preset seeding)

**Files:**
- Create: `services/api/modules/finance/api/templates_views.py`
- Modify: `services/api/modules/institutes/api/admin_urls.py`
- Test: `services/api/tests/test_admin_finance_templates.py`

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_admin_finance_templates.py`:

```python
import pytest

from modules.finance.models import InvoiceTemplate
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


def make_admin(api_client, *, code="NSA"):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    Branch.objects.create(
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
    return institute, login.json()["data"]["accessToken"]


@pytest.mark.django_db
def test_first_list_seeds_presets(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = api_client.get("/api/v1/admin/fees/templates")

    items = response.json()["data"]["items"]
    names = {item["name"] for item in items}
    assert names == {"Classic letterhead", "Modern colour band", "Compact counter receipt"}
    assert sum(1 for item in items if item["isDefault"]) == 2  # one default per kind
    kinds = {item["kind"] for item in items}
    assert kinds == {"INVOICE", "RECEIPT"}
    # Second call does not duplicate.
    api_client.get("/api/v1/admin/fees/templates")
    assert InvoiceTemplate.objects.filter(institute=institute).count() == 3


@pytest.mark.django_db
def test_create_update_and_default_switching(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    api_client.get("/api/v1/admin/fees/templates")  # seed

    created = api_client.post(
        "/api/v1/admin/fees/templates",
        {
            "name": "My template",
            "kind": "INVOICE",
            "isDefault": True,
            "layout": {"header": {"title": "TAX INVOICE"}},
        },
        format="json",
    )
    template_id = created.json()["data"]["id"]
    renamed = api_client.patch(
        f"/api/v1/admin/fees/templates/{template_id}", {"name": "Renamed"}, format="json"
    )

    assert created.status_code == 201
    assert renamed.json()["data"]["name"] == "Renamed"
    defaults = InvoiceTemplate.objects.filter(
        institute=institute, kind="INVOICE", is_default=True
    )
    assert list(defaults.values_list("id", flat=True)) == [defaults.first().id]
    assert str(defaults.first().id) == template_id


@pytest.mark.django_db
def test_delete_blocked_for_default_template_and_foreign_access(api_client):
    institute, token = make_admin(api_client)
    other_institute, _ = make_admin(api_client, code="OTHER")
    foreign = InvoiceTemplate.objects.create(
        institute=other_institute, name="Foreign", kind="INVOICE"
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    api_client.get("/api/v1/admin/fees/templates")  # seed
    default = InvoiceTemplate.objects.filter(
        institute=institute, kind="INVOICE", is_default=True
    ).first()
    extra = InvoiceTemplate.objects.create(institute=institute, name="Extra", kind="INVOICE")

    delete_default = api_client.delete(f"/api/v1/admin/fees/templates/{default.id}")
    delete_extra = api_client.delete(f"/api/v1/admin/fees/templates/{extra.id}")
    delete_foreign = api_client.delete(f"/api/v1/admin/fees/templates/{foreign.id}")

    assert delete_default.status_code == 400
    assert delete_extra.status_code == 204
    assert delete_foreign.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_admin_finance_templates.py -v`
Expected: FAIL with 404 (routes missing).

- [ ] **Step 3: Implement `templates_views.py`**

Create `services/api/modules/finance/api/templates_views.py`. The preset layouts use the layout JSON schema shared with the frontend renderer (Task 12) — keep key names identical:

```python
from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.finance.models import InvoiceTemplate
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


def preset_layout(*, title, primary, accent, font, density, columns, note, show_signature):
    return {
        "branding": {
            "mode": "institute",
            "name": "",
            "address": "",
            "phone": "",
            "email": "",
            "logoUrl": "",
            "primary": primary,
            "accent": accent,
        },
        "font": font,
        "density": density,
        "header": {
            "title": title,
            "fields": ["{{invoice_no}}", "{{issue_date}}", "{{due_date}}"],
        },
        "columns": columns,
        "computed": {
            "showSubtotal": True,
            "showDiscount": True,
            "showTax": True,
            "showGrandTotal": True,
        },
        "footer": {"note": note, "showSignature": show_signature},
        "showStudentDetails": True,
    }


PRESETS = [
    {
        "name": "Classic letterhead",
        "kind": InvoiceTemplate.Kind.INVOICE,
        "is_default": True,
        "layout": preset_layout(
            title="FEE INVOICE", primary="#143f5c", accent="#16a085",
            font="Inter", density="comfortable",
            columns=[
                {"id": "description", "label": "Fee description", "width": 44, "align": "left", "enabled": True},
                {"id": "period", "label": "Period", "width": 18, "align": "left", "enabled": True},
                {"id": "qty", "label": "Qty", "width": 10, "align": "center", "enabled": True},
                {"id": "amount", "label": "Amount", "width": 28, "align": "right", "enabled": True},
            ],
            note="This is a computer-generated invoice. Thank you for your prompt payment.",
            show_signature=True,
        ),
    },
    {
        "name": "Modern colour band",
        "kind": InvoiceTemplate.Kind.INVOICE,
        "is_default": False,
        "layout": preset_layout(
            title="FEE INVOICE", primary="#234e52", accent="#d69e2e",
            font="Arial", density="comfortable",
            columns=[
                {"id": "description", "label": "Particulars", "width": 52, "align": "left", "enabled": True},
                {"id": "qty", "label": "Qty", "width": 12, "align": "center", "enabled": True},
                {"id": "amount", "label": "Amount", "width": 36, "align": "right", "enabled": True},
            ],
            note="Please retain this document for your records.",
            show_signature=False,
        ),
    },
    {
        "name": "Compact counter receipt",
        "kind": InvoiceTemplate.Kind.RECEIPT,
        "is_default": True,
        "layout": preset_layout(
            title="FEE RECEIPT", primary="#2d3748", accent="#3182ce",
            font="Arial", density="compact",
            columns=[
                {"id": "description", "label": "Description", "width": 60, "align": "left", "enabled": True},
                {"id": "amount", "label": "Paid amount", "width": 40, "align": "right", "enabled": True},
            ],
            note="Payment received with thanks.",
            show_signature=True,
        ),
    },
]


def seed_presets(request):
    if InvoiceTemplate.objects.filter(institute=request.institute).exists():
        return
    for preset in PRESETS:
        InvoiceTemplate.objects.create(
            institute=request.institute,
            name=preset["name"],
            kind=preset["kind"],
            layout=preset["layout"],
            is_default=preset["is_default"],
            created_by=request.user,
        )


class TemplateSerializer(serializers.ModelSerializer):
    isDefault = serializers.BooleanField(source="is_default", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = InvoiceTemplate
        fields = ("id", "name", "kind", "layout", "isDefault", "createdAt")


class TemplateWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    kind = serializers.ChoiceField(choices=InvoiceTemplate.Kind.choices)
    layout = serializers.JSONField(default=dict)
    isDefault = serializers.BooleanField(default=False)

    def validate_layout(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Layout must be an object.")
        return value


class TemplatePatchSerializer(TemplateWriteSerializer):
    name = serializers.CharField(max_length=120, required=False)
    kind = serializers.ChoiceField(choices=InvoiceTemplate.Kind.choices, required=False)
    layout = serializers.JSONField(required=False)
    isDefault = serializers.BooleanField(required=False)


def make_default(template):
    InvoiceTemplate.objects.filter(
        institute=template.institute, kind=template.kind, is_default=True
    ).exclude(id=template.id).update(is_default=False)
    template.is_default = True


class InvoiceTemplateListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: TemplateSerializer(many=True)})
    def get(self, request):
        seed_presets(request)
        templates = InvoiceTemplate.objects.filter(institute=request.institute)
        kind = request.query_params.get("kind", "").strip().upper()
        if kind in InvoiceTemplate.Kind.values:
            templates = templates.filter(kind=kind)
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=templates, serializer_class=TemplateSerializer
                ),
            }
        )

    @extend_schema(request=TemplateWriteSerializer, responses={status.HTTP_201_CREATED: TemplateSerializer})
    def post(self, request):
        serializer = TemplateWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            template = InvoiceTemplate(
                institute=request.institute,
                name=values["name"],
                kind=values["kind"],
                layout=values["layout"],
                created_by=request.user,
            )
            if values["isDefault"]:
                make_default(template)
            template.save()
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"invoice template '{template.name}'",
            target_type="invoice_template",
            target_id=template.id,
            extra_meta={"kind": template.kind, "isDefault": template.is_default},
        )
        return Response(
            {"success": True, "data": TemplateSerializer(template).data},
            status=status.HTTP_201_CREATED,
        )


class InvoiceTemplateDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: TemplateSerializer})
    def get(self, request, template_id):
        template = get_object_or_404(
            InvoiceTemplate, id=template_id, institute=request.institute
        )
        return Response({"success": True, "data": TemplateSerializer(template).data})

    @extend_schema(request=TemplatePatchSerializer, responses={status.HTTP_200_OK: TemplateSerializer})
    def patch(self, request, template_id):
        serializer = TemplatePatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            template = get_object_or_404(
                InvoiceTemplate.objects.select_for_update(),
                id=template_id,
                institute=request.institute,
            )
            template.name = values.get("name", template.name)
            template.kind = values.get("kind", template.kind)
            template.layout = values.get("layout", template.layout)
            if values.get("isDefault"):
                make_default(template)
            template.save()
        audit_mutation(
            request=request,
            verb="Updated",
            target_label=f"invoice template '{template.name}'",
            target_type="invoice_template",
            target_id=template.id,
            extra_meta={"kind": template.kind, "isDefault": template.is_default},
        )
        return Response({"success": True, "data": TemplateSerializer(template).data})

    def delete(self, request, template_id):
        template = get_object_or_404(
            InvoiceTemplate, id=template_id, institute=request.institute
        )
        if template.is_default:
            raise serializers.ValidationError(
                {"id": ["The default template cannot be deleted. Set another default first."]}
            )
        name = template.name
        template.invoices.update(template=None)
        template.delete()
        audit_mutation(
            request=request,
            verb="Deleted",
            target_label=f"invoice template '{name}'",
            target_type="invoice_template",
            target_id=template_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Mount the routes**

In `admin_urls.py`:

```python
from modules.finance.api.templates_views import (
    InvoiceTemplateDetailView,
    InvoiceTemplateListCreateView,
)
```

```python
    path("fees/templates", InvoiceTemplateListCreateView.as_view(), name="admin-fee-templates"),
    path(
        "fees/templates/<uuid:template_id>",
        InvoiceTemplateDetailView.as_view(),
        name="admin-fee-template-detail",
    ),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_admin_finance_templates.py -v`
Expected: 3 PASSED.

- [ ] **Step 6: Commit**

```bash
git add services/api/modules/finance/api/templates_views.py services/api/modules/institutes/api/admin_urls.py services/api/tests/test_admin_finance_templates.py
git commit -m "feat(finance): invoice template CRUD with per-institute preset seeding"
```

---

### Task 8: Fee plan endpoints

**Files:**
- Create: `services/api/modules/finance/api/plans_views.py`
- Modify: `services/api/modules/institutes/api/admin_urls.py`
- Test: `services/api/tests/test_admin_finance_plans.py`

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_admin_finance_plans.py`:

```python
from datetime import date
from decimal import Decimal

import pytest

from modules.academics.models import Grade
from modules.finance.models import FeeInvoice, FeePlan
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student


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


@pytest.mark.django_db
def test_plan_crud_and_validation(api_client):
    institute, branch, token = make_admin(api_client)
    grade = Grade.objects.create(institute=institute, name="Class 8")
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_grade = Grade.objects.create(institute=other, name="Class 9")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    created = api_client.post(
        "/api/v1/admin/fees/plans",
        {
            "name": "Term 1 fees",
            "academicYear": "2026-27",
            "appliesTo": [str(grade.id)],
            "items": [{"head": "Tuition fee", "amount": "5000.00", "period": "Term 1"}],
        },
        format="json",
    )
    plan_id = created.json()["data"]["id"]
    listed = api_client.get("/api/v1/admin/fees/plans")
    updated = api_client.patch(
        f"/api/v1/admin/fees/plans/{plan_id}",
        {"items": [{"head": "Tuition fee", "amount": "5500.00", "period": "Term 1"}]},
        format="json",
    )
    foreign_class = api_client.post(
        "/api/v1/admin/fees/plans",
        {
            "name": "Bad plan",
            "appliesTo": [str(foreign_grade.id)],
            "items": [{"head": "Fee", "amount": "10.00"}],
        },
        format="json",
    )
    empty_items = api_client.post(
        "/api/v1/admin/fees/plans",
        {"name": "Empty plan", "appliesTo": [], "items": []},
        format="json",
    )

    assert created.status_code == 201
    assert listed.json()["data"]["items"][0]["name"] == "Term 1 fees"
    assert updated.json()["data"]["items"][0]["amount"] == "5500.00"
    assert foreign_class.status_code == 400
    assert empty_items.status_code == 400


@pytest.mark.django_db
def test_plan_delete_is_soft_when_referenced(api_client):
    institute, branch, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    referenced = FeePlan.objects.create(
        institute=institute, name="Used plan", items=[{"head": "Fee", "amount": "10.00"}]
    )
    unreferenced = FeePlan.objects.create(
        institute=institute, name="Unused plan", items=[{"head": "Fee", "amount": "10.00"}]
    )
    student = Student.objects.create(
        institute=institute, branch=branch, admission_number="NSA-0001", first_name="Diya"
    )
    FeeInvoice.objects.create(
        institute=institute, branch=branch, student=student, plan=referenced,
        amount=Decimal("10.00"), total=Decimal("10.00"), due_date=date.today(),
    )

    soft = api_client.delete(f"/api/v1/admin/fees/plans/{referenced.id}")
    hard = api_client.delete(f"/api/v1/admin/fees/plans/{unreferenced.id}")

    assert soft.status_code == 204
    assert hard.status_code == 204
    referenced.refresh_from_db()
    assert referenced.is_active is False
    assert not FeePlan.objects.filter(id=unreferenced.id).exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_admin_finance_plans.py -v`
Expected: FAIL with 404 (routes missing).

- [ ] **Step 3: Implement `plans_views.py`**

Create `services/api/modules/finance/api/plans_views.py`:

```python
from decimal import Decimal

from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import Grade
from modules.finance.models import FeePlan
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


class PlanItemSerializer(serializers.Serializer):
    head = serializers.CharField(max_length=120)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00")
    )
    period = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")


class FeePlanSerializer(serializers.ModelSerializer):
    academicYear = serializers.CharField(source="academic_year", read_only=True)
    appliesTo = serializers.JSONField(source="applies_to", read_only=True)
    isActive = serializers.BooleanField(source="is_active", read_only=True)
    branchId = serializers.UUIDField(source="branch_id", read_only=True)

    class Meta:
        model = FeePlan
        fields = ("id", "name", "academicYear", "appliesTo", "items", "isActive", "branchId")


class FeePlanWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    academicYear = serializers.CharField(
        max_length=16, required=False, allow_blank=True, default=""
    )
    branchId = serializers.UUIDField(required=False, allow_null=True, default=None)
    appliesTo = serializers.ListField(child=serializers.UUIDField(), default=list)
    items = PlanItemSerializer(many=True, allow_empty=False)
    isActive = serializers.BooleanField(default=True)


class FeePlanPatchSerializer(FeePlanWriteSerializer):
    name = serializers.CharField(max_length=120, required=False)
    items = PlanItemSerializer(many=True, allow_empty=False, required=False)
    isActive = serializers.BooleanField(required=False)


def serialize_items(validated_items):
    return [
        {
            "head": item["head"],
            "amount": str(item["amount"]),
            "period": item.get("period", ""),
        }
        for item in validated_items
    ]


def validate_applies_to(request, grade_ids):
    grade_ids = [str(grade_id) for grade_id in grade_ids]
    if not grade_ids:
        return []
    found = Grade.objects.filter(institute=request.institute, id__in=grade_ids).count()
    if found != len(set(grade_ids)):
        raise serializers.ValidationError(
            {"appliesTo": ["One or more classes do not belong to this institute."]}
        )
    return grade_ids


class FeePlanListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: FeePlanSerializer(many=True)})
    def get(self, request):
        plans = FeePlan.objects.filter(institute=request.institute)
        if request.query_params.get("includeInactive") != "true":
            plans = plans.filter(is_active=True)
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=plans, serializer_class=FeePlanSerializer
                ),
            }
        )

    @extend_schema(request=FeePlanWriteSerializer, responses={status.HTTP_201_CREATED: FeePlanSerializer})
    def post(self, request):
        serializer = FeePlanWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        branch = None
        if values["branchId"]:
            branch = get_object_or_404(
                Branch, id=values["branchId"], institute=request.institute, is_active=True
            )
        plan = FeePlan.objects.create(
            institute=request.institute,
            branch=branch,
            name=values["name"],
            academic_year=values["academicYear"],
            applies_to=validate_applies_to(request, values["appliesTo"]),
            items=serialize_items(values["items"]),
            is_active=values["isActive"],
        )
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"fee plan '{plan.name}'",
            target_type="fee_plan",
            target_id=plan.id,
            extra_meta={"itemCount": len(plan.items), "academicYear": plan.academic_year},
        )
        return Response(
            {"success": True, "data": FeePlanSerializer(plan).data},
            status=status.HTTP_201_CREATED,
        )


class FeePlanDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: FeePlanSerializer})
    def get(self, request, plan_id):
        plan = get_object_or_404(FeePlan, id=plan_id, institute=request.institute)
        return Response({"success": True, "data": FeePlanSerializer(plan).data})

    @extend_schema(request=FeePlanPatchSerializer, responses={status.HTTP_200_OK: FeePlanSerializer})
    def patch(self, request, plan_id):
        serializer = FeePlanPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        plan = get_object_or_404(FeePlan, id=plan_id, institute=request.institute)
        plan.name = values.get("name", plan.name)
        if "academicYear" in values:
            plan.academic_year = values["academicYear"]
        if "branchId" in values:
            plan.branch = (
                get_object_or_404(
                    Branch, id=values["branchId"], institute=request.institute, is_active=True
                )
                if values["branchId"]
                else None
            )
        if "appliesTo" in values:
            plan.applies_to = validate_applies_to(request, values["appliesTo"])
        if "items" in values:
            plan.items = serialize_items(values["items"])
        if "isActive" in values:
            plan.is_active = values["isActive"]
        plan.save()
        audit_mutation(
            request=request,
            verb="Updated",
            target_label=f"fee plan '{plan.name}'",
            target_type="fee_plan",
            target_id=plan.id,
            extra_meta={"itemCount": len(plan.items), "isActive": plan.is_active},
        )
        return Response({"success": True, "data": FeePlanSerializer(plan).data})

    def delete(self, request, plan_id):
        plan = get_object_or_404(FeePlan, id=plan_id, institute=request.institute)
        if plan.invoices.exists():
            plan.is_active = False
            plan.save(update_fields=("is_active", "updated_at"))
            action = "deactivated (referenced by invoices)"
        else:
            plan.delete()
            action = "deleted"
        audit_mutation(
            request=request,
            verb="Deleted",
            target_label=f"fee plan '{plan.name}'",
            target_type="fee_plan",
            target_id=plan_id,
            extra_meta={"action": action},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
```

(Drop `"updated_at"` from `update_fields` if `TimeStampedModel` lacks it.)

- [ ] **Step 4: Mount the routes**

```python
from modules.finance.api.plans_views import FeePlanDetailView, FeePlanListCreateView
```

```python
    path("fees/plans", FeePlanListCreateView.as_view(), name="admin-fee-plans"),
    path("fees/plans/<uuid:plan_id>", FeePlanDetailView.as_view(), name="admin-fee-plan-detail"),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_admin_finance_plans.py -v`
Expected: 2 PASSED.

- [ ] **Step 6: Commit**

```bash
git add services/api/modules/finance/api/plans_views.py services/api/modules/institutes/api/admin_urls.py services/api/tests/test_admin_finance_plans.py
git commit -m "feat(finance): fee plan CRUD with class validation and soft delete"
```

---

### Task 9: Summary + dues endpoints

**Files:**
- Create: `services/api/modules/finance/api/insights_views.py`
- Modify: `services/api/modules/institutes/api/admin_urls.py`
- Test: `services/api/tests/test_admin_finance_insights.py`

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_admin_finance_insights.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_admin_finance_insights.py -v`
Expected: FAIL with 404 (routes missing).

- [ ] **Step 3: Implement `insights_views.py`**

Create `services/api/modules/finance/api/insights_views.py`:

```python
from datetime import timedelta
from decimal import Decimal

from django.db.models import DecimalField, F, Min, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import StudentEnrollment
from modules.finance.models import FeeInvoice, FeePayment
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from platform_core.api.pagination import paginate_admin_queryset

OPEN_STATUSES = (FeeInvoice.Status.ISSUED, FeeInvoice.Status.PARTIALLY_PAID)
BILLABLE_STATUSES = (*OPEN_STATUSES, FeeInvoice.Status.PAID)
MONEY = DecimalField(max_digits=12, decimal_places=2)


def validated_branch_id(request):
    branch_id = request.query_params.get("branchId")
    if branch_id:
        get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
    return branch_id


class FeeSummaryView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        today = timezone.localdate()
        month_start = today.replace(day=1)
        branch_id = validated_branch_id(request)

        payments = FeePayment.objects.filter(institute=request.institute)
        open_invoices = FeeInvoice.objects.filter(
            institute=request.institute, status__in=OPEN_STATUSES
        )
        open_payments = payments.filter(invoice__status__in=OPEN_STATUSES)
        if branch_id:
            payments = payments.filter(invoice__branch_id=branch_id)
            open_invoices = open_invoices.filter(branch_id=branch_id)
            open_payments = open_payments.filter(invoice__branch_id=branch_id)

        collected_this_month = payments.filter(paid_at__date__gte=month_start).aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")
        billed_open = open_invoices.aggregate(total=Sum("total"))["total"] or Decimal("0.00")
        paid_open = open_payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        overdue_count = open_invoices.filter(due_date__lt=today).count()
        receipts_today = payments.filter(paid_at__date=today).count()

        # Walk back 11 calendar months so the 12-bucket series ends on the current month.
        series_start = month_start
        for _ in range(11):
            series_start = (series_start - timedelta(days=1)).replace(day=1)
        collected_by_month = {
            row["month"].strftime("%Y-%m"): row["total"]
            for row in (
                payments.filter(paid_at__date__gte=series_start)
                .annotate(month=TruncMonth("paid_at"))
                .values("month")
                .annotate(total=Sum("amount"))
            )
        }
        monthly_series = []
        cursor = series_start
        for _ in range(12):
            key = cursor.strftime("%Y-%m")
            monthly_series.append(
                {"month": key, "collected": str(collected_by_month.get(key, Decimal("0.00")))}
            )
            cursor = (cursor + timedelta(days=32)).replace(day=1)

        return Response(
            {
                "success": True,
                "data": {
                    "collectedThisMonth": str(collected_this_month),
                    "outstandingTotal": str(billed_open - paid_open),
                    "overdueCount": overdue_count,
                    "receiptsToday": receipts_today,
                    "monthlySeries": monthly_series,
                },
            }
        )


class DueRowSerializer(serializers.Serializer):
    studentId = serializers.UUIDField(source="student_id")
    studentName = serializers.SerializerMethodField()
    admissionNumber = serializers.CharField(source="student__admission_number")
    billed = serializers.DecimalField(max_digits=12, decimal_places=2)
    paid = serializers.DecimalField(max_digits=12, decimal_places=2)
    outstanding = serializers.DecimalField(max_digits=12, decimal_places=2)
    daysOverdue = serializers.SerializerMethodField()

    def get_studentName(self, row) -> str:
        return f"{row['student__first_name']} {row['student__last_name']}".strip()

    def get_daysOverdue(self, row) -> int:
        earliest = row["earliest_due"]
        if earliest is None:
            return 0
        return max((timezone.localdate() - earliest).days, 0)


class FeeDuesView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        today = timezone.localdate()
        invoices = FeeInvoice.objects.filter(
            institute=request.institute, status__in=OPEN_STATUSES
        )
        branch_id = validated_branch_id(request)
        if branch_id:
            invoices = invoices.filter(branch_id=branch_id)
        class_id = request.query_params.get("classId")
        if class_id:
            enrolled = StudentEnrollment.objects.filter(
                class_section__grade_id=class_id, left_at__isnull=True
            ).values("student_id")
            invoices = invoices.filter(student_id__in=enrolled)

        paid_per_student = (
            FeePayment.objects.filter(
                institute=request.institute,
                invoice__student_id=OuterRef("student_id"),
                invoice__status__in=OPEN_STATUSES,
            )
            .values("invoice__student_id")
            .annotate(total=Sum("amount"))
            .values("total")[:1]
        )
        rows = (
            invoices.values(
                "student_id",
                "student__first_name",
                "student__last_name",
                "student__admission_number",
            )
            .annotate(
                billed=Sum("total"),
                paid=Coalesce(
                    Subquery(paid_per_student, output_field=MONEY), Value(Decimal("0.00"), MONEY)
                ),
                earliest_due=Min("due_date", filter=Q(due_date__lt=today)),
            )
            .annotate(outstanding=F("billed") - F("paid"))
            .filter(outstanding__gt=0)
            .order_by("-outstanding")
        )
        min_days = request.query_params.get("minDaysOverdue")
        if min_days:
            rows = rows.filter(earliest_due__lte=today - timedelta(days=int(min_days)))
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=rows, serializer_class=DueRowSerializer
                ),
            }
        )
```

Note: `minDaysOverdue` uses `int(min_days)` — wrap in `try/except ValueError` returning a `serializers.ValidationError({"minDaysOverdue": ["Must be a number."]})` if you want belt-and-braces; the tests only send valid values.

- [ ] **Step 4: Mount the routes**

```python
from modules.finance.api.insights_views import FeeDuesView, FeeSummaryView
```

```python
    path("fees/summary", FeeSummaryView.as_view(), name="admin-fee-summary"),
    path("fees/dues", FeeDuesView.as_view(), name="admin-fee-dues"),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_admin_finance_insights.py -v`
Expected: 3 PASSED. If `values()` queryset ordering triggers the pagination fallback warning, that's fine — the queryset is explicitly ordered by `-outstanding`.

- [ ] **Step 6: Commit**

```bash
git add services/api/modules/finance/api/insights_views.py services/api/modules/institutes/api/admin_urls.py services/api/tests/test_admin_finance_insights.py
git commit -m "feat(finance): DB-aggregated fee summary and dues endpoints"
```

---

### Task 10: Finance settings endpoint

**Files:**
- Create: `services/api/modules/finance/api/settings_views.py`
- Modify: `services/api/modules/institutes/api/admin_urls.py`
- Test: `services/api/tests/test_admin_finance_settings.py`

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_admin_finance_settings.py`:

```python
import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from platform_core.models import AuditEvent


def make_admin(api_client, *, code="NSA"):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    Branch.objects.create(
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
    return institute, login.json()["data"]["accessToken"]


@pytest.mark.django_db
def test_settings_get_creates_defaults_and_patch_updates(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    initial = api_client.get("/api/v1/admin/finance/settings")
    updated = api_client.patch(
        "/api/v1/admin/finance/settings",
        {"invoicePrefix": "FEE", "taxLabel": "GST", "taxPercent": "18.00",
         "invoiceFooter": "Pay within 15 days."},
        format="json",
    )
    bad_prefix = api_client.patch(
        "/api/v1/admin/finance/settings", {"invoicePrefix": "no spaces!"}, format="json"
    )
    bad_tax = api_client.patch(
        "/api/v1/admin/finance/settings", {"taxPercent": "180.00"}, format="json"
    )

    assert initial.json()["data"]["invoicePrefix"] == "INV"
    data = updated.json()["data"]
    assert data["invoicePrefix"] == "FEE"
    assert data["taxLabel"] == "GST"
    assert data["taxPercent"] == "18.00"
    assert bad_prefix.status_code == 400
    assert bad_tax.status_code == 400
    assert AuditEvent.objects.filter(
        institute=institute, target_type="finance_settings"
    ).exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_admin_finance_settings.py -v`
Expected: FAIL with 404 (route missing).

- [ ] **Step 3: Implement `settings_views.py`**

Create `services/api/modules/finance/api/settings_views.py`:

```python
from decimal import Decimal

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.finance.models import FinanceSettings
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from platform_core.api.audit import audit_mutation

PREFIX_PATTERN = r"^[A-Z0-9]{1,10}$"


class FinanceSettingsSerializer(serializers.ModelSerializer):
    invoicePrefix = serializers.CharField(source="invoice_prefix", read_only=True)
    receiptPrefix = serializers.CharField(source="receipt_prefix", read_only=True)
    taxLabel = serializers.CharField(source="tax_label", read_only=True)
    taxPercent = serializers.DecimalField(
        source="tax_percent", max_digits=5, decimal_places=2, read_only=True
    )
    invoiceFooter = serializers.CharField(source="invoice_footer", read_only=True)
    receiptFooter = serializers.CharField(source="receipt_footer", read_only=True)

    class Meta:
        model = FinanceSettings
        fields = (
            "invoicePrefix", "receiptPrefix", "taxLabel", "taxPercent",
            "invoiceFooter", "receiptFooter",
        )


class FinanceSettingsWriteSerializer(serializers.Serializer):
    invoicePrefix = serializers.RegexField(PREFIX_PATTERN, required=False)
    receiptPrefix = serializers.RegexField(PREFIX_PATTERN, required=False)
    taxLabel = serializers.CharField(max_length=40, required=False, allow_blank=True)
    taxPercent = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0.00"),
        max_value=Decimal("100.00"), required=False,
    )
    invoiceFooter = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    receiptFooter = serializers.CharField(required=False, allow_blank=True, max_length=2000)


FIELD_MAP = {
    "invoicePrefix": "invoice_prefix",
    "receiptPrefix": "receipt_prefix",
    "taxLabel": "tax_label",
    "taxPercent": "tax_percent",
    "invoiceFooter": "invoice_footer",
    "receiptFooter": "receipt_footer",
}


class FinanceSettingsView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: FinanceSettingsSerializer})
    def get(self, request):
        settings, _ = FinanceSettings.objects.get_or_create(institute=request.institute)
        return Response({"success": True, "data": FinanceSettingsSerializer(settings).data})

    @extend_schema(
        request=FinanceSettingsWriteSerializer,
        responses={status.HTTP_200_OK: FinanceSettingsSerializer},
    )
    def patch(self, request):
        serializer = FinanceSettingsWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        settings, _ = FinanceSettings.objects.get_or_create(institute=request.institute)
        changed = []
        for camel, snake in FIELD_MAP.items():
            if camel in serializer.validated_data:
                setattr(settings, snake, serializer.validated_data[camel])
                changed.append(snake)
        if changed:
            settings.save(update_fields=(*changed, "updated_at"))
        audit_mutation(
            request=request,
            verb="Updated",
            target_label="finance settings",
            target_type="finance_settings",
            target_id=settings.id,
            extra_meta={"changedFields": changed},
        )
        return Response({"success": True, "data": FinanceSettingsSerializer(settings).data})
```

(Drop `"updated_at"` from `update_fields` if `TimeStampedModel` lacks it.)

- [ ] **Step 4: Mount the route (next to `finance/records`, line ~82)**

```python
from modules.finance.api.settings_views import FinanceSettingsView
```

```python
    path("finance/settings", FinanceSettingsView.as_view(), name="admin-finance-settings"),
```

- [ ] **Step 5: Run the full finance backend suite**

Run: `cd services/api && uv run pytest tests/test_finance_services.py tests/test_admin_finance_api.py tests/test_admin_finance_invoices.py tests/test_admin_finance_payments.py tests/test_admin_finance_bulk.py tests/test_admin_finance_templates.py tests/test_admin_finance_plans.py tests/test_admin_finance_insights.py tests/test_admin_finance_settings.py -v`
Expected: all PASS. Backend is complete.

- [ ] **Step 6: Commit**

```bash
git add services/api/modules/finance/api/settings_views.py services/api/modules/institutes/api/admin_urls.py services/api/tests/test_admin_finance_settings.py
git commit -m "feat(finance): per-institute finance settings endpoint"
```

---

### Task 11: Frontend API layer (`finance.api.ts`)

**Files:**
- Create: `apps/institute-admin-web/src/features/finance/finance.api.ts`

- [ ] **Step 1: Write the module**

Create `apps/institute-admin-web/src/features/finance/finance.api.ts`. It mirrors the backend serializers exactly (all money values are strings from the API):

```typescript
import { adminRequest, type PageData } from '../admin/admin.api'

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED'
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'BANK' | 'CHEQUE' | 'OTHER'
export type TemplateKind = 'INVOICE' | 'RECEIPT'

export type InvoiceLineItem = { description: string; period: string; qty: number; amount: string }

export type Invoice = {
  id: string
  invoiceNumber: string
  studentId: string
  studentName: string
  admissionNumber: string
  className: string
  status: InvoiceStatus
  issueDate: string | null
  dueDate: string
  lineItems: InvoiceLineItem[]
  subtotal: string
  discountAmount: string
  taxAmount: string
  total: string
  notes: string
  templateId: string | null
  totalPaid: string
}

export type InvoiceWrite = {
  studentId: string
  issueDate: string
  dueDate: string
  lineItems: InvoiceLineItem[]
  discountAmount: string
  taxAmount: string
  notes: string
  templateId: string | null
  status: 'DRAFT' | 'ISSUED'
}

export type Payment = {
  id: string
  receiptNumber: string
  invoiceId: string
  invoiceNumber: string
  studentId: string
  studentName: string
  admissionNumber: string
  amount: string
  method: PaymentMethod
  reference: string
  remarks: string
  paidAt: string
}

export type DueRow = {
  studentId: string
  studentName: string
  admissionNumber: string
  billed: string
  paid: string
  outstanding: string
  daysOverdue: number
}

export type FeePlanItem = { head: string; amount: string; period: string }

export type FeePlan = {
  id: string
  name: string
  academicYear: string
  appliesTo: string[]
  items: FeePlanItem[]
  isActive: boolean
  branchId: string | null
}

export type TemplateColumn = {
  id: string
  label: string
  width: number
  align: 'left' | 'center' | 'right'
  enabled: boolean
}

export type TemplateLayout = {
  branding: {
    mode: 'institute' | 'custom'
    name: string
    address: string
    phone: string
    email: string
    logoUrl: string
    primary: string
    accent: string
  }
  font: string
  density: 'comfortable' | 'compact'
  header: { title: string; fields: string[] }
  columns: TemplateColumn[]
  computed: { showSubtotal: boolean; showDiscount: boolean; showTax: boolean; showGrandTotal: boolean }
  footer: { note: string; showSignature: boolean }
  showStudentDetails: boolean
}

export type TemplateRecord = {
  id: string
  name: string
  kind: TemplateKind
  layout: Partial<TemplateLayout>
  isDefault: boolean
  createdAt: string
}

export type FinanceSettings = {
  invoicePrefix: string
  receiptPrefix: string
  taxLabel: string
  taxPercent: string
  invoiceFooter: string
  receiptFooter: string
}

export type FeeSummary = {
  collectedThisMonth: string
  outstandingTotal: string
  overdueCount: number
  receiptsToday: number
  monthlySeries: { month: string; collected: string }[]
}

export type InstituteBranding = { name: string; logoUrl: string | null; brandColor: string | null }

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export type InvoiceFilters = {
  page?: number
  pageSize?: number
  branchId?: string
  studentId?: string
  status?: string
  classId?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export function listInvoices(accessToken: string, filters: InvoiceFilters, signal?: AbortSignal) {
  return adminRequest<PageData<Invoice>>(accessToken, `fees/invoices${query(filters)}`, { signal })
}

export function createInvoice(accessToken: string, body: InvoiceWrite) {
  return adminRequest<Invoice>(accessToken, 'fees/invoices', { method: 'POST', body: JSON.stringify(body) })
}

export function patchInvoice(accessToken: string, invoiceId: string, body: Partial<InvoiceWrite> & { status?: InvoiceStatus }) {
  return adminRequest<Invoice>(accessToken, `fees/invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function bulkGenerateInvoices(
  accessToken: string,
  body: { feePlanId: string; classIds: string[]; issueDate: string; dueDate: string; templateId?: string | null },
) {
  return adminRequest<{ created: number; skipped: number }>(accessToken, 'fees/invoices/bulk-generate', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type PaymentFilters = {
  page?: number
  pageSize?: number
  branchId?: string
  studentId?: string
  invoiceId?: string
  method?: string
  dateFrom?: string
  dateTo?: string
  search?: string
}

export function listPayments(accessToken: string, filters: PaymentFilters, signal?: AbortSignal) {
  return adminRequest<PageData<Payment>>(accessToken, `fees/payments${query(filters)}`, { signal })
}

export function recordPayment(
  accessToken: string,
  body: { invoiceId: string; amount: string; method: PaymentMethod; reference?: string; remarks?: string },
) {
  return adminRequest<Payment>(accessToken, 'fees/payments', { method: 'POST', body: JSON.stringify(body) })
}

export function listDues(
  accessToken: string,
  filters: { page?: number; branchId?: string; classId?: string; minDaysOverdue?: number },
  signal?: AbortSignal,
) {
  return adminRequest<PageData<DueRow>>(accessToken, `fees/dues${query(filters)}`, { signal })
}

export function fetchSummary(accessToken: string, branchId?: string, signal?: AbortSignal) {
  return adminRequest<FeeSummary>(accessToken, `fees/summary${query({ branchId })}`, { signal })
}

export function listFeePlans(accessToken: string, includeInactive = false, signal?: AbortSignal) {
  return adminRequest<PageData<FeePlan>>(
    accessToken,
    `fees/plans${query({ includeInactive: includeInactive ? 'true' : '', pageSize: 100 })}`,
    { signal },
  )
}

export function createFeePlan(accessToken: string, body: Omit<FeePlan, 'id' | 'isActive'> & { isActive?: boolean }) {
  return adminRequest<FeePlan>(accessToken, 'fees/plans', { method: 'POST', body: JSON.stringify(body) })
}

export function patchFeePlan(accessToken: string, planId: string, body: Partial<Omit<FeePlan, 'id'>>) {
  return adminRequest<FeePlan>(accessToken, `fees/plans/${planId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteFeePlan(accessToken: string, planId: string) {
  return adminRequest<void>(accessToken, `fees/plans/${planId}`, { method: 'DELETE' })
}

export function listTemplates(accessToken: string, kind?: TemplateKind, signal?: AbortSignal) {
  return adminRequest<PageData<TemplateRecord>>(accessToken, `fees/templates${query({ kind, pageSize: 100 })}`, { signal })
}

export function createTemplate(
  accessToken: string,
  body: { name: string; kind: TemplateKind; layout: Partial<TemplateLayout>; isDefault?: boolean },
) {
  return adminRequest<TemplateRecord>(accessToken, 'fees/templates', { method: 'POST', body: JSON.stringify(body) })
}

export function patchTemplate(
  accessToken: string,
  templateId: string,
  body: Partial<{ name: string; kind: TemplateKind; layout: Partial<TemplateLayout>; isDefault: boolean }>,
) {
  return adminRequest<TemplateRecord>(accessToken, `fees/templates/${templateId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteTemplate(accessToken: string, templateId: string) {
  return adminRequest<void>(accessToken, `fees/templates/${templateId}`, { method: 'DELETE' })
}

export function fetchFinanceSettings(accessToken: string, signal?: AbortSignal) {
  return adminRequest<FinanceSettings>(accessToken, 'finance/settings', { signal })
}

export function patchFinanceSettings(accessToken: string, body: Partial<FinanceSettings>) {
  return adminRequest<FinanceSettings>(accessToken, 'finance/settings', { method: 'PATCH', body: JSON.stringify(body) })
}

/** Institute branding for invoice rendering — reuses the existing institute profile endpoint. */
export function fetchInstituteBranding(accessToken: string, signal?: AbortSignal) {
  return adminRequest<InstituteBranding & Record<string, unknown>>(accessToken, 'institute', { signal })
}

/** Students search for the invoice editor / record-payment flow (existing endpoint). */
export type StudentOption = { id: string; fullName?: string; firstName?: string; lastName?: string; admissionNumber: string }

export function searchStudents(accessToken: string, search: string, signal?: AbortSignal) {
  return adminRequest<PageData<StudentOption>>(accessToken, `students${query({ search, pageSize: 10 })}`, { signal })
}

/** Grades (classes) for fee-plan applicability and invoice filters (existing endpoint). */
export type GradeOption = { id: string; name: string }

export function listGrades(accessToken: string, signal?: AbortSignal) {
  return adminRequest<PageData<GradeOption>>(accessToken, `classes${query({ pageSize: 100 })}`, { signal })
}
```

**Before committing:** verify the three "existing endpoint" paths (`institute`, `students`, `classes`) against `admin_urls.py` and existing usage (e.g. `features/people/` calls, BrandingPage). Adjust paths and the `StudentOption`/`GradeOption` field names to what those endpoints actually return (search for `adminRequest` usages of students/classes to copy the exact response shape).

- [ ] **Step 2: Typecheck**

Run: `cd apps/institute-admin-web && npm run typecheck`
Expected: PASS (no errors in the new file; pre-existing errors elsewhere, if any, are out of scope).

- [ ] **Step 3: Commit**

```bash
git add apps/institute-admin-web/src/features/finance/finance.api.ts
git commit -m "feat(finance-web): typed API layer for the finance suite"
```

---

### Task 12: Shared renderer (`invoiceRender.ts`) with tests

**Files:**
- Create: `apps/institute-admin-web/src/features/finance/invoiceRender.ts`
- Test: `apps/institute-admin-web/src/features/finance/invoiceRender.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/institute-admin-web/src/features/finance/invoiceRender.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { buildDocumentModel, renderDocumentHtml, resolveLayout } from './invoiceRender'
import type { Invoice } from './finance.api'

const invoice: Invoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-2026-0001',
  studentId: 's-1',
  studentName: '<b>Diya</b> & Co',
  admissionNumber: 'NSA-0001',
  className: 'Class 8 A',
  status: 'ISSUED',
  issueDate: '2026-08-12',
  dueDate: '2026-08-27',
  lineItems: [
    { description: 'Tuition <script>alert(1)</script>', period: 'Term 1', qty: 2, amount: '2500.00' },
    { description: 'Library fee', period: '', qty: 1, amount: '300.00' },
  ],
  subtotal: '5300.00',
  discountAmount: '300.00',
  taxAmount: '100.00',
  total: '5100.00',
  notes: '',
  templateId: null,
  totalPaid: '0.00',
}

const branding = { name: 'Northstar Academy', logoUrl: null, brandColor: '#143f5c' }

describe('invoiceRender', () => {
  it('escapes every interpolated value', () => {
    const layout = resolveLayout({})
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;Diya&lt;/b&gt; &amp; Co')
  })

  it('resolves placeholders from the document model', () => {
    const layout = resolveLayout({ header: { title: 'FEE INVOICE', fields: ['{{invoice_no}}', '{{student_name}}'] } })
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).toContain('INV-2026-0001')
    expect(html).toContain('Northstar Academy')
  })

  it('renders computed rows with correct math', () => {
    const layout = resolveLayout({})
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).toContain('5,300.00') // subtotal
    expect(html).toContain('5,100.00') // grand total
  })

  it('uses institute branding when mode is institute', () => {
    const layout = resolveLayout({ branding: { mode: 'institute' } })
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).toContain('#143f5c')
    expect(html).toContain('Northstar Academy')
  })

  it('leaves unknown placeholders blank instead of leaking the token', () => {
    const layout = resolveLayout({ header: { title: 'X', fields: ['{{bogus_token}}'] } })
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).not.toContain('{{bogus_token}}')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/institute-admin-web && npx vitest run src/features/finance/invoiceRender.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `invoiceRender.ts`**

Create `apps/institute-admin-web/src/features/finance/invoiceRender.ts`:

```typescript
import type { Invoice, InstituteBranding, Payment, TemplateLayout } from './finance.api'

/** Single escape point — every dynamic value passes through here before hitting HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character
  ))
}

const money = (value: string | number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(typeof value === 'number' ? value : Number(value || 0))

export const DEFAULT_LAYOUT: TemplateLayout = {
  branding: { mode: 'institute', name: '', address: '', phone: '', email: '', logoUrl: '', primary: '#143f5c', accent: '#16a085' },
  font: 'Inter',
  density: 'comfortable',
  header: { title: 'FEE INVOICE', fields: ['{{invoice_no}}', '{{issue_date}}', '{{due_date}}'] },
  columns: [
    { id: 'description', label: 'Fee description', width: 44, align: 'left', enabled: true },
    { id: 'period', label: 'Period', width: 18, align: 'left', enabled: true },
    { id: 'qty', label: 'Qty', width: 10, align: 'center', enabled: true },
    { id: 'amount', label: 'Amount', width: 28, align: 'right', enabled: true },
  ],
  computed: { showSubtotal: true, showDiscount: true, showTax: true, showGrandTotal: true },
  footer: { note: '', showSignature: true },
  showStudentDetails: true,
}

/** Merge a stored (possibly partial/legacy) layout JSON over the defaults. */
export function resolveLayout(layout: Partial<TemplateLayout> | null | undefined): TemplateLayout {
  const stored = layout ?? {}
  return {
    ...DEFAULT_LAYOUT,
    ...stored,
    branding: { ...DEFAULT_LAYOUT.branding, ...stored.branding },
    header: { ...DEFAULT_LAYOUT.header, ...stored.header },
    computed: { ...DEFAULT_LAYOUT.computed, ...stored.computed },
    footer: { ...DEFAULT_LAYOUT.footer, ...stored.footer },
    columns: stored.columns?.length ? stored.columns : DEFAULT_LAYOUT.columns,
  }
}

export type DocumentModel = {
  kind: 'invoice' | 'receipt'
  placeholders: Record<string, string>
  lineItems: { description: string; period: string; qty: number; amount: string }[]
  subtotal: string
  discountAmount: string
  taxAmount: string
  total: string
  totalPaid: string
  status: string
  institute: { name: string; logoUrl: string; brandColor: string }
  student: { name: string; admissionNumber: string; className: string }
  receipt?: { number: string; amount: string; method: string; reference: string; paidAt: string }
}

export function buildDocumentModel(options: {
  invoice: Invoice
  branding: InstituteBranding
  payment?: Payment
  academicYear?: string
}): DocumentModel {
  const { invoice, branding, payment, academicYear } = options
  return {
    kind: payment ? 'receipt' : 'invoice',
    placeholders: {
      student_name: invoice.studentName,
      admission_no: invoice.admissionNumber,
      class_section: invoice.className,
      invoice_no: invoice.invoiceNumber,
      receipt_no: payment?.receiptNumber ?? '',
      issue_date: invoice.issueDate ?? '',
      due_date: invoice.dueDate,
      academic_year: academicYear ?? '',
      institute_name: branding.name,
      institute_address: '',
    },
    lineItems: invoice.lineItems,
    subtotal: invoice.subtotal,
    discountAmount: invoice.discountAmount,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    totalPaid: invoice.totalPaid,
    status: invoice.status,
    institute: {
      name: branding.name,
      logoUrl: branding.logoUrl ?? '',
      brandColor: branding.brandColor ?? '',
    },
    student: {
      name: invoice.studentName,
      admissionNumber: invoice.admissionNumber,
      className: invoice.className,
    },
    receipt: payment
      ? {
          number: payment.receiptNumber,
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference,
          paidAt: payment.paidAt.slice(0, 10),
        }
      : undefined,
  }
}

/** Replace {{token}} placeholders with escaped values; unknown tokens become ''. */
function substitute(text: string, placeholders: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, token: string) =>
    escapeHtml(placeholders[token] ?? ''),
  )
}

function cellValue(columnId: string, item: DocumentModel['lineItems'][number]): string {
  switch (columnId) {
    case 'description': return escapeHtml(item.description)
    case 'period': return escapeHtml(item.period)
    case 'qty': return String(item.qty)
    case 'amount': return money(Number(item.amount) * item.qty)
    default: return '—'
  }
}

export function renderDocumentHtml(model: DocumentModel, layout: TemplateLayout): string {
  const useInstitute = layout.branding.mode === 'institute'
  const primary = (useInstitute && model.institute.brandColor) || layout.branding.primary
  const accent = layout.branding.accent
  const brandName = useInstitute ? model.institute.name : layout.branding.name || model.institute.name
  const logoUrl = useInstitute ? model.institute.logoUrl : layout.branding.logoUrl
  const columns = layout.columns.filter((column) => column.enabled)
  const isReceipt = model.kind === 'receipt' && model.receipt

  const logo = logoUrl
    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Institute logo" />`
    : `<div class="logo fallback">${escapeHtml(brandName.slice(0, 2).toUpperCase())}</div>`

  const headerMeta = layout.header.fields
    .map((field) => `<p>${substitute(field, model.placeholders)}</p>`)
    .join('')

  const rows = model.lineItems
    .map((item) => `<tr>${columns
      .map((column) => `<td style="text-align:${column.align}">${cellValue(column.id, item)}</td>`)
      .join('')}</tr>`)
    .join('')

  const computedRows: string[] = []
  if (layout.computed.showSubtotal) computedRows.push(`<div><span>Subtotal</span><b>${money(model.subtotal)}</b></div>`)
  if (layout.computed.showDiscount && Number(model.discountAmount) > 0)
    computedRows.push(`<div><span>Discount</span><b>−${money(model.discountAmount)}</b></div>`)
  if (layout.computed.showTax && Number(model.taxAmount) > 0)
    computedRows.push(`<div><span>Tax</span><b>${money(model.taxAmount)}</b></div>`)
  if (layout.computed.showGrandTotal)
    computedRows.push(`<div class="total"><span>Grand total</span><span>${money(model.total)}</span></div>`)
  if (isReceipt && model.receipt)
    computedRows.push(`<div><span>Amount received (${escapeHtml(model.receipt.method)})</span><b>${money(model.receipt.amount)}</b></div>`)
  else if (Number(model.totalPaid) > 0)
    computedRows.push(
      `<div><span>Paid to date</span><b>${money(model.totalPaid)}</b></div>`,
      `<div><span>Balance due</span><b>${money(Math.max(Number(model.total) - Number(model.totalPaid), 0))}</b></div>`,
    )

  const documentNumber = isReceipt && model.receipt ? model.receipt.number : model.placeholders.invoice_no
  const documentDate = isReceipt && model.receipt ? model.receipt.paidAt : model.placeholders.issue_date

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${substitute(layout.header.title, model.placeholders)} ${escapeHtml(documentNumber)}</title><style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}
body{margin:0;color:#1d2939;font-family:${escapeHtml(layout.font)},sans-serif;background:#eef2f6}
.sheet{width:210mm;min-height:267mm;margin:18px auto;padding:${layout.density === 'compact' ? '13mm' : '18mm'};background:#fff;box-shadow:0 8px 32px #0002;position:relative}
.band{height:8px;margin:-18mm -18mm 14mm;background:${escapeHtml(primary)}}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:2px solid ${escapeHtml(accent)}}
.brand{display:flex;gap:14px}
.logo{width:58px;height:58px;object-fit:contain;border-radius:8px}
.fallback{display:grid;place-items:center;color:white;background:${escapeHtml(primary)};font-weight:800}
.brand h1{margin:2px 0 5px;color:${escapeHtml(primary)};font-size:21px}
.brand p,.doc p{margin:2px 0;color:#667085;font-size:11px}
.doc{text-align:right}
.doc h2{margin:0 0 8px;color:${escapeHtml(primary)};font-size:18px;letter-spacing:.08em}
.doc strong{font-size:13px}
.details{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0;padding:14px;background:#f8fafc;border-radius:8px}
.details span{display:block;margin:5px 0;font-size:12px}
.details b{color:#475467;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px}
th{padding:11px 9px;color:white;background:${escapeHtml(primary)};text-align:left}
td{padding:13px 9px;border-bottom:1px solid #e4e7ec}
.summary{width:46%;margin:22px 0 0 auto}
.summary div{display:flex;justify-content:space-between;padding:7px 0;font-size:12px}
.summary .total{margin-top:5px;padding-top:11px;border-top:2px solid ${escapeHtml(accent)};color:${escapeHtml(primary)};font-size:15px;font-weight:800}
.status{display:inline-block;margin-top:12px;padding:6px 10px;border-radius:99px;color:${escapeHtml(primary)};background:#e7f8f3;font-size:11px;font-weight:800}
.signature{width:180px;margin:58px 0 0 auto;border-top:1px solid #98a2b3;padding-top:8px;text-align:center;font-size:11px}
footer{position:absolute;bottom:17mm;left:18mm;right:18mm;padding-top:12px;border-top:1px solid #e4e7ec;color:#667085;text-align:center;font-size:10px}
@media print{body{background:#fff}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.band{margin:-14mm -14mm 12mm}footer{position:fixed;bottom:0;left:0;right:0}}
</style></head><body><main class="sheet"><div class="band"></div>
<header><div class="brand">${logo}<div><h1>${escapeHtml(brandName)}</h1>${
    !useInstitute && layout.branding.address ? `<p>${escapeHtml(layout.branding.address)}</p>` : ''
  }${
    !useInstitute && (layout.branding.phone || layout.branding.email)
      ? `<p>${escapeHtml(layout.branding.phone)}${layout.branding.phone && layout.branding.email ? ' · ' : ''}${escapeHtml(layout.branding.email)}</p>`
      : ''
  }</div></div>
<div class="doc"><h2>${substitute(layout.header.title, model.placeholders)}</h2><strong>#${escapeHtml(documentNumber)}</strong>${headerMeta}<p>${escapeHtml(documentDate)}</p></div></header>
${layout.showStudentDetails ? `<section class="details"><div><b>Bill to</b><span><strong>${escapeHtml(model.student.name)}</strong></span><span>${escapeHtml(model.student.admissionNumber)}${model.student.className ? ` · ${escapeHtml(model.student.className)}` : ''}</span></div><div><b>Payment details</b><span>Due date: ${escapeHtml(model.placeholders.due_date)}</span><span class="status">${escapeHtml(model.status.replace('_', ' '))}</span></div></section>` : ''}
<table><thead><tr>${columns.map((column) => `<th style="width:${column.width}%;text-align:${column.align}">${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
<section class="summary">${computedRows.join('')}</section>
${layout.footer.showSignature ? '<div class="signature">Authorised signature</div>' : ''}
<footer>${escapeHtml(layout.footer.note)}</footer>
</main></body></html>`
}

/** Popup + print, same pattern as StaffPage ID cards. Returns false if the popup was blocked. */
export function openPrintWindow(html: string): boolean {
  const popup = window.open('', '_blank', 'width=900,height=900')
  if (!popup) return false
  popup.opener = null
  popup.document.write(html.replace('</body>', "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body>"))
  popup.document.close()
  return true
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/institute-admin-web && npx vitest run src/features/finance/invoiceRender.test.ts`
Expected: 5 PASSED.

- [ ] **Step 5: Commit**

```bash
git add apps/institute-admin-web/src/features/finance/invoiceRender.ts apps/institute-admin-web/src/features/finance/invoiceRender.test.ts
git commit -m "feat(finance-web): shared template renderer with escaping, placeholders and computed rows"
```

---

### Task 13: Suite shell (sub-sidebar), shared helpers, navigation wiring

**Files:**
- Create: `apps/institute-admin-web/src/features/finance/sections/shared.tsx`
- Rewrite: `apps/institute-admin-web/src/features/finance/FinanceSuitePage.tsx`
- Rewrite: `apps/institute-admin-web/src/features/finance/finance-suite.css`
- Modify: `apps/institute-admin-web/src/adminNavigation.ts` (add dues route)
- Modify: `apps/institute-admin-web/src/App.tsx` (`financeSectionByRoute`, lines ~119-123)
- Modify: `apps/institute-admin-web/src/App.test.tsx`

**Before starting:** Read the current `FinanceSuitePage.tsx` props block and copy its exact prop types (`accessToken`, `branches`, `selectedBranch`, `section`, `onNavigate`) — App.tsx passes these and the contract must not change. Also read the finance entries in `adminNavigation.ts` to match the route-object shape when adding the dues route.

- [ ] **Step 1: Create `sections/shared.tsx`**

```tsx
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AdminApiError } from '../../admin/admin.api'

export const money = (value: string | number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(typeof value === 'number' ? value : Number(value || 0))

export function errorMessage(error: unknown): string {
  if (error instanceof AdminApiError) return error.message
  return 'Something went wrong while loading data.'
}

/** Standard loader: AbortController + revision counter, matching the app-wide pattern. */
export function useAbortableLoad<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    loader(controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setData(result); setLoading(false) } })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(errorMessage(cause))
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision])

  return { data, loading, error, reload }
}

export function StatePanel(props: {
  loading: boolean
  error: string | null
  onRetry: () => void
  empty?: boolean
  emptyMessage?: string
  children: ReactNode
}) {
  if (props.loading) return <div className="fin-state fin-state--loading" role="status">Loading…</div>
  if (props.error) {
    return (
      <div className="fin-state fin-state--error" role="alert">
        <p>{props.error}</p>
        <button type="button" className="fin-btn" onClick={props.onRetry}>Retry</button>
      </div>
    )
  }
  if (props.empty) return <div className="fin-state fin-state--empty">{props.emptyMessage ?? 'Nothing here yet.'}</div>
  return <>{props.children}</>
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`fin-badge fin-badge--${status.toLowerCase()}`}>{status.replace('_', ' ')}</span>
}

export function Pagination(props: { page: number; totalPages: number; onPage: (page: number) => void }) {
  if (props.totalPages <= 1) return null
  return (
    <div className="fin-pagination">
      <button type="button" className="fin-btn" disabled={props.page <= 1} onClick={() => props.onPage(props.page - 1)}>Previous</button>
      <span>Page {props.page} of {props.totalPages}</span>
      <button type="button" className="fin-btn" disabled={props.page >= props.totalPages} onClick={() => props.onPage(props.page + 1)}>Next</button>
    </div>
  )
}
```

If ESLint rejects the spread-deps pattern even with the disable comment, switch `useAbortableLoad` callers to pass a single memoised `key` string instead and use `[key, revision]`.

- [ ] **Step 2: Rewrite `FinanceSuitePage.tsx` as the shell**

Keep the exact same exported component name and props as the current file. Replace the body with:

```tsx
import type { ComponentType } from 'react'
import { BadgeIndianRupee, CalendarClock, FileText, LayoutDashboard, ListChecks, Printer, ReceiptText, Settings2 } from 'lucide-react'
import OverviewSection from './sections/OverviewSection'
import InvoicesSection from './sections/InvoicesSection'
import PaymentsSection from './sections/PaymentsSection'
import DuesSection from './sections/DuesSection'
import FeePlansSection from './sections/FeePlansSection'
import TemplatesSection from './sections/TemplatesSection'
import SettingsSection from './sections/SettingsSection'
import './finance-suite.css'

export type FinanceSection =
  | 'overview' | 'invoices' | 'payments' | 'dues' | 'plans' | 'templates' | 'settings'

// Keep these prop types identical to the previous version of this file (App.tsx contract).
type FinanceSuitePageProps = {
  accessToken: string
  branches: { id: string; name: string }[]
  selectedBranch: { id: string; name: string } | null
  section: FinanceSection
  onNavigate: (path: string) => void
}

const NAV: { section: FinanceSection; label: string; path: string; icon: ComponentType<{ size?: number | string }> }[] = [
  { section: 'overview', label: 'Overview', path: '/finance', icon: LayoutDashboard },
  { section: 'invoices', label: 'Invoices', path: '/finance/invoices', icon: FileText },
  { section: 'payments', label: 'Payments & Receipts', path: '/finance/payments', icon: ReceiptText },
  { section: 'dues', label: 'Dues', path: '/finance/dues', icon: CalendarClock },
  { section: 'plans', label: 'Fee plans', path: '/finance/fee-structure', icon: ListChecks },
  { section: 'templates', label: 'Templates', path: '/finance/invoice-templates', icon: Printer },
  { section: 'settings', label: 'Settings', path: '/finance/settings', icon: Settings2 },
]

const OPERATIONS = [
  { label: 'Expenses', path: '/finance/expenses' },
  { label: 'Payroll', path: '/finance/payroll' },
  { label: 'Budget', path: '/finance/budget' },
  { label: 'Reports', path: '/finance/reports' },
]

export default function FinanceSuitePage({ accessToken, branches, selectedBranch, section, onNavigate }: FinanceSuitePageProps) {
  const branchId = selectedBranch?.id
  const sectionProps = { accessToken, branchId, onNavigate }
  return (
    <div className="fin-suite">
      <nav className="fin-sidebar" aria-label="Finance sections">
        <div className="fin-sidebar__title"><BadgeIndianRupee size={18} /> Finance</div>
        {NAV.map((item) => (
          <button
            key={item.section}
            type="button"
            className={`fin-sidebar__link${section === item.section ? ' is-active' : ''}`}
            onClick={() => onNavigate(item.path)}
          >
            <item.icon size={16} /> {item.label}
          </button>
        ))}
        <div className="fin-sidebar__group">Operations</div>
        {OPERATIONS.map((item) => (
          <button key={item.path} type="button" className="fin-sidebar__link" onClick={() => onNavigate(item.path)}>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="fin-content">
        {section === 'overview' && <OverviewSection {...sectionProps} />}
        {section === 'invoices' && <InvoicesSection {...sectionProps} branches={branches} />}
        {section === 'payments' && <PaymentsSection {...sectionProps} />}
        {section === 'dues' && <DuesSection {...sectionProps} />}
        {section === 'plans' && <FeePlansSection {...sectionProps} />}
        {section === 'templates' && <TemplatesSection {...sectionProps} />}
        {section === 'settings' && <SettingsSection {...sectionProps} />}
      </div>
    </div>
  )
}
```

To keep this task compiling before Tasks 14-19 exist, create **stub files** for all seven sections now; each stub will be replaced by its task:

```tsx
// sections/OverviewSection.tsx (same stub shape for the other six, adjusting the name)
export type FinanceSectionProps = { accessToken: string; branchId?: string; onNavigate: (path: string) => void }
export default function OverviewSection(_props: FinanceSectionProps) {
  return <div className="fin-state fin-state--empty">Coming in a later task.</div>
}
```

Put the canonical `FinanceSectionProps` type in `sections/shared.tsx` instead (add `export type FinanceSectionProps = { accessToken: string; branchId?: string; onNavigate: (path: string) => void }`) and import it in every section, so there is exactly one definition. `InvoicesSection` additionally accepts `branches: { id: string; name: string }[]`.

- [ ] **Step 3: Rewrite `finance-suite.css`**

Replace the whole file with the consolidated stylesheet:

```css
.fin-suite { display: flex; gap: 20px; align-items: flex-start; }
.fin-sidebar { position: sticky; top: 16px; flex: 0 0 208px; display: flex; flex-direction: column; gap: 2px; padding: 12px 8px; background: var(--surface, #fff); border: 1px solid var(--border, #e4e7ec); border-radius: 12px; }
.fin-sidebar__title { display: flex; align-items: center; gap: 8px; padding: 6px 10px 12px; font-weight: 700; font-size: 14px; }
.fin-sidebar__group { margin-top: 12px; padding: 6px 10px 2px; color: #667085; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.fin-sidebar__link { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; border: 0; border-radius: 8px; background: none; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.fin-sidebar__link:hover { background: #f2f4f7; }
.fin-sidebar__link.is-active { background: #eef4ff; color: #1d4ed8; font-weight: 600; }
.fin-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
.fin-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.fin-toolbar input, .fin-toolbar select { padding: 8px 10px; border: 1px solid #d0d5dd; border-radius: 8px; font-size: 13px; }
.fin-btn { padding: 8px 14px; border: 1px solid #d0d5dd; border-radius: 8px; background: #fff; font-size: 13px; cursor: pointer; }
.fin-btn:disabled { opacity: .5; cursor: default; }
.fin-btn--primary { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
.fin-btn--danger { color: #b42318; border-color: #fda29b; }
.fin-card { padding: 16px; background: #fff; border: 1px solid #e4e7ec; border-radius: 12px; }
.fin-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.fin-table th { padding: 10px 12px; border-bottom: 1px solid #e4e7ec; color: #475467; font-size: 12px; text-align: left; }
.fin-table td { padding: 12px; border-bottom: 1px solid #f2f4f7; }
.fin-table td.is-right, .fin-table th.is-right { text-align: right; }
.fin-badge { padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; background: #f2f4f7; }
.fin-badge--draft { background: #f2f4f7; color: #475467; }
.fin-badge--issued { background: #eff8ff; color: #175cd3; }
.fin-badge--partially_paid { background: #fffaeb; color: #b54708; }
.fin-badge--paid { background: #ecfdf3; color: #067647; }
.fin-badge--cancelled { background: #fef3f2; color: #b42318; }
.fin-state { padding: 40px; border: 1px dashed #d0d5dd; border-radius: 12px; text-align: center; color: #667085; font-size: 13px; }
.fin-state--error { border-color: #fda29b; color: #b42318; display: flex; flex-direction: column; gap: 10px; align-items: center; }
.fin-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 12px; font-size: 13px; }
.fin-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.fin-kpi { padding: 16px; background: #fff; border: 1px solid #e4e7ec; border-radius: 12px; }
.fin-kpi b { display: block; margin-top: 6px; font-size: 22px; }
.fin-kpi span { color: #667085; font-size: 12px; }
.fin-chart { display: flex; gap: 6px; align-items: flex-end; height: 140px; padding: 16px; }
.fin-chart .bar { flex: 1; min-height: 2px; border-radius: 4px 4px 0 0; background: #93c5fd; }
.fin-chart .bar span { display: none; }
.fin-editor { display: grid; grid-template-columns: minmax(360px, 1fr) minmax(420px, 1.1fr); gap: 20px; align-items: start; }
.fin-editor__preview { position: sticky; top: 16px; height: calc(100vh - 120px); overflow: auto; border: 1px solid #e4e7ec; border-radius: 12px; background: #eef2f6; }
.fin-editor__preview iframe { width: 100%; height: 100%; border: 0; }
.fin-rows { display: flex; flex-direction: column; gap: 8px; }
.fin-row { display: grid; grid-template-columns: 1fr 110px 64px 110px 32px; gap: 8px; align-items: center; }
.fin-row input { padding: 7px 9px; border: 1px solid #d0d5dd; border-radius: 7px; font-size: 13px; }
.fin-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.fin-form label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: #475467; }
.fin-form label.is-wide { grid-column: 1 / -1; }
.fin-form input, .fin-form select, .fin-form textarea { padding: 8px 10px; border: 1px solid #d0d5dd; border-radius: 8px; font-size: 13px; font-family: inherit; }
.fin-modal-backdrop { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: #10182866; }
.fin-modal { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow: auto; padding: 20px; background: #fff; border-radius: 14px; display: flex; flex-direction: column; gap: 14px; }
.fin-modal h3 { margin: 0; }
.fin-modal__actions { display: flex; justify-content: flex-end; gap: 10px; }
.fin-gallery { display: grid; grid-template-columns: 220px 1fr 1fr; gap: 16px; align-items: start; }
.fin-gallery__list { display: flex; flex-direction: column; gap: 8px; }
.fin-gallery__item { padding: 12px; border: 1px solid #e4e7ec; border-radius: 10px; background: #fff; text-align: left; cursor: pointer; }
.fin-gallery__item.is-active { border-color: #1d4ed8; box-shadow: 0 0 0 1px #1d4ed8; }
.fin-field-error { color: #b42318; font-size: 12px; }
@media (max-width: 1100px) { .fin-editor, .fin-gallery { grid-template-columns: 1fr; } .fin-editor__preview { position: static; height: 480px; } }
```

If the existing `finance-suite.css` contains styles referenced by files that still exist after cleanup (grep `fin-` class prefixes it used), this full replacement is safe because only `FinanceSuitePage.tsx` imported it.

- [ ] **Step 4: Wire navigation**

1. In `adminNavigation.ts`, add a dues route to the finance group, matching the shape of the sibling entries (copy the `FIN1` entry as a model):
   - id `FDU1`, path `/finance/dues`, title `Dues`.
2. In `App.tsx`, update `financeSectionByRoute` (currently lines ~119-123) to:

```typescript
const financeSectionByRoute: Record<string, FinanceSection> = {
  FH1: 'overview',
  FIN1: 'invoices',
  FPY1: 'payments',
  FDU1: 'dues',
  FFS1: 'plans',
  FIT1: 'templates',
  FST1: 'settings',
}
```

Import `FinanceSection` from `./features/finance/FinanceSuitePage`. Remove mappings for any route IDs previously pointing at sections that no longer exist (the old file may have mapped e.g. a "collections" section). `FEX1/FPR1/FBU1/FRP1` continue to render `FinanceModulePage` — do not touch that branch.

- [ ] **Step 5: Update `App.test.tsx`**

Find the finance assertions (search the file for `finance`). Update expectations to the new UI: navigating to Finance should render the sub-sidebar (e.g. assert `screen.getByRole('navigation', { name: 'Finance sections' })` or the `Payments & Receipts` button). Remove/replace assertions that referenced the old pill nav or removed pages (`/fees/collections` expectations per spec §6). Mock `fees/summary` etc. the same way the file mocks other admin fetches (follow the existing fetch-mock pattern in that file).

- [ ] **Step 6: Verify**

Run: `cd apps/institute-admin-web && npm run typecheck && npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/institute-admin-web/src/features/finance/ apps/institute-admin-web/src/adminNavigation.ts apps/institute-admin-web/src/App.tsx apps/institute-admin-web/src/App.test.tsx
git commit -m "feat(finance-web): finance suite shell with sub-sidebar and section routing"
```

---

### Task 14: Invoices section + invoice editor (split editor + live preview)

**Files:**
- Replace stub: `apps/institute-admin-web/src/features/finance/sections/InvoicesSection.tsx`
- Create: `apps/institute-admin-web/src/features/finance/sections/InvoiceEditor.tsx`

- [ ] **Step 1: Implement `InvoiceEditor.tsx`**

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createInvoice, fetchInstituteBranding, listFeePlans, listTemplates, searchStudents,
  type InstituteBranding, type Invoice, type InvoiceLineItem, type FeePlan,
  type StudentOption, type TemplateRecord,
} from '../finance.api'
import { AdminApiError } from '../../admin/admin.api'
import { buildDocumentModel, openPrintWindow, renderDocumentHtml, resolveLayout } from '../invoiceRender'
import { money } from './shared'

type InvoiceEditorProps = {
  accessToken: string
  onClose: (created: boolean) => void
}

const emptyItem = (): InvoiceLineItem => ({ description: '', period: '', qty: 1, amount: '0.00' })
const today = () => new Date().toISOString().slice(0, 10)
const inDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)

export default function InvoiceEditor({ accessToken, onClose }: InvoiceEditorProps) {
  const [studentQuery, setStudentQuery] = useState('')
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([])
  const [student, setStudent] = useState<StudentOption | null>(null)
  const [items, setItems] = useState<InvoiceLineItem[]>([emptyItem()])
  const [discount, setDiscount] = useState('0.00')
  const [tax, setTax] = useState('0.00')
  const [issueDate, setIssueDate] = useState(today())
  const [dueDate, setDueDate] = useState(inDays(15))
  const [notes, setNotes] = useState('')
  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [plans, setPlans] = useState<FeePlan[]>([])
  const [branding, setBranding] = useState<InstituteBranding | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchInstituteBranding(accessToken, controller.signal)
      .then((profile) => setBranding({ name: String(profile.name ?? ''), logoUrl: (profile.logoUrl as string | null) ?? null, brandColor: (profile.brandColor as string | null) ?? null }))
      .catch(() => setBranding({ name: '', logoUrl: null, brandColor: null }))
    listTemplates(accessToken, 'INVOICE', controller.signal)
      .then((page) => {
        setTemplates(page.items)
        const preferred = page.items.find((template) => template.isDefault) ?? page.items[0]
        setTemplateId(preferred?.id ?? null)
      })
      .catch(() => setTemplates([]))
    listFeePlans(accessToken, false, controller.signal)
      .then((page) => setPlans(page.items))
      .catch(() => setPlans([]))
    return () => controller.abort()
  }, [accessToken])

  useEffect(() => {
    if (studentQuery.trim().length < 2) { setStudentOptions([]); return }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchStudents(accessToken, studentQuery.trim(), controller.signal)
        .then((page) => setStudentOptions(page.items))
        .catch(() => setStudentOptions([]))
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [accessToken, studentQuery])

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.amount || 0) * (item.qty || 1), 0),
    [items],
  )
  const total = Math.max(subtotal - Number(discount || 0) + Number(tax || 0), 0)
  const template = templates.find((candidate) => candidate.id === templateId) ?? null

  const previewHtml = useMemo(() => {
    if (!branding) return ''
    const draft: Invoice = {
      id: 'preview', invoiceNumber: '(assigned on save)',
      studentId: student?.id ?? '', studentName: studentLabel(student) || 'Select a student',
      admissionNumber: student?.admissionNumber ?? '', className: '',
      status: 'DRAFT', issueDate, dueDate,
      lineItems: items.filter((item) => item.description.trim()),
      subtotal: subtotal.toFixed(2), discountAmount: Number(discount || 0).toFixed(2),
      taxAmount: Number(tax || 0).toFixed(2), total: total.toFixed(2),
      notes, templateId, totalPaid: '0.00',
    }
    return renderDocumentHtml(buildDocumentModel({ invoice: draft, branding }), resolveLayout(template?.layout))
  }, [branding, student, items, subtotal, discount, tax, total, issueDate, dueDate, notes, template, templateId])

  useEffect(() => {
    previewRef.current?.contentDocument?.open()
    previewRef.current?.contentDocument?.write(previewHtml)
    previewRef.current?.contentDocument?.close()
  }, [previewHtml])

  const applyPlan = (planId: string) => {
    const plan = plans.find((candidate) => candidate.id === planId)
    if (!plan) return
    setItems(plan.items.map((item) => ({ description: item.head, period: item.period, qty: 1, amount: item.amount })))
  }

  const updateItem = (index: number, patch: Partial<InvoiceLineItem>) =>
    setItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)))

  const save = async (status: 'DRAFT' | 'ISSUED', printAfter: boolean) => {
    if (!student) { setError('Select a student first.'); return null }
    const lineItems = items.filter((item) => item.description.trim())
    if (!lineItems.length) { setError('Add at least one line item.'); return null }
    setSaving(true)
    setError(null)
    try {
      const created = await createInvoice(accessToken, {
        studentId: student.id, issueDate, dueDate, lineItems,
        discountAmount: Number(discount || 0).toFixed(2), taxAmount: Number(tax || 0).toFixed(2),
        notes, templateId, status,
      })
      if (printAfter && branding) {
        const printed = openPrintWindow(
          renderDocumentHtml(buildDocumentModel({ invoice: created, branding }), resolveLayout(template?.layout)),
        )
        if (!printed) setError('The invoice was saved, but the print popup was blocked by the browser.')
      }
      return created
    } catch (cause) {
      setError(cause instanceof AdminApiError
        ? Object.values(cause.fieldErrors)[0]?.[0] ?? cause.message
        : 'The invoice could not be saved.')
      return null
    } finally {
      setSaving(false)
    }
  }

  const saveAnd = (status: 'DRAFT' | 'ISSUED', printAfter: boolean, reset: boolean) => {
    void save(status, printAfter).then((created) => {
      if (!created) return
      if (reset) { setStudent(null); setStudentQuery(''); setItems([emptyItem()]); setNotes('') }
      else onClose(true)
    })
  }

  return (
    <div className="fin-editor">
      <div className="fin-card">
        <h3>New invoice</h3>
        {error && <p className="fin-field-error" role="alert">{error}</p>}
        <div className="fin-form">
          <label className="is-wide">Student
            {student ? (
              <span>{studentLabel(student)} ({student.admissionNumber}) <button type="button" className="fin-btn" onClick={() => setStudent(null)}>Change</button></span>
            ) : (
              <>
                <input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Search by name or admission number" />
                {studentOptions.map((option) => (
                  <button key={option.id} type="button" className="fin-btn" onClick={() => { setStudent(option); setStudentOptions([]) }}>
                    {studentLabel(option)} · {option.admissionNumber}
                  </button>
                ))}
              </>
            )}
          </label>
          <label>Issue date<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></label>
          <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          <label>Fee plan (fills line items)
            <select defaultValue="" onChange={(event) => applyPlan(event.target.value)}>
              <option value="">— pick a plan —</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </label>
          <label>Template
            <select value={templateId ?? ''} onChange={(event) => setTemplateId(event.target.value || null)}>
              {templates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
            </select>
          </label>
        </div>
        <h4>Line items</h4>
        <div className="fin-rows">
          {items.map((item, index) => (
            <div className="fin-row" key={index}>
              <input value={item.description} placeholder="Description" onChange={(event) => updateItem(index, { description: event.target.value })} />
              <input value={item.period} placeholder="Period" onChange={(event) => updateItem(index, { period: event.target.value })} />
              <input type="number" min={1} value={item.qty} onChange={(event) => updateItem(index, { qty: Math.max(Number(event.target.value) || 1, 1) })} />
              <input type="number" min={0} step="0.01" value={item.amount} onChange={(event) => updateItem(index, { amount: event.target.value })} />
              <button type="button" className="fin-btn fin-btn--danger" aria-label="Remove row" onClick={() => setItems((current) => current.filter((_, position) => position !== index))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="fin-btn" onClick={() => setItems((current) => [...current, emptyItem()])}>+ Add row</button>
        <div className="fin-form">
          <label>Discount (₹)<input type="number" min={0} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label>
          <label>Tax (₹)<input type="number" min={0} step="0.01" value={tax} onChange={(event) => setTax(event.target.value)} /></label>
          <label className="is-wide">Notes<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>
        <p><b>Subtotal:</b> {money(subtotal)} · <b>Total:</b> {money(total)}</p>
        <div className="fin-modal__actions">
          <button type="button" className="fin-btn" disabled={saving} onClick={() => onClose(false)}>Close</button>
          <button type="button" className="fin-btn" disabled={saving} onClick={() => saveAnd('DRAFT', false, false)}>Save draft</button>
          <button type="button" className="fin-btn" disabled={saving} onClick={() => saveAnd('ISSUED', false, true)}>Save &amp; new</button>
          <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={() => saveAnd('ISSUED', true, false)}>Save &amp; print</button>
        </div>
      </div>
      <div className="fin-editor__preview"><iframe ref={previewRef} title="Invoice preview" /></div>
    </div>
  )
}

function studentLabel(student: StudentOption | null): string {
  if (!student) return ''
  return student.fullName ?? [student.firstName, student.lastName].filter(Boolean).join(' ')
}
```

Adjust `studentLabel`/`StudentOption` to the actual student list response shape verified in Task 11.

- [ ] **Step 2: Implement `InvoicesSection.tsx`**

```tsx
import { useMemo, useState } from 'react'
import {
  bulkGenerateInvoices, fetchInstituteBranding, listFeePlans, listGrades, listInvoices,
  listTemplates, patchInvoice, recordPayment,
  type GradeOption, type Invoice, type FeePlan, type PaymentMethod, type TemplateRecord,
} from '../finance.api'
import { AdminApiError } from '../../admin/admin.api'
import { buildDocumentModel, openPrintWindow, renderDocumentHtml, resolveLayout } from '../invoiceRender'
import InvoiceEditor from './InvoiceEditor'
import { money, Pagination, StatePanel, StatusBadge, useAbortableLoad, type FinanceSectionProps } from './shared'

const METHODS: PaymentMethod[] = ['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'OTHER']

export default function InvoicesSection({ accessToken, branchId, branches }: FinanceSectionProps & { branches: { id: string; name: string }[] }) {
  const [mode, setMode] = useState<'list' | 'editor'>('list')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [search, setSearch] = useState('')
  const [busyMessage, setBusyMessage] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [payFor, setPayFor] = useState<Invoice | null>(null)

  const invoices = useAbortableLoad(
    (signal) => listInvoices(accessToken, { page, branchId, status: statusFilter, classId: classFilter, search }, signal),
    [accessToken, branchId, page, statusFilter, classFilter, search, mode],
  )
  const grades = useAbortableLoad((signal) => listGrades(accessToken, signal), [accessToken])
  const templates = useAbortableLoad((signal) => listTemplates(accessToken, undefined, signal), [accessToken])
  const branding = useAbortableLoad(
    async (signal) => {
      const profile = await fetchInstituteBranding(accessToken, signal)
      return { name: String(profile.name ?? ''), logoUrl: (profile.logoUrl as string | null) ?? null, brandColor: (profile.brandColor as string | null) ?? null }
    },
    [accessToken],
  )

  const templateFor = (invoice: Invoice): TemplateRecord | null => {
    const all = templates.data?.items ?? []
    return all.find((candidate) => candidate.id === invoice.templateId)
      ?? all.find((candidate) => candidate.kind === 'INVOICE' && candidate.isDefault)
      ?? null
  }

  const printInvoice = (invoice: Invoice) => {
    if (!branding.data) return
    const printed = openPrintWindow(
      renderDocumentHtml(buildDocumentModel({ invoice, branding: branding.data }), resolveLayout(templateFor(invoice)?.layout)),
    )
    if (!printed) setBusyMessage('The print popup was blocked by the browser.')
  }

  const cancelInvoice = (invoice: Invoice) => {
    if (!window.confirm(`Cancel invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return
    setBusyMessage(null)
    patchInvoice(accessToken, invoice.id, { status: 'CANCELLED' })
      .then(() => invoices.reload())
      .catch((cause: unknown) => setBusyMessage(cause instanceof AdminApiError ? (cause.fieldErrors.status?.[0] ?? cause.message) : 'Cancel failed.'))
  }

  if (mode === 'editor') {
    return <InvoiceEditor accessToken={accessToken} onClose={(created) => { setMode('list'); if (created) invoices.reload() }} />
  }

  const items = invoices.data?.items ?? []
  return (
    <>
      <div className="fin-toolbar">
        <input value={search} placeholder="Search student, admission no or invoice no" onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}>
          <option value="">All statuses</option>
          {['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'].map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
        </select>
        <select value={classFilter} onChange={(event) => { setClassFilter(event.target.value); setPage(1) }}>
          <option value="">All classes</option>
          {(grades.data?.items ?? []).map((grade: GradeOption) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" className="fin-btn" onClick={() => setBulkOpen(true)}>Bulk generate</button>
        <button type="button" className="fin-btn fin-btn--primary" onClick={() => setMode('editor')}>New invoice</button>
      </div>
      {busyMessage && <p className="fin-field-error" role="alert">{busyMessage}</p>}
      <StatePanel loading={invoices.loading} error={invoices.error} onRetry={invoices.reload}
        empty={!items.length} emptyMessage="No invoices yet — create your first invoice.">
        <div className="fin-card">
          <table className="fin-table">
            <thead><tr>
              <th>Invoice</th><th>Student</th><th>Class</th><th className="is-right">Total</th>
              <th className="is-right">Paid</th><th>Status</th><th>Due date</th><th></th>
            </tr></thead>
            <tbody>
              {items.map((invoice) => (
                <tr key={invoice.id}>
                  <td>{invoice.invoiceNumber}</td>
                  <td>{invoice.studentName}<br /><small>{invoice.admissionNumber}</small></td>
                  <td>{invoice.className || '—'}</td>
                  <td className="is-right">{money(invoice.total)}</td>
                  <td className="is-right">{money(invoice.totalPaid)}</td>
                  <td><StatusBadge status={invoice.status} /></td>
                  <td>{invoice.dueDate}</td>
                  <td>
                    <button type="button" className="fin-btn" onClick={() => printInvoice(invoice)}>Print</button>{' '}
                    {(invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID') && (
                      <button type="button" className="fin-btn" onClick={() => setPayFor(invoice)}>Record payment</button>
                    )}{' '}
                    {invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && (
                      <button type="button" className="fin-btn fin-btn--danger" onClick={() => cancelInvoice(invoice)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={invoices.data?.page ?? 1} totalPages={invoices.data?.totalPages ?? 1} onPage={setPage} />
      </StatePanel>
      {bulkOpen && (
        <BulkGenerateModal
          accessToken={accessToken}
          grades={grades.data?.items ?? []}
          onClose={(generated) => { setBulkOpen(false); if (generated) invoices.reload() }}
        />
      )}
      {payFor && (
        <RecordPaymentModal
          accessToken={accessToken}
          invoice={payFor}
          onClose={(recorded) => { setPayFor(null); if (recorded) invoices.reload() }}
        />
      )}
    </>
  )
}

function BulkGenerateModal({ accessToken, grades, onClose }: {
  accessToken: string
  grades: GradeOption[]
  onClose: (generated: boolean) => void
}) {
  const plans = useAbortableLoad((signal) => listFeePlans(accessToken, false, signal), [accessToken])
  const [planId, setPlanId] = useState('')
  const [classIds, setClassIds] = useState<string[]>([])
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10))
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  const selectedPlan = useMemo(() => plans.data?.items.find((plan: FeePlan) => plan.id === planId), [plans.data, planId])

  const run = () => {
    if (!planId || !classIds.length) { setError('Pick a fee plan and at least one class.'); return }
    setRunning(true)
    setError(null)
    bulkGenerateInvoices(accessToken, { feePlanId: planId, classIds, issueDate, dueDate })
      .then((summary) => setResult(`Created ${summary.created} invoices, skipped ${summary.skipped} already-invoiced students.`))
      .catch((cause: unknown) => setError(cause instanceof AdminApiError ? cause.message : 'Bulk generation failed.'))
      .finally(() => setRunning(false))
  }

  return (
    <div className="fin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="fin-modal">
        <h3>Bulk generate invoices</h3>
        {error && <p className="fin-field-error" role="alert">{error}</p>}
        {result ? (
          <>
            <p>{result}</p>
            <div className="fin-modal__actions"><button type="button" className="fin-btn fin-btn--primary" onClick={() => onClose(true)}>Done</button></div>
          </>
        ) : (
          <>
            <div className="fin-form">
              <label className="is-wide">Fee plan
                <select value={planId} onChange={(event) => {
                  setPlanId(event.target.value)
                  const plan = plans.data?.items.find((candidate: FeePlan) => candidate.id === event.target.value)
                  if (plan?.appliesTo.length) setClassIds(plan.appliesTo)
                }}>
                  <option value="">— pick a plan —</option>
                  {(plans.data?.items ?? []).map((plan: FeePlan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                </select>
              </label>
              <label className="is-wide">Classes
                <select multiple size={6} value={classIds} onChange={(event) => setClassIds(Array.from(event.target.selectedOptions, (option) => option.value))}>
                  {grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
                </select>
              </label>
              <label>Issue date<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></label>
              <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            </div>
            {selectedPlan && <p><small>{selectedPlan.items.map((item) => `${item.head}: ${money(item.amount)}`).join(' · ')}</small></p>}
            <div className="fin-modal__actions">
              <button type="button" className="fin-btn" disabled={running} onClick={() => onClose(false)}>Cancel</button>
              <button type="button" className="fin-btn fin-btn--primary" disabled={running} onClick={run}>{running ? 'Generating…' : 'Generate'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function RecordPaymentModal({ accessToken, invoice, onClose }: {
  accessToken: string
  invoice: Invoice
  onClose: (recorded: boolean) => void
}) {
  const outstanding = Math.max(Number(invoice.total) - Number(invoice.totalPaid), 0)
  const [amount, setAmount] = useState(outstanding.toFixed(2))
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [reference, setReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = () => {
    setSaving(true)
    setError(null)
    recordPayment(accessToken, { invoiceId: invoice.id, amount: Number(amount).toFixed(2), method, reference, remarks })
      .then(() => onClose(true))
      .catch((cause: unknown) => {
        setError(cause instanceof AdminApiError ? (cause.fieldErrors.amount?.[0] ?? cause.message) : 'Payment failed.')
        setSaving(false)
      })
  }

  return (
    <div className="fin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="fin-modal">
        <h3>Record payment — {invoice.invoiceNumber}</h3>
        <p>{invoice.studentName} · outstanding {money(outstanding)}</p>
        {error && <p className="fin-field-error" role="alert">{error}</p>}
        <div className="fin-form">
          <label>Amount<input type="number" min={0.01} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
          <label>Method
            <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>
              {METHODS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>Reference<input value={reference} placeholder="Txn id / cheque no" onChange={(event) => setReference(event.target.value)} /></label>
          <label>Remarks<input value={remarks} onChange={(event) => setRemarks(event.target.value)} /></label>
        </div>
        <div className="fin-modal__actions">
          <button type="button" className="fin-btn" disabled={saving} onClick={() => onClose(false)}>Cancel</button>
          <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Record payment'}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

Run: `cd apps/institute-admin-web && npm run typecheck && npx vitest run`
Expected: typecheck PASS; full frontend suite PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/institute-admin-web/src/features/finance/sections/InvoicesSection.tsx apps/institute-admin-web/src/features/finance/sections/InvoiceEditor.tsx
git commit -m "feat(finance-web): invoices table with filters, bulk generate, cancel; split invoice editor with live preview"
```

---

### Task 15: Payments & receipts section

**Files:**
- Replace stub: `apps/institute-admin-web/src/features/finance/sections/PaymentsSection.tsx`

- [ ] **Step 1: Implement `PaymentsSection.tsx`**

```tsx
import { useState } from 'react'
import { adminRequest } from '../../admin/admin.api'
import {
  fetchInstituteBranding, listInvoices, listPayments, listTemplates, searchStudents,
  type Invoice, type Payment, type StudentOption, type TemplateRecord,
} from '../finance.api'
import { buildDocumentModel, openPrintWindow, renderDocumentHtml, resolveLayout } from '../invoiceRender'
import { RecordPaymentModal } from './InvoicesSection'
import { money, Pagination, StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

export default function PaymentsSection({ accessToken, branchId }: FinanceSectionProps) {
  const [page, setPage] = useState(1)
  const [method, setMethod] = useState('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [payFor, setPayFor] = useState<Invoice | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const payments = useAbortableLoad(
    (signal) => listPayments(accessToken, { page, branchId, method, search, dateFrom, dateTo }, signal),
    [accessToken, branchId, page, method, search, dateFrom, dateTo],
  )
  const templates = useAbortableLoad((signal) => listTemplates(accessToken, 'RECEIPT', signal), [accessToken])
  const branding = useAbortableLoad(
    async (signal) => {
      const profile = await fetchInstituteBranding(accessToken, signal)
      return { name: String(profile.name ?? ''), logoUrl: (profile.logoUrl as string | null) ?? null, brandColor: (profile.brandColor as string | null) ?? null }
    },
    [accessToken],
  )

  const printReceipt = async (payment: Payment) => {
    if (!branding.data) return
    setNotice(null)
    try {
      // Receipt rendering needs the invoice's line items and student class.
      const invoice = await adminRequest<Invoice>(accessToken, `fees/invoices/${payment.invoiceId}`)
      const receiptTemplate: TemplateRecord | undefined =
        templates.data?.items.find((candidate) => candidate.isDefault) ?? templates.data?.items[0]
      const printed = openPrintWindow(
        renderDocumentHtml(
          buildDocumentModel({ invoice, branding: branding.data, payment }),
          resolveLayout(receiptTemplate?.layout),
        ),
      )
      if (!printed) setNotice('The print popup was blocked by the browser.')
    } catch {
      setNotice('Could not load the invoice for this receipt.')
    }
  }

  const items = payments.data?.items ?? []
  return (
    <>
      <div className="fin-toolbar">
        <input value={search} placeholder="Search student or receipt no" onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
        <select value={method} onChange={(event) => { setMethod(event.target.value); setPage(1) }}>
          <option value="">All methods</option>
          {['CASH', 'UPI', 'CARD', 'BANK', 'CHEQUE', 'OTHER'].map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1) }} />
        <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1) }} />
        <span style={{ flex: 1 }} />
        <button type="button" className="fin-btn fin-btn--primary" onClick={() => setPickerOpen(true)}>Record payment</button>
      </div>
      {notice && <p className="fin-field-error" role="alert">{notice}</p>}
      <StatePanel loading={payments.loading} error={payments.error} onRetry={payments.reload}
        empty={!items.length} emptyMessage="No payments recorded yet.">
        <div className="fin-card">
          <table className="fin-table">
            <thead><tr><th>Receipt</th><th>Student</th><th>Invoice</th><th className="is-right">Amount</th><th>Method</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {items.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.receiptNumber}</td>
                  <td>{payment.studentName}<br /><small>{payment.admissionNumber}</small></td>
                  <td>{payment.invoiceNumber}</td>
                  <td className="is-right">{money(payment.amount)}</td>
                  <td>{payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</td>
                  <td>{payment.paidAt.slice(0, 10)}</td>
                  <td><button type="button" className="fin-btn" onClick={() => void printReceipt(payment)}>Print receipt</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={payments.data?.page ?? 1} totalPages={payments.data?.totalPages ?? 1} onPage={setPage} />
      </StatePanel>
      {pickerOpen && (
        <InvoicePickerModal
          accessToken={accessToken}
          onPick={(invoice) => { setPickerOpen(false); setPayFor(invoice) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
      {payFor && (
        <RecordPaymentModal
          accessToken={accessToken}
          invoice={payFor}
          onClose={(recorded) => { setPayFor(null); if (recorded) payments.reload() }}
        />
      )}
    </>
  )
}

/** Record payment flow: pick a student, then one of their open invoices. */
function InvoicePickerModal({ accessToken, onPick, onClose }: {
  accessToken: string
  onPick: (invoice: Invoice) => void
  onClose: () => void
}) {
  const [studentQuery, setStudentQuery] = useState('')
  const [options, setOptions] = useState<StudentOption[]>([])
  const [student, setStudent] = useState<StudentOption | null>(null)
  const openInvoices = useAbortableLoad(
    async (signal) => {
      if (!student) return null
      const [issued, partial] = await Promise.all([
        listInvoices(accessToken, { studentId: student.id, status: 'ISSUED' }, signal),
        listInvoices(accessToken, { studentId: student.id, status: 'PARTIALLY_PAID' }, signal),
      ])
      return [...issued.items, ...partial.items]
    },
    [accessToken, student],
  )

  const runSearch = (value: string) => {
    setStudentQuery(value)
    if (value.trim().length < 2) { setOptions([]); return }
    searchStudents(accessToken, value.trim())
      .then((pageData) => setOptions(pageData.items))
      .catch(() => setOptions([]))
  }

  return (
    <div className="fin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="fin-modal">
        <h3>Record payment</h3>
        {!student ? (
          <>
            <input value={studentQuery} placeholder="Search student by name or admission number" onChange={(event) => runSearch(event.target.value)} />
            {options.map((option) => (
              <button key={option.id} type="button" className="fin-btn" onClick={() => setStudent(option)}>
                {option.fullName ?? [option.firstName, option.lastName].filter(Boolean).join(' ')} · {option.admissionNumber}
              </button>
            ))}
          </>
        ) : (
          <StatePanel loading={openInvoices.loading} error={openInvoices.error} onRetry={openInvoices.reload}
            empty={!openInvoices.data?.length} emptyMessage="This student has no open invoices.">
            {(openInvoices.data ?? []).map((invoice) => (
              <button key={invoice.id} type="button" className="fin-btn" onClick={() => onPick(invoice)}>
                {invoice.invoiceNumber} · {money(invoice.total)} (paid {money(invoice.totalPaid)}) · due {invoice.dueDate}
              </button>
            ))}
          </StatePanel>
        )}
        <div className="fin-modal__actions">
          {student && <button type="button" className="fin-btn" onClick={() => setStudent(null)}>Back</button>}
          <button type="button" className="fin-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
```

Note: this uses `adminRequest` directly for the invoice detail fetch — alternatively add a `getInvoice(accessToken, id)` wrapper to `finance.api.ts` (preferred; add it and use it here and anywhere else a single invoice is needed).

- [ ] **Step 2: Verify**

Run: `cd apps/institute-admin-web && npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/institute-admin-web/src/features/finance/sections/PaymentsSection.tsx apps/institute-admin-web/src/features/finance/finance.api.ts
git commit -m "feat(finance-web): payments list with filters, record-payment flow and printable receipts"
```

---

### Task 16: Dues section

**Files:**
- Replace stub: `apps/institute-admin-web/src/features/finance/sections/DuesSection.tsx`

- [ ] **Step 1: Implement `DuesSection.tsx`**

```tsx
import { useState } from 'react'
import { listDues, listGrades } from '../finance.api'
import { money, Pagination, StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

export default function DuesSection({ accessToken, branchId }: FinanceSectionProps) {
  const [page, setPage] = useState(1)
  const [classId, setClassId] = useState('')
  const [minDays, setMinDays] = useState('')

  const dues = useAbortableLoad(
    (signal) => listDues(accessToken, {
      page, branchId, classId: classId || undefined,
      minDaysOverdue: minDays ? Number(minDays) : undefined,
    }, signal),
    [accessToken, branchId, page, classId, minDays],
  )
  const grades = useAbortableLoad((signal) => listGrades(accessToken, signal), [accessToken])

  const items = dues.data?.items ?? []
  return (
    <>
      <div className="fin-toolbar">
        <select value={classId} onChange={(event) => { setClassId(event.target.value); setPage(1) }}>
          <option value="">All classes</option>
          {(grades.data?.items ?? []).map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
        </select>
        <select value={minDays} onChange={(event) => { setMinDays(event.target.value); setPage(1) }}>
          <option value="">Any overdue age</option>
          <option value="7">7+ days overdue</option>
          <option value="30">30+ days overdue</option>
          <option value="60">60+ days overdue</option>
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" className="fin-btn" onClick={() => window.print()}>Print list</button>
      </div>
      <StatePanel loading={dues.loading} error={dues.error} onRetry={dues.reload}
        empty={!items.length} emptyMessage="No outstanding dues — everyone is paid up.">
        <div className="fin-card">
          <table className="fin-table">
            <thead><tr><th>Student</th><th>Admission no</th><th className="is-right">Billed</th><th className="is-right">Paid</th><th className="is-right">Outstanding</th><th className="is-right">Days overdue</th></tr></thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.studentId}>
                  <td>{row.studentName}</td>
                  <td>{row.admissionNumber}</td>
                  <td className="is-right">{money(row.billed)}</td>
                  <td className="is-right">{money(row.paid)}</td>
                  <td className="is-right"><b>{money(row.outstanding)}</b></td>
                  <td className="is-right">{row.daysOverdue > 0 ? row.daysOverdue : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={dues.data?.page ?? 1} totalPages={dues.data?.totalPages ?? 1} onPage={setPage} />
      </StatePanel>
    </>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck && npx vitest run`
Expected: PASS.

```bash
git add apps/institute-admin-web/src/features/finance/sections/DuesSection.tsx
git commit -m "feat(finance-web): dues section with class and overdue-age filters"
```

---

### Task 17: Fee plans section

**Files:**
- Replace stub: `apps/institute-admin-web/src/features/finance/sections/FeePlansSection.tsx`

- [ ] **Step 1: Implement `FeePlansSection.tsx`**

```tsx
import { useState } from 'react'
import { AdminApiError } from '../../admin/admin.api'
import {
  createFeePlan, deleteFeePlan, listFeePlans, listGrades, patchFeePlan,
  type FeePlan, type FeePlanItem, type GradeOption,
} from '../finance.api'
import { money, StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

const emptyItem = (): FeePlanItem => ({ head: '', amount: '0.00', period: '' })

export default function FeePlansSection({ accessToken }: FinanceSectionProps) {
  const [editing, setEditing] = useState<FeePlan | 'new' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const plans = useAbortableLoad((signal) => listFeePlans(accessToken, true, signal), [accessToken])
  const grades = useAbortableLoad((signal) => listGrades(accessToken, signal), [accessToken])
  const gradeName = (id: string) => grades.data?.items.find((grade: GradeOption) => grade.id === id)?.name ?? '?'

  const remove = (plan: FeePlan) => {
    if (!window.confirm(`Delete fee plan "${plan.name}"? If invoices reference it, it will be deactivated instead.`)) return
    deleteFeePlan(accessToken, plan.id)
      .then(() => plans.reload())
      .catch((cause: unknown) => setNotice(cause instanceof AdminApiError ? cause.message : 'Delete failed.'))
  }

  const items = plans.data?.items ?? []
  return (
    <>
      <div className="fin-toolbar">
        <span style={{ flex: 1 }} />
        <button type="button" className="fin-btn fin-btn--primary" onClick={() => setEditing('new')}>New fee plan</button>
      </div>
      {notice && <p className="fin-field-error" role="alert">{notice}</p>}
      <StatePanel loading={plans.loading} error={plans.error} onRetry={plans.reload}
        empty={!items.length} emptyMessage="No fee plans yet — create one to enable bulk invoicing.">
        <div className="fin-kpis">
          {items.map((plan) => (
            <div key={plan.id} className="fin-card">
              <b>{plan.name}</b> {!plan.isActive && <span className="fin-badge fin-badge--cancelled">Inactive</span>}
              <p><small>{plan.academicYear || 'No academic year'} · {plan.appliesTo.length ? plan.appliesTo.map(gradeName).join(', ') : 'All classes'}</small></p>
              <ul>
                {plan.items.map((item, index) => (
                  <li key={index}>{item.head} — {money(item.amount)}{item.period ? ` (${item.period})` : ''}</li>
                ))}
              </ul>
              <p><b>Total: {money(plan.items.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</b></p>
              <button type="button" className="fin-btn" onClick={() => setEditing(plan)}>Edit</button>{' '}
              <button type="button" className="fin-btn fin-btn--danger" onClick={() => remove(plan)}>Delete</button>
            </div>
          ))}
        </div>
      </StatePanel>
      {editing && (
        <PlanEditorModal
          accessToken={accessToken}
          plan={editing === 'new' ? null : editing}
          grades={grades.data?.items ?? []}
          onClose={(saved) => { setEditing(null); if (saved) plans.reload() }}
        />
      )}
    </>
  )
}

function PlanEditorModal({ accessToken, plan, grades, onClose }: {
  accessToken: string
  plan: FeePlan | null
  grades: GradeOption[]
  onClose: (saved: boolean) => void
}) {
  const [name, setName] = useState(plan?.name ?? '')
  const [academicYear, setAcademicYear] = useState(plan?.academicYear ?? '')
  const [appliesTo, setAppliesTo] = useState<string[]>(plan?.appliesTo ?? [])
  const [items, setItems] = useState<FeePlanItem[]>(plan?.items.length ? plan.items : [emptyItem()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const updateItem = (index: number, patch: Partial<FeePlanItem>) =>
    setItems((current) => current.map((item, position) => (position === index ? { ...item, ...patch } : item)))

  const submit = () => {
    const cleaned = items.filter((item) => item.head.trim())
    if (!name.trim() || !cleaned.length) { setError('A name and at least one fee head are required.'); return }
    setSaving(true)
    setError(null)
    const body = { name: name.trim(), academicYear, appliesTo, items: cleaned, branchId: null }
    const request = plan
      ? patchFeePlan(accessToken, plan.id, body)
      : createFeePlan(accessToken, body)
    request
      .then(() => onClose(true))
      .catch((cause: unknown) => {
        setError(cause instanceof AdminApiError ? (Object.values(cause.fieldErrors)[0]?.[0] ?? cause.message) : 'Save failed.')
        setSaving(false)
      })
  }

  return (
    <div className="fin-modal-backdrop" role="dialog" aria-modal="true">
      <div className="fin-modal">
        <h3>{plan ? 'Edit fee plan' : 'New fee plan'}</h3>
        {error && <p className="fin-field-error" role="alert">{error}</p>}
        <div className="fin-form">
          <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Academic year<input value={academicYear} placeholder="2026-27" onChange={(event) => setAcademicYear(event.target.value)} /></label>
          <label className="is-wide">Applies to classes
            <select multiple size={5} value={appliesTo} onChange={(event) => setAppliesTo(Array.from(event.target.selectedOptions, (option) => option.value))}>
              {grades.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}
            </select>
          </label>
        </div>
        <h4>Fee heads</h4>
        <div className="fin-rows">
          {items.map((item, index) => (
            <div className="fin-row" key={index} style={{ gridTemplateColumns: '1fr 110px 110px 32px' }}>
              <input value={item.head} placeholder="Fee head (e.g. Tuition fee)" onChange={(event) => updateItem(index, { head: event.target.value })} />
              <input type="number" min={0} step="0.01" value={item.amount} onChange={(event) => updateItem(index, { amount: event.target.value })} />
              <input value={item.period} placeholder="Period" onChange={(event) => updateItem(index, { period: event.target.value })} />
              <button type="button" className="fin-btn fin-btn--danger" aria-label="Remove row" onClick={() => setItems((current) => current.filter((_, position) => position !== index))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="fin-btn" onClick={() => setItems((current) => [...current, emptyItem()])}>+ Add fee head</button>
        <div className="fin-modal__actions">
          <button type="button" className="fin-btn" disabled={saving} onClick={() => onClose(false)}>Cancel</button>
          <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={submit}>{saving ? 'Saving…' : 'Save plan'}</button>
        </div>
      </div>
    </div>
  )
}
```

Note: `createFeePlan`'s parameter type in Task 11 takes `Omit<FeePlan, 'id' | 'isActive'>` — passing `branchId: null` satisfies it; amounts are sent as entered and validated/normalised server-side.

- [ ] **Step 2: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck && npx vitest run`
Expected: PASS.

```bash
git add apps/institute-admin-web/src/features/finance/sections/FeePlansSection.tsx
git commit -m "feat(finance-web): fee plan management with class applicability"
```

---

### Task 18: Template Studio

**Files:**
- Replace stub: `apps/institute-admin-web/src/features/finance/sections/TemplatesSection.tsx`

- [ ] **Step 1: Implement `TemplatesSection.tsx`**

Gallery (left) + structured editor (middle) + live preview (right), using sample data through the shared renderer:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdminApiError } from '../../admin/admin.api'
import {
  createTemplate, deleteTemplate, fetchInstituteBranding, listTemplates, patchTemplate,
  type Invoice, type TemplateKind, type TemplateLayout, type TemplateRecord,
} from '../finance.api'
import { buildDocumentModel, renderDocumentHtml, resolveLayout, DEFAULT_LAYOUT } from '../invoiceRender'
import { StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

const SAMPLE_INVOICE: Invoice = {
  id: 'sample', invoiceNumber: 'INV-2026-0042', studentId: 's', studentName: 'Diya Sharma',
  admissionNumber: 'NSA-0042', className: 'Class 8 A', status: 'ISSUED',
  issueDate: '2026-08-12', dueDate: '2026-08-27',
  lineItems: [
    { description: 'Tuition fee', period: 'Term 1', qty: 1, amount: '5000.00' },
    { description: 'Library fee', period: 'Term 1', qty: 1, amount: '300.00' },
  ],
  subtotal: '5300.00', discountAmount: '300.00', taxAmount: '100.00', total: '5100.00',
  notes: '', templateId: null, totalPaid: '0.00',
}

const PLACEHOLDER_TOKENS = [
  '{{student_name}}', '{{class_section}}', '{{admission_no}}', '{{invoice_no}}', '{{receipt_no}}',
  '{{issue_date}}', '{{due_date}}', '{{academic_year}}', '{{institute_name}}', '{{institute_address}}',
]

export default function TemplatesSection({ accessToken }: FinanceSectionProps) {
  const templates = useAbortableLoad((signal) => listTemplates(accessToken, undefined, signal), [accessToken])
  const branding = useAbortableLoad(
    async (signal) => {
      const profile = await fetchInstituteBranding(accessToken, signal)
      return { name: String(profile.name ?? ''), logoUrl: (profile.logoUrl as string | null) ?? null, brandColor: (profile.brandColor as string | null) ?? null }
    },
    [accessToken],
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ name: string; kind: TemplateKind; layout: TemplateLayout } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const previewRef = useRef<HTMLIFrameElement>(null)

  const items = templates.data?.items ?? []
  const selected = items.find((template) => template.id === selectedId) ?? null

  useEffect(() => {
    if (!selected) { setDraft(null); return }
    setDraft({ name: selected.name, kind: selected.kind, layout: resolveLayout(selected.layout) })
  }, [selectedId, templates.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const previewHtml = useMemo(() => {
    if (!draft || !branding.data) return ''
    return renderDocumentHtml(
      buildDocumentModel({ invoice: SAMPLE_INVOICE, branding: branding.data, academicYear: '2026-27' }),
      draft.layout,
    )
  }, [draft, branding.data])

  useEffect(() => {
    previewRef.current?.contentDocument?.open()
    previewRef.current?.contentDocument?.write(previewHtml)
    previewRef.current?.contentDocument?.close()
  }, [previewHtml])

  const patchDraftLayout = (patch: Partial<TemplateLayout>) =>
    setDraft((current) => (current ? { ...current, layout: { ...current.layout, ...patch } } : current))

  const run = (action: Promise<unknown>, then?: () => void) => {
    setSaving(true)
    setNotice(null)
    action
      .then(() => { templates.reload(); then?.() })
      .catch((cause: unknown) => setNotice(cause instanceof AdminApiError ? (Object.values(cause.fieldErrors)[0]?.[0] ?? cause.message) : 'The action failed.'))
      .finally(() => setSaving(false))
  }

  const createNew = () => run(
    createTemplate(accessToken, { name: 'Untitled template', kind: 'INVOICE', layout: DEFAULT_LAYOUT }),
  )
  const duplicate = (template: TemplateRecord) => run(
    createTemplate(accessToken, { name: `${template.name} (copy)`, kind: template.kind, layout: template.layout }),
  )
  const saveSelected = () => {
    if (!selected || !draft) return
    run(patchTemplate(accessToken, selected.id, { name: draft.name, kind: draft.kind, layout: draft.layout }))
  }
  const setDefault = (template: TemplateRecord) => run(patchTemplate(accessToken, template.id, { isDefault: true }))
  const removeTemplate = (template: TemplateRecord) => {
    if (!window.confirm(`Delete template "${template.name}"?`)) return
    run(deleteTemplate(accessToken, template.id), () => setSelectedId(null))
  }

  return (
    <StatePanel loading={templates.loading || branding.loading} error={templates.error ?? branding.error} onRetry={() => { templates.reload(); branding.reload() }}>
      {notice && <p className="fin-field-error" role="alert">{notice}</p>}
      <div className="fin-gallery">
        <div className="fin-gallery__list">
          <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={createNew}>+ New template</button>
          {items.map((template) => (
            <button key={template.id} type="button"
              className={`fin-gallery__item${template.id === selectedId ? ' is-active' : ''}`}
              onClick={() => setSelectedId(template.id)}>
              <b>{template.name}</b>{template.isDefault ? ' ★' : ''}<br />
              <small>{template.kind}</small>
            </button>
          ))}
        </div>
        {draft && selected ? (
          <div className="fin-card">
            <div className="fin-form">
              <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Kind
                <select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as TemplateKind })}>
                  <option value="INVOICE">Invoice</option>
                  <option value="RECEIPT">Receipt</option>
                </select>
              </label>
              <label>Title<input value={draft.layout.header.title} onChange={(event) => patchDraftLayout({ header: { ...draft.layout.header, title: event.target.value } })} /></label>
              <label>Branding
                <select value={draft.layout.branding.mode} onChange={(event) => patchDraftLayout({ branding: { ...draft.layout.branding, mode: event.target.value as 'institute' | 'custom' } })}>
                  <option value="institute">Use institute branding</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              {draft.layout.branding.mode === 'custom' && (
                <>
                  <label>Custom name<input value={draft.layout.branding.name} onChange={(event) => patchDraftLayout({ branding: { ...draft.layout.branding, name: event.target.value } })} /></label>
                  <label>Logo URL<input value={draft.layout.branding.logoUrl} onChange={(event) => patchDraftLayout({ branding: { ...draft.layout.branding, logoUrl: event.target.value } })} /></label>
                  <label>Primary colour<input type="color" value={draft.layout.branding.primary} onChange={(event) => patchDraftLayout({ branding: { ...draft.layout.branding, primary: event.target.value } })} /></label>
                  <label>Accent colour<input type="color" value={draft.layout.branding.accent} onChange={(event) => patchDraftLayout({ branding: { ...draft.layout.branding, accent: event.target.value } })} /></label>
                </>
              )}
            </div>
            <h4>Columns</h4>
            <div className="fin-rows">
              {draft.layout.columns.map((column, index) => (
                <div className="fin-row" key={column.id} style={{ gridTemplateColumns: 'auto 1fr 80px auto auto' }}>
                  <input type="checkbox" checked={column.enabled} aria-label={`Show ${column.label}`}
                    onChange={(event) => patchDraftLayout({ columns: draft.layout.columns.map((candidate, position) => position === index ? { ...candidate, enabled: event.target.checked } : candidate) })} />
                  <input value={column.label}
                    onChange={(event) => patchDraftLayout({ columns: draft.layout.columns.map((candidate, position) => position === index ? { ...candidate, label: event.target.value } : candidate) })} />
                  <select value={column.align}
                    onChange={(event) => patchDraftLayout({ columns: draft.layout.columns.map((candidate, position) => position === index ? { ...candidate, align: event.target.value as 'left' | 'center' | 'right' } : candidate) })}>
                    <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </select>
                  <button type="button" className="fin-btn" disabled={index === 0} aria-label="Move up"
                    onClick={() => { const columns = [...draft.layout.columns]; [columns[index - 1], columns[index]] = [columns[index], columns[index - 1]]; patchDraftLayout({ columns }) }}>↑</button>
                  <button type="button" className="fin-btn" disabled={index === draft.layout.columns.length - 1} aria-label="Move down"
                    onClick={() => { const columns = [...draft.layout.columns]; [columns[index + 1], columns[index]] = [columns[index], columns[index + 1]]; patchDraftLayout({ columns }) }}>↓</button>
                </div>
              ))}
            </div>
            <h4>Computed rows</h4>
            {(['showSubtotal', 'showDiscount', 'showTax', 'showGrandTotal'] as const).map((key) => (
              <label key={key} style={{ display: 'block', fontSize: 13 }}>
                <input type="checkbox" checked={draft.layout.computed[key]}
                  onChange={(event) => patchDraftLayout({ computed: { ...draft.layout.computed, [key]: event.target.checked } })} />{' '}
                {key.replace('show', '').replace(/([A-Z])/g, ' $1').trim()}
              </label>
            ))}
            <h4>Header fields</h4>
            <p><small>Placeholders: {PLACEHOLDER_TOKENS.join(' ')}</small></p>
            {draft.layout.header.fields.map((field, index) => (
              <div className="fin-row" key={index} style={{ gridTemplateColumns: '1fr 32px' }}>
                <input value={field} onChange={(event) => patchDraftLayout({ header: { ...draft.layout.header, fields: draft.layout.header.fields.map((candidate, position) => position === index ? event.target.value : candidate) } })} />
                <button type="button" className="fin-btn fin-btn--danger" aria-label="Remove field"
                  onClick={() => patchDraftLayout({ header: { ...draft.layout.header, fields: draft.layout.header.fields.filter((_, position) => position !== index) } })}>×</button>
              </div>
            ))}
            <button type="button" className="fin-btn" onClick={() => patchDraftLayout({ header: { ...draft.layout.header, fields: [...draft.layout.header.fields, ''] } })}>+ Add field</button>
            <h4>Footer</h4>
            <div className="fin-form">
              <label className="is-wide">Note<textarea rows={2} value={draft.layout.footer.note} onChange={(event) => patchDraftLayout({ footer: { ...draft.layout.footer, note: event.target.value } })} /></label>
              <label><input type="checkbox" checked={draft.layout.footer.showSignature} onChange={(event) => patchDraftLayout({ footer: { ...draft.layout.footer, showSignature: event.target.checked } })} /> Signature line</label>
            </div>
            <div className="fin-modal__actions">
              {!selected.isDefault && <button type="button" className="fin-btn" disabled={saving} onClick={() => setDefault(selected)}>Set default</button>}
              <button type="button" className="fin-btn" disabled={saving} onClick={() => duplicate(selected)}>Duplicate</button>
              {!selected.isDefault && <button type="button" className="fin-btn fin-btn--danger" disabled={saving} onClick={() => removeTemplate(selected)}>Delete</button>}
              <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={saveSelected}>{saving ? 'Saving…' : 'Save template'}</button>
            </div>
          </div>
        ) : (
          <div className="fin-state fin-state--empty">Select a template to edit it.</div>
        )}
        <div className="fin-editor__preview"><iframe ref={previewRef} title="Template preview" /></div>
      </div>
    </StatePanel>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck && npx vitest run`
Expected: PASS.

```bash
git add apps/institute-admin-web/src/features/finance/sections/TemplatesSection.tsx
git commit -m "feat(finance-web): template studio with structured editor, institute branding and live preview"
```

---

### Task 19: Overview + settings sections

**Files:**
- Replace stubs: `apps/institute-admin-web/src/features/finance/sections/OverviewSection.tsx`, `apps/institute-admin-web/src/features/finance/sections/SettingsSection.tsx`

- [ ] **Step 1: Implement `OverviewSection.tsx`**

```tsx
import { fetchSummary } from '../finance.api'
import { money, StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

export default function OverviewSection({ accessToken, branchId, onNavigate }: FinanceSectionProps) {
  const summary = useAbortableLoad((signal) => fetchSummary(accessToken, branchId, signal), [accessToken, branchId])

  const series = summary.data?.monthlySeries ?? []
  const peak = Math.max(...series.map((point) => Number(point.collected)), 1)
  return (
    <StatePanel loading={summary.loading} error={summary.error} onRetry={summary.reload}>
      <div className="fin-kpis">
        <div className="fin-kpi"><span>Collected this month</span><b>{money(summary.data?.collectedThisMonth ?? 0)}</b></div>
        <div className="fin-kpi"><span>Outstanding</span><b>{money(summary.data?.outstandingTotal ?? 0)}</b></div>
        <div className="fin-kpi"><span>Overdue invoices</span><b>{summary.data?.overdueCount ?? 0}</b></div>
        <div className="fin-kpi"><span>Receipts today</span><b>{summary.data?.receiptsToday ?? 0}</b></div>
      </div>
      <div className="fin-card">
        <b>Collections — last 12 months</b>
        <div className="fin-chart" role="img" aria-label="Monthly collection chart">
          {series.map((point) => (
            <div key={point.month} className="bar" title={`${point.month}: ${money(point.collected)}`}
              style={{ height: `${Math.max((Number(point.collected) / peak) * 100, 2)}%` }} />
          ))}
        </div>
      </div>
      <div className="fin-toolbar">
        <button type="button" className="fin-btn fin-btn--primary" onClick={() => onNavigate('/finance/invoices')}>New invoice</button>
        <button type="button" className="fin-btn" onClick={() => onNavigate('/finance/payments')}>Record payment</button>
        <button type="button" className="fin-btn" onClick={() => onNavigate('/finance/dues')}>View dues</button>
      </div>
    </StatePanel>
  )
}
```

- [ ] **Step 2: Implement `SettingsSection.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { AdminApiError } from '../../admin/admin.api'
import { fetchFinanceSettings, patchFinanceSettings, type FinanceSettings } from '../finance.api'
import { StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

export default function SettingsSection({ accessToken }: FinanceSectionProps) {
  const settings = useAbortableLoad((signal) => fetchFinanceSettings(accessToken, signal), [accessToken])
  const [form, setForm] = useState<FinanceSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => { if (settings.data) setForm(settings.data) }, [settings.data])

  const update = (patch: Partial<FinanceSettings>) => setForm((current) => (current ? { ...current, ...patch } : current))

  const save = () => {
    if (!form) return
    setSaving(true)
    setNotice(null)
    patchFinanceSettings(accessToken, form)
      .then(() => setNotice('Settings saved.'))
      .catch((cause: unknown) => setNotice(cause instanceof AdminApiError ? (Object.values(cause.fieldErrors)[0]?.[0] ?? cause.message) : 'Save failed.'))
      .finally(() => setSaving(false))
  }

  return (
    <StatePanel loading={settings.loading || !form} error={settings.error} onRetry={settings.reload}>
      {form && (
        <div className="fin-card" style={{ maxWidth: 640 }}>
          <h3>Finance settings</h3>
          {notice && <p role="status">{notice}</p>}
          <div className="fin-form">
            <label>Invoice number prefix<input value={form.invoicePrefix} onChange={(event) => update({ invoicePrefix: event.target.value.toUpperCase() })} /></label>
            <label>Receipt number prefix<input value={form.receiptPrefix} onChange={(event) => update({ receiptPrefix: event.target.value.toUpperCase() })} /></label>
            <label>Tax label<input value={form.taxLabel} placeholder="GST" onChange={(event) => update({ taxLabel: event.target.value })} /></label>
            <label>Default tax %<input type="number" min={0} max={100} step="0.01" value={form.taxPercent} onChange={(event) => update({ taxPercent: event.target.value })} /></label>
            <label className="is-wide">Invoice footer<textarea rows={2} value={form.invoiceFooter} onChange={(event) => update({ invoiceFooter: event.target.value })} /></label>
            <label className="is-wide">Receipt footer<textarea rows={2} value={form.receiptFooter} onChange={(event) => update({ receiptFooter: event.target.value })} /></label>
          </div>
          <div className="fin-modal__actions">
            <button type="button" className="fin-btn fin-btn--primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button>
          </div>
        </div>
      )}
    </StatePanel>
  )
}
```

- [ ] **Step 3: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck && npx vitest run`
Expected: PASS.

```bash
git add apps/institute-admin-web/src/features/finance/sections/OverviewSection.tsx apps/institute-admin-web/src/features/finance/sections/SettingsSection.tsx
git commit -m "feat(finance-web): real-data overview KPIs and persisted finance settings"
```

---

### Task 20: Cleanup — dead pages, BrandingPage fix, localStorage removal, full verification

**Files:**
- Delete: `apps/institute-admin-web/src/features/finance/invoiceTemplates.ts`
- Delete (after verifying no imports): `FinanceWorkspacePage.tsx`, `FinanceOverviewPage.tsx`, `FeeCollectionsPage.tsx`, `FeeStructurePage.tsx` (all under `features/finance/`)
- Modify: `apps/institute-admin-web/src/features/settings/BrandingPage.tsx`
- Modify: `apps/institute-admin-web/src/App.tsx` (remove deleted-page imports/routes)
- Modify: `apps/institute-admin-web/src/adminNavigation.ts` (retitle FFS1 to "Fee plans" if it still says "Fee structure")

- [ ] **Step 1: Find all references to the pages being deleted**

Run from `apps/institute-admin-web/`:
```bash
grep -rn "FinanceWorkspacePage\|FinanceOverviewPage\|FeeCollectionsPage\|FeeStructurePage\|invoiceTemplates" src/
```
For every hit in `App.tsx`/tests: remove the import and re-point the route rendering to `FinanceSuitePage` (the section mapping from Task 13 already covers FFS1 → `plans`). If any file outside `features/finance/` imports `invoiceTemplates.ts`, migrate it to the types in `finance.api.ts`/`invoiceRender.ts` before deleting. Do not delete `FinanceModulePage.tsx`.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/institute-admin-web/src/features/finance/invoiceTemplates.ts apps/institute-admin-web/src/features/finance/FinanceWorkspacePage.tsx apps/institute-admin-web/src/features/finance/FinanceOverviewPage.tsx apps/institute-admin-web/src/features/finance/FeeCollectionsPage.tsx apps/institute-admin-web/src/features/finance/FeeStructurePage.tsx
```

(Skip any path that doesn't exist — check first with `ls`.) Also remove any now-orphaned finance CSS files these pages imported (grep each deleted page's `import './...css'` lines; delete the CSS file only if nothing else imports it).

- [ ] **Step 3: Fix the BrandingPage brand-colour bug**

In `apps/institute-admin-web/src/features/settings/BrandingPage.tsx`, find where the loaded profile is read (search for `primaryColor`). The API serves `brandColor` (see `admin_serializers.py:55`), so the read never matches. Replace every `primaryColor` read/write of the **API profile object** with `brandColor` (keep purely-local variable names if renaming is churn — the key point is that the value loaded from and saved to the API uses the `brandColor` key). Verify against the serializer: read field is `brandColor`, write field is `brandColor` (regex-validated `^#[0-9A-Fa-f]{6}$`).

- [ ] **Step 4: Remove leftover demo-data remnants**

```bash
grep -rn "demoInvoices\|demoPayments\|campusone.finance.invoiceTemplates\|from July" src/
```
Expected: no hits. If any remain, delete them.

- [ ] **Step 5: Full verification**

```bash
cd apps/institute-admin-web && npm run typecheck && npm run lint && npx vitest run
```
Expected: all PASS.

```bash
cd services/api && uv run pytest
```
Expected: full backend suite PASS.

- [ ] **Step 6: Commit**

```bash
git add -A apps/institute-admin-web/src
git commit -m "refactor(finance-web): remove dead finance pages and demo data; fix branding brandColor bug"
```

---

## Post-implementation checklist (manual smoke test)

1. `uv run python manage.py migrate` on a copy of real data — verify backfilled invoice numbers/statuses.
2. In the app: create a fee plan → bulk generate → confirm created/skipped counts and audit log entries (Settings → Audit log).
3. Create a single invoice with the editor — live preview updates, Save & Print opens the popup with institute logo/brand colour.
4. Record a payment → invoice flips to PARTIALLY_PAID/PAID → print the receipt.
5. Templates: edit a preset, set default, verify new invoices use it.
6. Branding page now shows the saved brand colour (bug fix).







