# CampusOne Finance UI — source-grounded design specification
## Product and audience
CampusOne is a multi-branch school/institute administration application. Finance users are institute admins and finance staff. Design every existing workflow plus explicitly proposed extensions. Currency INR using Indian grouping (₹1,25,000.00). AY 2026–27. Fictional sample records only, visibly a design preview. Never imply a live payment was sent.
## Existing theme, mandatory
Preserve CampusOne's light institutional blue/white theme. Exact CSS tokens: primary #2e5aac; hover #24478a; canvas #f5f7fa; surface #ffffff; border #e2e6ec; primary text #1a1f2b; secondary #5b6472; success #1e8e5a; warning #b7791f; danger #c4362e; selected blue tint #eaf0fb. Inter throughout. 28px page title, 20px section title, 14px body, 12px caption. 8px controls, 12px cards, 4px spacing scale. Sparse shadows, thin borders, outline icons, compact well-spaced tables, right-aligned tabular money. No dark sidebar, purple rebrand, gradients or giant marketing visuals.
## Visual reference inspected
Existing repository screenshot academic-screenshots/classes-sections-after.png: white 260px app sidebar with CampusOne graduation-cap mark; 56px white topbar; branch dropdown and academic-year selector left, search/notifications/avatar right. Pale gray-blue content canvas, pale blue bordered page header, dark blue heading, white KPI cards with small tinted icon tiles, blue primary CTA and white secondary buttons, subtle blue-bordered rows/cards. This is a description of a screenshot inspected locally; no image attachment is supplied by this text-only MCP.
## Navigation
Preserve global shell and branch/year context. Finance secondary navigation grouped Billing: Overview, Invoices, Payments & Receipts, Dues, Fee Plans; Operations: Expenses, Payroll, Budget, Reports; Administration: Templates, Settings. Templates is a finance entry to the existing shared Document Studio, not a new duplicate engine. Proposed modules sit under More finance tools: Student accounts, Concessions & instalments, Refunds & credits, Reminders, Reconciliation, Approvals. Collapse global sidebar for dense editor; finance nav remains coherent. Mobile 390px uses compact header/drawer, finance selector, stacked cards and full-screen forms.
## Verified existing feature contracts
Overview: collectedThisMonth, outstandingTotal, overdueCount, receiptsToday, monthlySeries; quick navigation.
Invoices: paginated search by student/admission/invoice, status/class filters; API also accepts date range. Fields invoiceNumber, studentName/id, admissionNumber, className, issueDate, dueDate, lineItems [{description,period,qty,amount}], subtotal, discountAmount, taxAmount, total, totalPaid, notes, templateId. Status DRAFT/ISSUED/PARTIALLY_PAID/PAID/CANCELLED. Editor with student search, line items, plan application, template and A4 preview. API allows draft edits; list currently lacks clear draft edit/detail UX. Cancel blocked if payments exist. Keep amounts server-authoritative.
Bulk invoices: feePlanId, classIds, issueDate, dueDate, templateId, created/skipped result; show duplicate protection and review.
Payments: paginated history, student/invoice search, method/date filters; record against selected issued/part-paid invoice; amount, method CASH/UPI/CARD/BANK/CHEQUE/OTHER, reference, remarks. Prevent overpayment and double submit, receipt number after success. Manual recording is not a payment gateway.
Dues: per student billed/paid/outstanding/daysOverdue; class/min-days filters; print ALL filtered pages, not just current page.
Fee plans: name, academicYear, branchId, appliesTo classes, items [{head,amount,period}], isActive; create/edit/deactivate.
Expenses/payroll/budget: currently basic branch-scoped finance records with title/category/amount/entryDate/status Draft/Pending/Approved/Paid/notes. Separate lists, create/edit/delete confirmation, search/status filter and totals. Do not misrepresent these as existing payroll calculation or budget variance engines.
Reports: Collections, Receivables, Tax summary, Income & expense. Current implementation partly aggregates first 100 loaded rows and dues page; redesign requires full filtered dataset, clear coverage/date labels and accurate server totals.
Settings: invoicePrefix, receiptPrefix, taxLabel, taxPercent, invoiceFooter, receiptFooter; save, validation, saved state.
Documents: existing shared template gallery/editor, invoice/receipt categories, presets, custom layout, default/duplicate/delete; drag-and-drop, merge fields, formulas, QR where supported by shared engine. Institute name/logo/brand/address/contact/registration fields feed print. A4 clean invoice and receipt, logo fallback, long multipage tables, subtotal/discount/tax/paid/balance, footer/signature, browser print and Save as PDF.
## Proposed capabilities requiring development
Student statement with transaction timeline and invoices/receipts; concessions/scholarships with reason/approval and allocations; instalment schedules; refunds and credit notes with remaining eligible amount and linked original payment/invoice; reminder drafts/schedules/delivery history with recipient review; bank reconciliation with import preview/duplicate detection/matching/unmatched records; approvals with history and separation of requester/approver; richer expense vendor/attachment flow; payroll run review with earnings/deductions/payslips; budget planned/actual/variance. Design these but label proposal status in handoff, not as already working.
## Interaction and state requirements
Every list: search/filter summary, clear filters, pagination, row actions, loading skeleton, true empty and no-results states, API failure/retry, permission-denied. Every form: visible labels, required indicators, inline validation, pending/success, unsaved-change protection; confirmations for cancel/delete/refund. Branch must be explicitly selected for writes when scope is All branches. Never silently assign first branch. Accessible focus, keyboard navigation, semantic tabs, minimum 44px touch targets, status text plus color. Never fabricate percentage trends or totals from current page. Future backend requirements live in design notes rather than technical jargon in product UI.
## Screen inventory (each must be a distinct screen with this ID/title)
F01 Overview
F02 Invoice register
F03 New/edit draft invoice split editor
F04 Invoice detail and payment history
F05 Bulk invoice wizard review and result
F06 Payments and receipts register
F07 Collect payment student/invoice selection and recording
F08 Receipt detail and print preview
F09 Dues and ageing
F10 Student account statement [proposed]
F11 Fee plans
F12 Fee plan editor
F13 Expenses ledger
F14 Expense create/edit/detail (preserve basic fields; vendor/attachment proposed)
F15 Payroll ledger and run overview (run workflow proposed)
F16 Payroll run review and payslip (proposed)
F17 Budget ledger
F18 Budget allocation and variance (proposed)
F19 Reports — Collections
F20 Reports — Receivables
F21 Reports — Tax summary
F22 Reports — Income and expense
F23 Finance settings
F24 Invoice and receipt template gallery
F25 Shared template editor with A4 preview
F26 Branded A4 invoice print output
F27 Branded A4 payment receipt print output
F28 Concessions and instalment editor [proposed]
F29 Refund and credit note workspace [proposed]
F30 Reminder composer and delivery history [proposed]
F31 Bank reconciliation workspace [proposed]
F32 Approval inbox and audit detail [proposed]
F33 Mobile finance overview
F34 Mobile invoice register and detail
F35 Mobile collect payment
F36 UI state board: loading, empty, no results, error/retry, permission denied, validation, cancel confirmation, payment success, blocked print.
## Delivery
Create a consistent connected high-fidelity screen set; preserve same shell/tokens across ALL screens. Use realistic fictional school records. All designed actions must have destination/modal/feedback specified. Include all form content, relevant sub-tabs and print layouts. Reuse common components. Do not replace the ten existing finance areas with one generic dashboard.

