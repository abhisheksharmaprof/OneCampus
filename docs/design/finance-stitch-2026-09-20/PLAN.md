# Finance redesign implementation plan
Date: 2026-09-20
Stitch project: https://stitch.withgoogle.com/projects/16498311491087177751

## Scope and evidence
This is a design deliverable and implementation roadmap, not an app deployment.
Source inspected: FinanceSuitePage.tsx:54-113 (ten sections), finance.api.ts:3-329 (contracts), FinanceModulePage.tsx:59-260 (basic ledgers and four reports), InvoicesSection.tsx:20-154 (list actions), DuesSection.tsx:14-120 (full filtered print), SettingsSection.tsx:6-112, TemplateStudioPage.tsx:15-104, styles/tokens.css.
Visual reference: existing academic-screenshots/classes-sections-after.png. Screenshot is a prior repository capture, not live verification; current CSS tokens were read. MCP generation accepts text and a design-system ID, no screenshot attachment parameter. Screenshot composition is described in DESIGN.md.

## Delivery sequence
1. Inventory existing functionality and source contracts; freeze current blue/white tokens.
2. Feed complete DESIGN.md into a dedicated Stitch design system; generate F01–F36.
3. Verify generated screen inventory, review representative desktop/mobile/print output, record gaps honestly.
4. Implement shared shell, accessible navigation, filters/tables/dialogs/states in React using current styling and API conventions.
5. Implement core billing: invoice detail/draft editing, bulk review/result, student/invoice selection, payment receipt, dues and fee-plan workflows.
6. Integrate shared Document Studio entry/gallery/editor and invoice/receipt printing without duplicating its rendering engine.
7. Redesign expenses/payroll/budget while preserving current basic CRUD; add explicit branch selection for writes.
8. Replace limited-page report calculations with complete server aggregates and export jobs/complete pagination as appropriate.
9. Build proposed domains in separate increments: student statements, concessions/instalments, credits/refunds, reminders, reconciliation, approvals, payroll runs, budget variance.
10. Verify permission/tenant/branch boundaries, financial invariants, accessible responsive interactions, branded multi-page A4 printing and actual runtime behavior before release.

## Required backend work for proposed UI
- Ledger-style adjustment/refund records tied to invoices/payments, approval decisions and immutable audit events; refund eligibility and idempotency.
- Concession awards/allocations and instalment schedules; explicit relationship to invoice balances.
- Reminder drafts/recipient selection/provider delivery status and retries; no fake Send actions.
- Bank import batches/transaction lines/matches; duplicate detection and reconciliation history.
- Payroll run/earnings/deductions/payslip data and approval flow; existing records are not a payroll engine.
- Budget periods/allocations/category actuals and variance aggregation.
- Complete reports with consistent branch/date/academic-year scope and pagination-independent totals.
- Keep Supabase-only persistence; retain Django migrations and update school_platform_schema.sql with database changes.

## Acceptance criteria
Preserve all ten existing sections, six payment methods, invoice status rules, existing fee plans/settings, shared document templates, branding and printing.
No static mock records in the deployed app, no fabricated trends, no totals silently derived from one page.
Cannot cancel invoices with payments; cannot overpay; disable duplicate submissions; server computes authoritative totals.
All writes specify a branch; loading/errors/empty/no-results are distinct; role restrictions apply server-side.
Desktop 1440px, tablet, mobile 390px; visible keyboard focus, readable contrast, labelled controls.
Browser verification includes logo present/absent, long invoices, partial/full payment receipts, print popup blocked, A4 pagination and Save as PDF.
Design samples are fictional. Generated screen count alone does not prove feature completeness or working interactions.

