# Finance Suite Redesign — Design Spec

**Date:** 2026-08-12
**Scope:** `apps/institute-admin-web` (React) + `services/api` (Django)
**Status:** Approved by user (brainstorming session 2026-08-12)

## 1. Goal

Rebuild the Finance tab into a production-grade suite covering fee structures, invoice
generation with configurable templates, fee collection with printable receipts, and dues
tracking — backed by real, secure, tenant-scoped APIs. Remove all demo data and
localStorage-only persistence.

**In scope:** Overview, Invoices, Payments & Receipts, Dues, Fee Plans, Templates, Settings.
**Out of scope (unchanged this release):** Expenses, Payroll, Budget, Reports (kept as-is
under an "Operations" group).

## 2. Current problems (from codebase audit)

1. `FinanceSuitePage.tsx` seeds demo invoices/payments and silently swallows API errors;
   overview numbers ("+12.4% from July", cash-flow bars) are fabricated.
2. Invoice templates persist only to browser localStorage; no backend model.
3. Template studio duplicates branding (own logo upload) instead of importing institute
   branding (`Institute.logo_url`, `brand_color`, `FileAsset` LOGO/LETTERHEAD).
4. `FeeInvoice` model lacks invoice number, status, line items, issue date; `FeePayment`
   lacks method/reference/receipt number; **no payments list endpoint exists**.
5. Invoice numbers are generated client-side (non-unique). Fee structures live in generic
   `AdminRecord` JSON blobs (screen FN1) and never feed invoice creation.
6. Dead/duplicated pages: `FinanceWorkspacePage`, `FinanceOverviewPage`, standalone
   `FeeCollectionsPage` shell; three finance CSS files; FeeStructurePage tab labels
   mismatch content.
7. `BrandingPage.tsx` reads `profile.primaryColor` but the API serves `brandColor` —
   brand color never loads (blocks branding import).
8. No-op buttons: refresh, email invoice, send reminder, finance settings save.

## 3. UX design (approved)

### 3.1 Layout — left sub-sidebar (Option B)

Inside the Finance tab: a slim vertical menu listing sections with icons and badge counts
(e.g. "Dues · 34"), work area to the right. Sections:

- **Overview** — real KPIs (collected this month, outstanding, overdue count, receipts
  today) from `GET fees/summary`; monthly collection chart from real series; quick actions
  (New invoice, Record payment, View dues).
- **Invoices** — paginated table: number, student, class, total, paid, status, due date.
  Filters: status, class, date range, search. Row actions: view/print, record payment,
  cancel (with confirm). "Bulk generate" button.
- **Payments & Receipts** — real list from `GET fees/payments` with date/method/student
  filters; print receipt per row. "Record payment": pick student → shows open invoices →
  allocate payment → print receipt.
- **Dues** — server-computed defaulter list (per student: billed, paid, outstanding, days
  overdue). Filters: class, min days overdue. Print/export via browser print.
- **Fee Plans** — CRUD on `FeePlan` with fee-head line items; shows applicable classes.
  Replaces FeeStructurePage (FN1 screens).
- **Templates** — Template Studio (3.3).
- **Settings** — persisted to backend: invoice number prefix, tax label/%, footer defaults.
- **Operations ▾** — Expenses/Payroll/Budget/Reports group, unchanged.

All routes remain under the existing `adminNavigation.ts` finance route IDs mapped in
`App.tsx`; the sub-sidebar replaces the pill nav in `FinanceSuitePage`.

### 3.2 New Invoice workspace (approved: split editor + live preview)

- Left pane: student search → selecting a student auto-fills line items from the fee plan
  matching their class (editable: add/remove/reorder rows, per-row amount, toggle
  discount %/tax % rows); due date; template selector.
- Right pane: live A4 preview rendering the selected template with institute branding and
  placeholders resolved in real time.
- Actions: **Save draft**, **Save & Print**, **Save & New**.

### 3.3 Template Studio (approved: gallery + structured editor + preview)

- **Left:** template gallery — 3 seeded presets (Classic/Modern/Compact) + user-created;
  actions: set default, duplicate, delete, "+ New". Templates have `kind`:
  INVOICE or RECEIPT.
- **Middle: structured editor** (no freeform formula parsing):
  - Branding: radio — "Use institute branding" (logo + brand color pulled live from
    `GET institute` / LOGO FileAsset) or "Custom" (template-local logo/name/colors stored
    in layout JSON).
  - Column manager: show/hide/rename/reorder line-item columns (#, description, period,
    qty, amount).
  - Computed rows: toggle subtotal, discount %, tax %, grand total.
  - Header fields: placeholder picker inserting tokens — `{{student_name}}`,
    `{{class_section}}`, `{{admission_no}}`, `{{invoice_no}}`, `{{receipt_no}}`,
    `{{issue_date}}`, `{{due_date}}`, `{{academic_year}}`, `{{institute_name}}`,
    `{{institute_address}}`.
  - Footer: notes, terms, signature line.
- **Right:** live preview with sample data.

### 3.4 Printing

Browser print: render invoice/receipt as styled HTML (A4), print via `window.print()` in a
popup — consistent with the existing ID-card pattern (`StaffPage.tsx`). PDF available via
the browser's "Save as PDF". All placeholder values HTML-escaped before injection.

### 3.5 Error handling / empty states

Every fetch: loading skeleton → visible error banner with retry on failure → honest empty
state ("No invoices yet — create your first"). No silent catches. No demo fallback data
anywhere.

## 4. Backend design (approved: Approach B — pragmatic rework)

All under `services/api/modules/finance/`, endpoints mounted at `/api/v1/admin/`.

### 4.1 Model changes

**`FeeInvoice` (extend):**
- `invoice_number` — CharField, unique per institute (DB constraint
  `unique_together(institute, invoice_number)`), server-generated (see 4.3).
- `status` — DRAFT / ISSUED / PARTIALLY_PAID / PAID / CANCELLED; transitions driven by
  payments (recomputed inside the payment transaction) and explicit cancel.
- `issue_date` — DateField.
- `line_items` — JSONField: `[{description, period, qty, amount}]`.
- `subtotal`, `discount_amount`, `tax_amount`, `total` — DecimalField(12,2). Server
  recomputes and validates totals from line items + discount/tax; client math is never
  trusted.
- `notes` — TextField, blank.
- `template` — FK to InvoiceTemplate, nullable, `on_delete=SET_NULL`.
- Indexes: `(institute, status)`, `(institute, student)`, `(institute, due_date)`.

**`FeePayment` (extend):**
- `receipt_number` — unique per institute, server-generated.
- `method` — CASH / UPI / CARD / BANK / CHEQUE / OTHER.
- `reference` — CharField, blank (txn id / cheque no).
- `remarks` — TextField, blank.
- Keeps existing `select_for_update` overpayment guard.
- Indexes: `(institute, paid_at)`, `(invoice)`.

**`InvoiceTemplate` (new):**
- `institute` FK, `name`, `kind` (INVOICE/RECEIPT), `layout` JSONField (columns, computed
  row config, header placeholder tokens, footer, branding mode + optional overrides),
  `is_default` (one default per institute per kind — enforced in save logic),
  `created_by` FK, timestamps. Presets seeded per institute on first GET if none exist.

**`FeePlan` (new):**
- `institute` FK, `branch` FK (nullable), `name`, `academic_year`, `applies_to` JSONField
  (list of class/section identifiers), `items` JSONField
  (`[{head, amount, period}]`), `is_active`, timestamps.

**Migration note:** existing FeeInvoice rows get backfilled invoice numbers (sequence
order by created_at) and `status` derived from payments; `issue_date` defaults to
created_at date.

### 4.2 Endpoints

| Method | Path | Notes |
|---|---|---|
| GET/POST | `fees/invoices` | existing, extended serializer + filters (status, class, date range) |
| GET/PATCH | `fees/invoices/<id>` | edit DRAFT only; cancel via `status: CANCELLED` (blocked if payments exist) |
| POST | `fees/invoices/bulk-generate` | body: feePlanId, classes, dueDate, issueDate → creates invoices for all matching students; **idempotent**: skips students already invoiced for that plan + academic year; returns created/skipped counts |
| GET | `fees/payments` | new — filters: studentId, invoiceId, dateFrom/To, method; paginated |
| POST | `fees/payments` | extended fields; generates receipt_number; updates invoice status in same transaction |
| GET/POST | `fees/templates` | seeds presets on first access |
| GET/PATCH/DELETE | `fees/templates/<id>` | delete blocked for the default template |
| GET/POST | `fees/plans` | |
| GET/PATCH/DELETE | `fees/plans/<id>` | delete = soft (is_active=False) if referenced by invoices |
| GET | `fees/summary` | KPIs: collectedThisMonth, outstandingTotal, overdueCount, receiptsToday, monthlySeries (12 months); computed with DB aggregates, not Python loops |
| GET | `fees/dues` | per-student aggregation: billed, paid, outstanding, maxDaysOverdue; filters: classId, minDaysOverdue; paginated |
| GET/PATCH | `finance/settings` | invoice/receipt number prefixes, tax label + default %, footer defaults (stored in a small `FinanceSettings` model, one row per institute) |

### 4.3 Number generation

Per-institute, per-kind sequence (`FinanceSettings` holds prefix + last sequence values,
or a dedicated sequence row) incremented under `select_for_update` inside the creating
transaction → gapless-enough, collision-free under concurrency. Format:
`{prefix}-{year}-{zero-padded seq}` e.g. `INV-2026-0142`, `RCP-2026-0087`.

### 4.4 Security & production readiness

- **Tenant scoping:** every queryset filtered by `request.institute`; object lookups use
  `get_object_or_404(Model, id=..., institute=request.institute)`. Tests assert
  cross-institute isolation.
- **Permissions:** same admin permission classes as existing finance views
  (`modules/institutes/api/permissions.py` pattern).
- **Validation:** DRF serializers validate line items schema, positive amounts,
  discount/tax bounds (0–100%), due_date ≥ issue_date; totals recomputed server-side.
- **Money:** DecimalField everywhere; no floats.
- **Concurrency:** number generation + payment/status updates in transactions with row
  locks; existing overpayment guard retained.
- **Pagination** on all list endpoints via `paginate_admin_queryset`.
- **Performance:** summary/dues use DB aggregation (`Sum`, `Count`, conditional
  aggregates); `select_related`/`prefetch_related` on list views; indexes per 4.1.
- **XSS:** all placeholder substitutions HTML-escaped client-side before injection into
  print HTML (escape helper lives in `invoiceRender.ts`, moved from `invoiceTemplates.ts`).

### 4.5 Audit logging

Extend the existing `platform_core.AuditEvent` + `audit_mutation` helper (already used in
finance views) to **all** mutations: invoice create/edit/cancel, bulk generate (with
created/skipped counts), payment recorded (receipt number, amount, method), template
create/update/delete, fee plan create/update/deactivate, settings changes, dues list
export/print. Metadata includes entity ids, numbers, and amounts.

## 5. Frontend structure

```
features/finance/
  FinanceSuitePage.tsx      — shell: sub-sidebar + section router (slimmed down)
  finance.api.ts            — typed adminRequest wrappers for all endpoints
  sections/
    OverviewSection.tsx
    InvoicesSection.tsx     — table + filters
    InvoiceEditor.tsx       — split editor + live preview
    PaymentsSection.tsx     — list + record-payment flow
    DuesSection.tsx
    FeePlansSection.tsx
    TemplatesSection.tsx    — Template Studio
    SettingsSection.tsx
  invoiceRender.ts          — template → HTML renderer (shared by preview + print)
  invoiceTemplates.ts       — types only; localStorage persistence removed
  finance-suite.css         — consolidated styles (other finance CSS removed)
```

- State: existing pattern — `useEffect` + `AbortController` + local state + revision
  counter. No new state library.
- API: all calls through `adminRequest`/`adminUpload` from `admin.api.ts`.
- Branding: invoice render resolves branding from `GET institute` (logoUrl, brandColor)
  when template uses institute branding.
- Deletions: `FinanceWorkspacePage.tsx`, `FinanceOverviewPage.tsx`,
  `FeeCollectionsPage.tsx` (superseded), `FeeStructurePage.tsx` (replaced by
  FeePlansSection), `FinanceModulePage.tsx` retained (Operations sections).
- Bug fix: `BrandingPage.tsx` `primaryColor` → `brandColor`.
- Student profile "Fees" tab keeps working (`GET fees/invoices?studentId=` unchanged
  shape, extended fields additive).

## 6. Testing

**Backend (Django tests):**
- Invoice/receipt number uniqueness under concurrent creation.
- Overpayment guard; status transitions (ISSUED → PARTIALLY_PAID → PAID; cancel blocked
  with payments).
- Bulk-generate idempotency (second run creates 0).
- Tenant isolation (institute A cannot read/mutate institute B's data) for every endpoint.
- Summary/dues aggregate correctness.
- Serializer validation (negative amounts, bad discount %, tampered totals rejected).
- Audit events written for each mutation.

**Frontend (existing Vitest/RTL setup):**
- Invoice editor math: subtotal/discount/tax/grand total.
- Placeholder substitution + HTML escaping in `invoiceRender.ts`.
- Section routing via `App.test.tsx` (update `/fees/collections` expectations).
- Error banner + empty state rendering on API failure.

## 7. Rollout order

1. Backend: migrations + models + endpoints + tests.
2. Frontend API layer + shell/sub-sidebar.
3. Sections: Invoices + InvoiceEditor → Payments → Dues → Fee Plans → Templates →
   Overview → Settings.
4. Cleanup (dead pages, CSS consolidation, BrandingPage fix) + test updates.
