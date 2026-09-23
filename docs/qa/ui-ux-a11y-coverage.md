# CampusOne UI, UX, accessibility, and responsive coverage

Audit date: 2026-09-23  
Application: Institute Admin web application  
Local runtime: `http://localhost:5175`  
Primary test role: Institute Admin in the disposable `CAMPUSONE-TEST` institute

## Route inventory

The current institute-admin route inventory contains 58 paths. Each route was opened directly in the local browser during the lead sweep; the route-level result is recorded below. `B` means the route was covered by the browser sweep, `R` means it requires a retry because navigation timed out, and `A` means an authenticated/role-restricted route was exercised with the test admin.

| Route | Purpose / representative state | Role | Coverage | Notes |
|---|---|---|---|---|
| `/dashboard` | Institute dashboard, populated metrics | Institute Admin | B/A | Responsive shell checked |
| `/branches` | Branch list and branch actions | Institute Admin | B/A | |
| `/academics/structure` | Academic structure | Institute Admin | B/A | |
| `/setup/rooms-facilities` | Rooms and facilities | Institute Admin | B/A | |
| `/setup/holidays-calendar` | Holiday calendar | Institute Admin | B/A | |
| `/settings/institute-details` | Institute settings | Institute Admin | B/A | |
| `/settings/profile` | User profile | Authenticated user | B/A | |
| `/roles` | Role list, filters, pagination | Institute Admin | B/A | Mobile pagination fixed and retested |
| `/roles/assignments` | Role assignments | Institute Admin | B/A | |
| `/settings/governance` | Governance settings and save controls | Institute Admin | B/A | 320px wrapping fixed and retested |
| `/roles/builder` | Role builder wizard | Institute Admin | B/A | Wizard shell covered |
| `/staff` | Staff directory | Institute Admin | B/A | |
| `/students` | Student directory | Institute Admin | B/A | |
| `/parents` | Parent directory and loading state | Institute Admin | B/A | Loading skeleton width fixed |
| `/admissions/enquiries` | Enquiry pipeline | Institute Admin | B/A | |
| `/admissions` | Admissions overview | Institute Admin | B/A | |
| `/admissions/forms` | Admission forms | Institute Admin | B/A | |
| `/attendance` | Attendance overview | Institute Admin | B/A | |
| `/attendance/mark` | Mark attendance | Institute Admin | B/A | |
| `/attendance/student-leave` | Student leave | Institute Admin | R/A | Independent retry required after browser timeout |
| `/attendance/staff-leave` | Staff leave | Institute Admin | B/A | |
| `/attendance/reports` | Attendance reports | Institute Admin | B/A | |
| `/attendance/settings` | Attendance settings | Institute Admin | B/A | |
| `/academics` | Academics overview | Institute Admin | B/A | |
| `/academics/teaching-learning` | Teaching and learning | Institute Admin | B/A | |
| `/academics/assessment-results` | Assessment results and marks dialog | Institute Admin | B/A | Modal styling reviewed |
| `/academics/calendar` | Academic calendar | Institute Admin | B/A | |
| `/communication/circulars` | Circular list/table | Institute Admin | B/A | Legacy table containment fixed |
| `/communication/templates` | Communication templates | Institute Admin | B/A | |
| `/finance` | Finance overview | Institute Admin | B/A | |
| `/finance/invoices` | Invoice register and actions | Institute Admin | B/A | Real test invoice; print action exercised |
| `/finance/payments` | Payments and receipts | Institute Admin | B/A | Real test payment/receipt data |
| `/finance/dues` | Outstanding dues | Institute Admin | B/A | |
| `/finance/fee-structure` | Fee plans | Institute Admin | B/A | |
| `/finance/expenses` | Expenses | Institute Admin | R/A | Independent retry required after browser timeout |
| `/finance/payroll` | Payroll | Institute Admin | B/A | Legacy table containment fixed |
| `/finance/budget` | Budget | Institute Admin | B/A | Legacy table containment fixed |
| `/finance/reports` | Finance reports | Institute Admin | B/A | |
| `/finance/settings` | Finance settings | Institute Admin | B/A | |
| `/template-studio` | Document/template studio | Institute Admin | B/A | Preview/export surfaces covered |
| `/verify` | Document verification | Public/unauthenticated | B/A | Valid/invalid states inventoried |
| `/timetable` | Timetable view | Institute Admin | B/A | Responsive skeleton reviewed |
| `/timetable/generate` | Timetable generator | Institute Admin | B/A | |
| `/recognition/points` | Recognition points | Institute Admin | B/A | |
| `/recognition/badges` | Recognition badges | Institute Admin | B/A | |
| `/recognition/leaderboard` | Leaderboard | Institute Admin | B/A | |
| `/recognition/award-approvals` | Award approvals | Institute Admin | B/A | |
| `/recognition/partnerships` | Partnerships | Institute Admin | B/A | |
| `/audit-log` | Audit log with long table data | Institute Admin | B/A | Table containment fixed |
| `/settings/privacy` | Privacy and consent | Institute Admin | B/A | |
| `/settings/billing` | Subscription/billing settings | Institute Admin | B/A | |
| `/notifications` | Notifications | Authenticated user | B/A | |
| `/account` | Account | Authenticated user | B/A | |
| `/help` | Help/support | Authenticated user | B/A | |
| `/addons/transport` | Transport add-on | Institute Admin | B/A | |
| `/addons/library` | Library add-on | Institute Admin | B/A | |
| `/addons/hostel` | Hostel add-on | Institute Admin | B/A | |
| `/branches/detail` | Branch detail auxiliary screen | Institute Admin | B/A | Direct route check |

## Non-URL screens and states

- Authentication: login, forgot-password, reset-password, pending approval.
- Onboarding: account, institute, legal documents, contact, scale, branch, review.
- Platform administration: platform dashboard, registrations, institutes, subscriptions, users, audit, settings.
- Global shell: branch and academic-year selectors, global search, notifications, pending approvals, profile menu, mobile navigation drawer, breadcrumbs.
- Roles: scope tabs, create/edit/clone/delete dialogs, assignment dialog, role-builder basics/permissions/review steps.
- Finance: overview tabs, invoice create/edit, bulk generation, record payment, print/receipt, cancel confirmation, filters, empty/loading/error states.
- Documents: template editor, preview, export/print, valid/invalid verification states.
- Timetable: generator tabs, import/create/save flows.
- Compliance: consent tabs, deletion confirmation, consent-text dialogs.

## Viewport matrix and evidence

| Viewport | Status | Coverage |
|---|---|---|
| 320 x 568 | PASS | Full route sweep; governance settings and mobile shell fixes retested |
| 390 x 844 | PASS | Full route sweep before final shared-shell patch; affected governance route retested at 320 |
| 430 x 932 | IN PROGRESS | Lead sweep completed through communication/finance groups; invoice page retested after accessible-name fix; two navigation timeouts recorded above |
| 768 x 1024 | PASS | Full route sweep in the preceding browser pass |
| 1024 x 768 | PASS | Finance invoice page opened and measured: document/body width 1009px, no overflow |
| 1366 x 768 | PASS | Full route sweep in the preceding browser pass |
| 1440 x 900 | PASS | Full route sweep and finance populated-state inspection |
| 1920 x 1080 | PENDING | Requires final integrated browser sweep |

Additional checks: short-height desktop, direct-link navigation, browser back/forward, long audit data, populated finance data, and responsive table containment. Physical-device testing, screen-reader hardware testing, and alternate browser engines were not available in this environment.

## Shared fixes and retest ledger

- Shared responsive shell: mobile sidebar toggle visibility and settings-row grid wrapping.
- Shared table containment: roles pagination/tabs, communications, finance operations tables, and audit log.
- Loading states: parents skeleton width and responsive page skeleton containment.
- Finance: responsive module/card/table containment, invoice workflow, receipt/print engine integration.
- Documents: print/rendering behavior and invoice print action.
- Academics: responsive modal/dialog treatment.

## Accessibility and quality checks

- Browser AX trees inspected for landmarks, headings, accessible names, tabs, menus, dialogs, tables, and disabled states on representative dashboard, roles, governance, audit, and finance screens.
- Finance invoice action was exercised in the browser; the populated test invoice and payment records were visible and the print control was enabled and activated without a browser error dialog.
- Representative AX inspection completed on finance at 430px: `lang=en-GB`, `main` and `nav` landmarks present, invoice heading present, no unnamed visible buttons, and all form controls labeled after the class-filter fix. Expanded/collapsed shell controls were inspected on roles/governance/audit. A full keyboard traversal of every route remains outstanding.
- Automated AccessLint scanning was not available because this repository has no AccessLint configuration/connected scanner; this is a limitation, not a pass claim.
- Local checks: typecheck, production build, targeted API tests, and `git diff --check` are required after the final patch set.

## Delegated agents

Four specialist audit threads were assigned route groups for setup/roles, people/admissions, attendance/academics, and communication/finance/timetable/gamification. They did not return usable browser evidence or patches, so the lead browser sweep is the authoritative coverage source. No page is marked passed solely because of a delegated-agent report.

## Remaining blockers

- Finish the 430px retry for `/attendance/student-leave` and `/finance/expenses` and complete the final 430px and 1920px sweeps.
- Complete the final integrated keyboard/focus pass and rerun project checks after the last patch.
