# Marks & Grades

The Assessment & Results route (`/academics/assessment-results`) and marks/report-card aliases open the results workspace. Existing lesson plans, homework, question banks, hall tickets, and exam scheduling remain accessible. The original exam tools are available under Setup.

## Workflow

1. Choose academic year, class, and section within the shell's branch context.
2. Set up a unit test, half-yearly, annual, or other exam. Use configured class subjects, optional written/practical/internal components, maxima, passing marks, and grade boundaries. Enrolled students become an explicit exam roster.
3. Enter marks in the subject grid or focused student form. Keyboard navigation, pasting a vertical marks column, draft saves, search, and Excel template downloads are supported. Phones start in the student view.
4. Alternatively upload XLSX, XLS, or CSV, select a worksheet and header row, map identity and marks columns, and review server validation. Both wide subject columns and long subject rows are supported. Maximum marks can come from a column, an explicit default, or the configured exam component. Defaults must agree with exam setup. Spreadsheet totals override the aggregate only when the administrator explicitly selects the imported-total rule; missing totals then block issuance.
5. Submit completed subject sheets. Administrators approve, return, or reopen them; return/reopen requires a reason. Concurrent stale edits are rejected. Archived exams cannot accept marks.
6. Select students and one or more exams, choose a calculation policy and a template, configure the display, preview the real PDF, then generate drafts or issue approved results.
7. Download individual PDFs, a combined PDF, a ZIP of individual PDFs, or a CSV result spreadsheet. Generation history and retry remain available after navigating away.

## Result rules

- Blank is missing, not zero. Clearing a draft score restores missing status with an audit record.
- Present scores use decimal arithmetic, with two decimal places of input precision.
- Absence counts as zero and fails its component. Exempt/not-applicable components do not contribute to numerator or denominator.
- Every configured component must meet its passing mark. A pass threshold of zero explicitly means no numeric minimum.
- Student subject eligibility and report remarks can be configured in Review Results while sheets are drafts. Original excluded marks remain retained. The academic engine also supports all/best-of-N/fixed/imported aggregates; subject credits, display names, and codes; standard, weighted, CGPA-equivalent, or bounded custom percentages; four GPA policies; explicit grace budgets; aggregate-only or every-component pass rules; compartment thresholds; divisions; and grade-point/remark presets. Grace is derived, separately disclosed, and never overwrites raw scores.
- Single-exam and comparison reports keep each exam's results distinct.
- Sum consolidation adds earned marks and maxima. Weighted consolidation normalizes each exam's earned/maximum ratio before applying explicit weights totalling 100. The final selected exam supplies the consolidated grade boundaries and display precision.
- Consolidation requires the same exam subject sets. Weighted reports cannot issue when an included exam has no eligible maximum. Required missing marks block issuance.
- Optional rank uses the entire exam roster's complete, eligible results, independently of the students selected for export. The exam chooses dense, competition, or deterministic unique ranking; percentage, total, or GPA basis; all complete or passed-only eligibility; and ordinal, hash, or cohort display. Rank is per exam.
- Optional attendance counts recorded daily attendance within an explicitly selected academic-year date range. Late counts as present. Period records and unrecorded days are excluded; missing attendance is labelled.

## Templates and branding

The existing `MARKSHEET` registry supplies Term report (Classic School Report), Compact result slip (Compact Exam Result), and Detailed with rank (Comprehensive Progress Report). The presets have distinct PDF presentation. The comprehensive template adds subject percentages and a multi-exam comparison matrix.

School name, address, brand colour, and an uploaded school-logo asset are read server-side. Both legacy Azure and current R2 assets are supported. Logos are rasterized and embedded in the snapshot. A configured logo that cannot be loaded blocks official issuance and gives a preview warning.

Report controls cover title, exam/subject order, grades, components, guardian visibility, class rank, daily attendance, signature lines/labels, and footer. A configuration-based template designer supports Classic Board, Modern Executive, University Transcript, and Royal Heritage variations, typography, borders, crests, report-only institution/header overrides, optional custom logo, all subject/summary columns, hidden subject rows, charts, words, grading legend, and document reference QR. Save and reload these variations through the report configuration selector. Arbitrary drag-and-drop canvas layouts remain separate. Existing edited templates are preserved and explicitly rejected by the preset generator rather than silently rendered incorrectly.

## Data and privacy

Additive migration `academics.0023` introduces structured exams, subject sheets, components, candidates, marks, change history, import jobs, saved report definitions, generation batches, and generated documents. It does not delete or automatically guess relationships for existing academic operations.

Previous records can be inspected and explicitly reconciled in Setup. A reconciled source record is protected from later legacy edits/deletion. The original remains retained. Ambiguous names never automatically select a student or create a new student/subject.

Mark batches use row locks, revision checks, boundary validation, and database bulk upserts. Import commits are idempotent and reject intervening mark/review changes. Teachers are restricted to their assigned subjects; administrators configure/review/issue. Every endpoint derives the institute and branch scope from the authenticated membership.

Generated PDFs and their immutable input snapshots are private database records. Downloads pass the same authenticated institute/branch checks as generation. Snapshots preserve identity, branding, template version, calculation rules, marks, and configuration. Corrections create successor documents linked to the preceding issuance; the original PDF is retained.

The private database output keeps retries independent of object-storage write availability. Monitor database size as issuance volume grows; moving document binary storage behind the existing private file-storage boundary is an operational scaling option. Do not cascade-delete historical results.

## Running and rollout

- Install API dependencies with `uv sync --all-groups` (ReportLab and pypdf are now required).
- Apply `python manage.py migrate` using the configured PostgreSQL database.
- Run the API and frontend normally.
- For background generation, run the existing Celery worker from the same revision: `celery -A config worker --loglevel=INFO`. No new queue/service is needed. The new task is `modules.academics.tasks.render_result_batch`.
- Development can use the existing `CELERY_TASK_ALWAYS_EAGER=true` setting. Production should use the worker.
- Failed dispatch/render jobs retain their snapshots. Retry runs only unfinished documents. Stale queued/running jobs become retryable after ten minutes.
- Template version publication now permits marksheets as well as ID cards; other document-category behavior is retained.
- `school_platform_schema.sql` includes the new tables and existing document/operation prerequisites they reference.

## Verification commands

```bash
cd services/api
.venv/bin/pytest tests/test_results_workflow.py tests/test_academics_api.py tests/test_admin_documents_api.py tests/test_documents_presets.py tests/test_documents_validator.py -q
.venv/bin/python manage.py makemigrations academics --check --dry-run
.venv/bin/ruff check modules/academics/results modules/academics/result_models.py modules/academics/tasks.py tests/test_results_workflow.py
```

```bash
npm run test --workspace @campusone/institute-admin-web -- src/features/academics/results src/features/academics/__tests__/AcademicOperationsPage.test.tsx
npm run build:admin
```

Verified locally: the complete institute-admin suite passed (43 files, 220 tests), the focused backend regression suite passed (48 tests), and the production admin build passed. The browser workflow created a synthetic ten-student exam, saved manual English marks, mapped and imported Mathematics from XLSX, approved both subjects, generated ten issued documents, and downloaded a ten-page combined PDF with the expected marks. Desktop and phone layouts were inspected. PDF.js now renders the actual PDF in-app, with page controls, full-screen view, and accessible report text; the template step previews changes automatically.

The working tree already contained unrelated changes when this work began. A global migration check reported the pre-existing missing `StaffInvitation` model; no deletion migration was created for it. Production deployment and production worker verification were not performed.


## Reference studio integration (October 22)

Reference: `marksheet_studio_pro_excel_import_custom_formula_ranking_template_engine.html` supplied by the user. Its interface and feature set inform the integrated workspace; its JavaScript execution-based formula evaluator was not reused.

| Reference capability | Integrated location |
| --- | --- |
| Workbook upload, sheet selection, header mapping, defaults | Enter Marks → Import marks |
| Paste from Excel, drag/drop, edit staged cells, add/remove staged rows, add columns | Import upload and editable staging table (25-row pages) |
| Student/profile mapping and explicit pre-calculated totals | Optional profile mappings; exam-only `ResultCandidate.profile` |
| Subject max/pass bulk presets, names, codes, credits, inclusion | Setup → Edit exam setup |
| Best-of-N, fixed maxima, standard/weighted/custom percentages, GPA, grace, pass/compartment/division | Academic engine inside exam setup |
| CBSE, university, US grading, custom boundaries/points/remarks | Academic engine → Grade scale |
| Formula sandbox test with actual first student | Academic engine → Test on first student (no persistence) |
| Dense/competition/unique rank and eligibility/basis/display | Academic engine → Class ranking |
| Class statistics, subject average/highest, grade distribution, merit filters | Analytics tab |
| CSV and XLSX master results | Analytics → Export; completed batch → CSV / XLSX |
| Four configurable visual layouts and per-field visibility | Marksheets → Template → Template designer |
| Live preview, full-screen PDF, all-student batch preview | Template and Preview steps; Recent generations → Preview batch |
| Individual / combined PDF, ZIP, and batch print | Existing generation downloads and Open PDF printing |
| Reference QR, original-document lookup and checksum | Template → Document reference QR; Recent generations → Verify reference |

### Intentional product adaptations

- Rows must match students enrolled in the selected exam. Adding a staged row or column cannot create untracked students or school subjects. New students/subjects use the existing People and Academic Structure workflows.
- Demo datasets do not overwrite institutional results. School/university/US grade presets and the existing roster-based Excel template provide the supported starting points.
- Profile overrides are exam-specific and admin-only. Identity matching never silently edits student names, admission numbers, or roll numbers.
- Formula expressions permit constants, named numeric variables, arithmetic, parentheses and bounded ROUND only. No JavaScript, eval, calls to arbitrary functions, attributes, indexing, exponentiation, or imports. Per-student arithmetic errors stay visible and block issuance.
- Rank and class statistics use the full saved roster. Filtering exports or hiding printed subject rows does not change the calculations.
- QR codes contain a document UUID, not student data. Lookup remains authenticated and tenant/branch scoped. Verification supplies the stored PDF's SHA-256 and correction status; it is not a public verification portal.
- Migration `academics.0024_resultcandidate_profile` adds only an exam profile JSON field. It was applied to the configured development database. Existing issued PDFs and snapshots remain immutable.
- PDF.js and its worker are bundled with the application and loaded only for a preview. No remote CDN or external data processing is involved. The renderer follows the [Mozilla PDF.js example](https://github.com/mozilla/pdf.js/blob/master/examples/learning/helloworld.html).
