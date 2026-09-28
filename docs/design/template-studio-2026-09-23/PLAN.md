# Template Studio — document platform and delivery plan

**Status:** product scope agreed; implementation not started
**Updated:** 2026-09-23
**Scope:** institute-admin web and API; school/institute documents across registered families

## 1. Outcome and boundary

Template Studio is the shared place to design and manage document templates. It must grow to support the documents a school or institute uses, not just certificates: student/staff ID cards, fee invoices and receipts, mark sheets/report cards, payslips, certificates, and future letters, forms, or other registered families. This is an extensible **document-family catalog**, not a claim that every conceivable document has live generation in the first release.

Each document's business workflow owns its source records and the decision that a document is ready: finance owns invoice/payment records; academics owns finalized results; payroll must own finalized pay records; a certificate workflow owns issuance. Studio supplies the template, field catalog, preview, and rendering contract. A user cannot invent a new live document family by naming a template or joining unrelated records. A family joins live generation only when its primary record, authorized related fields, readiness state, access policy, output format, and record/retention policy are defined.

**First new integration:** generate student ID cards from live student records as one selected-student batch, including a one-student batch. Preserve the already-working live fee-invoice and fee-receipt print flows. Mark sheets, payslips, and certificates follow behind their respective source-of-truth prerequisites; existing sample-data template design remains available until then.

### Terms and record policy

- **Generation:** on-demand rendering/printing from the latest authorized records and a selected template. Generating ID cards does **not** create a permanent issuance record, certificate number, public verification claim, or stored PDF.
- **Issuance:** a recorded event with an immutable document snapshot and recipient. This is for families that require it, beginning with certificates. A print attempt is not itself an issuance.
- **Document family:** a registered contract for one document purpose, source record, permitted fields, generation/issuance rules, and output. A family may have many templates; its category default does not prove that a particular template suits a selected record.
- **Template version:** future live integrations use a publishable draft and immutable published version. The first ID-card live integration needs a published version as its input. Current finance printing must keep working while existing mutable templates are deliberately migrated or grandfathered until publication is available; never silently reinterpret an edited finance template as a historical version.

The accepted [issuance ADR](../../adr/0001-server-authoritative-versioned-document-issuance.md) applies to **recorded certificate issuance**, not to every print job. Certificate numbering, verification, revocation, deterministic re-rendering, and server-authoritative PDF remain later certificate-workflow requirements, not promises for first-release ID cards.

## 2. Baseline and constraints to preserve

- The current `DocumentTemplate` model has five categories (`FEE_INVOICE`, `FEE_RECEIPT`, `MARKSHEET`, `ID_CARD`, `CERTIFICATE`), one institute/category default, and mutable layout JSON v2. It has **no** published-version lifecycle or `PAYSLIP` category. The Studio can edit and sample-print each category; only fee invoices/receipts are bound to live records.
- The current free canvas represents a CR80 ID card as two 86 × 54 mm layout pages: front and back. The renderer prints each layout page as its own physical page. It does **not** impose several cards on A4, mirror backs, calibrate duplex output, or render a batch. Reuse its safe element rendering where possible; add sheet imposition instead of pretending that CR80 pages already produce A4 sheets.
- Student directory selection uses IDs across pagination and filters. Its current bulk action is deletion, not printing. Existing student list/detail and template endpoints are institute-admin-only. The delete action's silent filtering behavior must **not** be reused: a selected ID that is inactive, missing, or outside the authorized institute/branch must be reported, not dropped.
- ID-card samples contain fabricated names, roll numbers, school details, and staff values. There is no live ID-card adapter. Student serialization supplies name, admission number, active status, branch, class/section and session, but does not currently expose an actual photo URL, roll number, or a generic `guardian_name` field in the list/detail contract. Some of those facts exist elsewhere in the domain; use only confirmed, authorized mappings. Never fall back from live data to sample values.
- Invoice and receipt printing already bind `FeeInvoice`/`FeePayment` and branding to document layouts. Preserve this behavior and the finance workflow's template pickers during lifecycle/renderer changes.
- Academic mark entry has operations with status and JSON payload, but no stable, finalized mark-sheet rendering contract. Staff profiles have salary-related fields, but no payroll-period/pay calculation/finalized payslip source. Certificate templates are sample-only with no issuance workflow yet. An uploaded student document is not automatically a generated/issued document.

## 3. Shared document-family contract

A registry entry defines the family identifier and label; primary record type and owning workflow; allowed related record traversal; typed field catalog and permitted formatters; supported template/page/output formats; synthetic preview fixture; live data resolver; readiness check; authorization for template editing, real preview, and generation; branch/institute scoping; whether it uses generation or recorded issuance; and whether a QR is internal-only, public-verifiable, or forbidden. Families lacking a complete live contract may still have sample-only templates, but cannot be offered in a live generator.

Live resolution must start from explicitly selected primary record IDs. Related values come only from the family-approved graph inside the current institute and authorized branch. Do not expose a generic cross-module query builder or concatenate arbitrary user-provided field paths. Design-time synthetic data may illustrate missing families but must be visibly marked as sample and must never enter real output. Any real-record preview uses the same access rules as generation; payroll previews and sensitive fields are visible only to authorized payroll roles when that workflow exists.

Before first live use, inspect the selected published layout's text tokens, image bindings, QR mode, and any data dependencies. Reject unknown or unapproved bindings, missing required values, inaccessible images, unsupported page geometry, and unsupported family-specific elements. Compatibility is determined from the **layout's contents and bindings**, not a preset name; a template named “Staff card” could be structurally a student card, while a custom template with `staff_name` is incompatible. Display precise field-level explanations rather than rendering unresolved tokens as blanks.

A common output contract keeps safe HTML/text escaping, URL and image-source restrictions, print bounds, repeatable geometry, and per-family validations in one place. Reuse the existing layout v2 and renderer for compatible work; do not replace the free-canvas editor merely to build ID-card generation. Versioning/publication, asset references, and a server-authoritative certificate renderer are separate changes that must be reconciled with this foundation before those families rely on them.

## 4. First delivery — live student ID cards

### 4.1 Entry, selection, and authorization

- Add **Generate ID cards** to the student directory's bulk actions. Template Studio remains the place to create, edit, and publish designs. Selecting one student uses the same batch flow as selecting several. A profile shortcut may be considered later, but does not require a second generator.
- Keep the first delivery institute-admin-only, matching current student and template APIs. Revalidate tenant/branch scope on **every** record fetch used for generation; authorization of the directory list alone is insufficient. Do not let a branch-scoped admin print students from another branch merely because stale IDs remain selected.
- Preserve cross-page and cross-filter selection, but show the selected count and a reviewable, removable list of selected students. Make the selection stable and explicit: changing filters must not silently change the batch, and a selection retained across filters must remain visible in review. Empty selection blocks proceeding.
- Limit one print run to **80 unique students** (10 A4 sheets per side). Validate the limit when entering review and again at generation. Staff may start another run for the remainder. Do not silently truncate a selection or duplicate cards for repeated IDs.
- The review uses the user's selected order, not the current filtered-page order; assign each selected student a stable slot and preserve that order through the preflight and print output. If selection order is not represented by the current `Set`, capture it explicitly in the generation flow rather than relying on a re-sorted API response.

### 4.2 Template choice and data binding

- Require explicit selection of an ID-card template suitable for **students**. Never select the category default without confirmation: the gallery contains both student and staff presets. Show the chosen template/version and front/back thumbnails in review. Reject a draft, archived, cross-institute, non-CR80, missing-front/back, or structurally incompatible template; do not filter solely by display name.
- A live student adapter resolves `student_name` from first/last name, `student_id` from admission number, class/section from current enrollment, and academic year from that enrollment where available. Resolve school name/address and institute logo from authorized branding sources. Bind other fields only after a real source and scope are confirmed. In particular, do **not** manufacture `roll_no`, `guardian_name`, photo, or session from sample tokens. If a template uses a field that cannot be sourced, report it as an incompatible binding until the authorized source is added.
- A student photo is optional **only** via an explicit batch-level acknowledgement to print the designed initials placeholder for affected students; name/admission number and every other field used by the chosen template require a real value. If a template uses school address, enrollment, academic year, or another field and the record lacks it, report the per-student omission. The identity baseline of a student name, admission number, and school name always applies even if the chosen layout omits one.
- For ID cards, a QR may encode the existing student identifier **for internal lookup only**, if that mode is present in the template and resolvable. The `verify-url` mode is not valid for unrecorded cards: no public verification URL, self-contained certificate claim, or fabricated document number. Label internal scanning as an identifier, not proof that a physical card is authentic. Unknown or unsupported QR mode blocks printing.

### 4.3 Preflight and final confirmation

- On **Generate**, re-fetch the chosen template/version and all selected students from current authorized sources rather than trusting cached list rows. Check active status, institute and branch scope, existence, duplicate IDs, required values, field availability, photo policy, template compatibility, QR mode, and image loadability before building print HTML.
- Display an all-students preflight: selected count, template and version, student order/slot, each student's issues, and which photos would use initials. Distinguish a missing datum from an unsupported template binding and an unauthorized/out-of-scope ID. An admin can remove a student or fix source data and rerun preflight, but may not continue with an unresolved issue.
- **All or nothing:** if any selected student fails, generate no printable batch. Never silently skip an invalid student, output blank/fabricated tokens, or show a “complete” count that omits selected IDs. Photo placeholder permission must be explicit; it is not a blanket exemption for other missing fields.
- After preflight, show the final list and sheet preview before opening the print view. Use the latest authorized values at generation time; the selection-time list is not a historical snapshot. If records or the chosen template change before printing, invalidate the preflight and require a fresh run. A network or image failure also blocks the whole batch.

### 4.4 A4 imposition, fronts, backs, and print behavior

- Render each CR80 template page into a fixed 86 × 54 mm card cell, preserving its element geometry. The physical output is **A4 portrait (210 × 297 mm), 2 columns × 4 rows**, eight cards per sheet. Card slots form a centered 172 × 216 mm grid with nominal side margins of 19 mm and top/bottom margins of 40.5 mm. Do not auto-scale cards to fit a browser's printable area.
- For a selected student in front row `r`, column `c`, put their back in **the same row and mirrored column `1−c`** on the immediately following back page, for long-edge duplex printing. Each front A4 sheet is immediately followed by its corresponding mirrored back A4 sheet; repeat for every group of eight. Preserve slot correspondence and orientation in preview and on paper. The ninth student starts slot 1 of the second front sheet; unused front slots and their paired back slots are blank.
- Print both sides of all selected students in **one ordered browser print view** (`front 1, back 1, front 2, back 2, …`), so normal long-edge duplex pairs each front with its back. Do not treat each CR80 side as a separately printable physical page. Paper size, no browser margins, 100% scale/no fit-to-page, long-edge duplex, and background-graphics settings must be stated in the preview/print instructions. Browser “Save as PDF” is available through the print dialog, not a promised server-generated PDF or retained artifact.
- Include a non-personal **alignment/test sheet** and a short physical calibration check before the first real batch. Confirm actual duplex orientation and slot alignment on a real A4 printer before release; browser rendering tests alone cannot validate a printer's paper path. No user-configurable per-printer offsets in this delivery—add them only if physical QA shows a need. The test sheet must be a separate print action so it cannot be mistaken for a student card or inserted into the real batch's duplex pairing.

### 4.5 Retention and safety

- On-demand ID-card generation stores no issuance, generated PDF, public verification entry, or immutable student snapshot. Existing normal access/audit logging may record the action's metadata if policy requires it, without treating a print attempt as an issued card or storing sensitive render HTML.
- Escape all live values before HTML output. Restrict image/URL sources to trusted authorized assets; do not include third-party URLs that could fetch student data or fail unpredictably in print. Opening a browser print window must not bypass the final preflight or leak data across tenants. Print HTML remains ephemeral to the authorized browser session.

### 4.6 Delivery work and acceptance

1. Define a student-ID-card live field map from existing student/enrollment/branding sources and explicit incompatibility diagnostics for missing sources. Update only authorized API projections actually needed; do not introduce invented fields.
2. Add published-version selection/validation for new live document integrations while keeping existing finance printing functional. Seeded student presets must either be made publishable or accompanied by a compatible published starter template; incompatible staff and unsupported-roll presets must not be silently offered as ready-to-print.
3. Add the student-directory batch action, selection review, template picker, preflight status, placeholder acknowledgement, final preview, and failure/retry states.
4. Add server-scoped batch data resolution or equivalent authorization-enforced record fetches; never trust client-provided names, scope, or preflight results. Keep the final render tied to the validated selected IDs and template version.
5. Add a student document-data adapter and A4 sheet-imposition renderer using CR80 front/back layouts; preserve the current invoice/receipt rendering path. Add a separate synthetic calibration sheet and print instructions.
6. Test tenant and branch isolation (including stale cross-filter selections), inactive/deleted students, unavailable template fields, unsupported QR, absent photo acknowledgement, no-data/no-template/over-limit cases, batches of 1/8/9/80, slot/order stability, mirrored backs, safe escaping, browser print opening, and no output on partial failure. Run a physical duplex test before declaring print alignment complete.

**Acceptance:** an authorized admin can select 1–80 active students across directory pages, choose a compatible published student-card template, review every current student's resolved fields, explicitly accept any photo initials, and print correctly paired A4 front/back sheets. Any failure blocks the entire print run with a per-student explanation. No card is represented as a recorded or publicly verifiable issuance. Existing invoice/receipt printing remains usable.

## 5. Cross-family roadmap and readiness gates

### A. Foundation shared by new live families

- Maintain a registered family catalog with the permissions, primary source record, typed field definitions, synthetic fixtures, supported output, readiness gate, and generation/issuance policy described in §3. Add a family only when a real business workflow needs it; admins may create templates within supported families, not grant themselves access to new data by defining ad-hoc families.
- Introduce draft → published → archived template versions for future live integrations; published versions and their referenced assets must not mutate in place. Validate required fields, supported elements, print bounds, image/asset references, scope, and family policy at publication, then validate current record values at generation. Define revision, default-selection, and migration behavior explicitly before changing existing finance templates.
- Keep the existing editor and sample previews where compatible. Lock down real-record previews by family permissions. Use one well-defined rendering contract for print and, when a family needs it, server-generated PDF; an A4 browser print for cards is **not** a substitute for the later authoritative certificate output contract.
- Keep institute isolation for all families, branch isolation where applicable, and special sensitivity rules for payroll/other confidential sources. Do not persist generated files or enable public verification simply because a renderer can produce them.

### B. Fee invoices and receipts — preserve and migrate deliberately

Finance already has live invoice/payment records and document-template printing. Do not move billing, payment, status transitions, or receipt numbers into Studio. Continue using the existing finance template pickers and fallback behavior until a compatible versioning migration is designed and tested. When migrating, preserve template selection semantics and existing printed output; newly published finance versions must not retroactively change already-recorded invoice/payment facts. Specify any historical-rendering guarantee separately—today's browser print is not an immutable issuance snapshot. Regressions in create/edit invoice, payment, invoice print, receipt print, tenant scope, and escaping block release.

### C. Mark sheets/report cards — after academic result contract

The academics workflow must define the primary result record and its finalization/publication rule, student/class/term/exam relationships, subject results and maximum marks, grade/total/rank policy where relevant, correction rules, and who may publish or print results. Current `AcademicOperation(kind=MARK)` JSON/status is not yet a sufficient stable print contract. Expose only approved result fields in the mark-sheet family; synthetic preview may continue in Studio. Live generation is blocked for unfinalized, missing, or unauthorized results and must not infer missing grades/ranks. Decide whether a particular report-card subtype needs recorded issuance only when its real workflow is specified; do not conflate marks publication with document printing.

### D. Payslips — after payroll source of truth

Add a payslip family only when payroll has period, employee, finalized earnings/deductions/net pay, calculation/correction rules, and access policy. Staff profile salary alone is not an authorized payslip. Studio may design synthetic payslip templates before a live adapter exists, but a real payslip must resolve from finalized payroll records, not from manually typed financial figures or a guessed monthly amount. Treat salary, bank and deduction fields as sensitive; require explicit payroll authorization for template field access, live preview, and generation. Define payroll's retention/issuance requirement with that workflow; do not inherit the ID-card no-record policy by accident.

### E. Certificates — recorded issuance

The certificate workflow uses a student primary record plus explicitly authorized certificate-specific input fields, published immutable template and asset versions, branch/type-specific numbering, an immutable value snapshot, issuer/time, content hash, opaque verification identifier, and revocation/replacement history. A server-authoritative print/PDF renderer and privacy-minimized public status lookup are required for that family, as in the accepted ADR. No self-contained QR fragment purporting to verify a card or certificate without an issuance record. Define certificate roles, numbering concurrency, allowed free fields, retention, and correction rules before implementation. Start with single-record issuance; bulk certificates are separate work after the single-record path is proven.

### F. Future families

Letters, forms, staff ID cards, transfer documents, and other institute paperwork enter through the same registered-family review: identify owner and primary record, permitted data and fields, branch scope, readiness state, privacy sensitivity, output geometry, print/verification policy, and whether generation or recorded issuance applies. An uploaded Aadhar/birth/transfer document or a printable sample template is not evidence that a live generator already exists. No universal join of unrelated records, generic public verification, or permission widening by template configuration.

## 6. Delivery order, checks, and deferred work

1. **Preserve baseline:** characterize current finance printing and all five Studio galleries/preview paths; keep preset and API behavior stable while building the new family contract.
2. **ID-card foundation:** make published student-card templates possible; wire authorized live student data, preflight, selection review, A4 imposition, and real-printer validation. This is the first new release gate.
3. **Shared lifecycle/catalog:** expand versioned publication and family registration as each next adapter demands; migrate existing finance templates only with explicit compatibility tests. Reuse security and rendering rules instead of duplicating family-specific escape paths.
4. **Academic reports:** finalize results contract, then bind mark sheets and test readiness/grades/permissions.
5. **Payroll documents:** establish payroll source and permissions, then add payslip templates and live generation.
6. **Certificates:** implement the separate recorded, server-authoritative issuance and verification lifecycle; test historical determinism, unique numbering, revocation, privacy, and correction. The exact order of steps 4–6 may change if one source workflow becomes ready sooner, but no family bypasses its readiness gate.
7. **Additional families:** register and integrate incrementally using the same contract; define a family-specific acceptance suite before turning on live generation.

Deferred from the first ID-card delivery: staff cards, whole-class shortcuts, dedicated CR80 card-printer drivers, custom sheet layouts and per-printer offsets, retained PDFs, public card verification, certificate issuance, academic result finalization, payroll calculation, arbitrary administrator-defined live data joins, and cross-family approval workflows. These may be separate product milestones; the platform scope remains broader than the first release.

## 7. Reconciliation of prior documents

The [2026-08-13 Studio spec](../../superpowers/specs/2026-08-13-template-studio-design.md) describes the original five-category free-canvas implementation and a future ID-card batch, mark-sheet adapter, and certificate fill-and-print. It remains useful implementation history, not an all-families launch contract. This plan keeps compatible canvas/layout and finance behavior but rejects using sample data in live output or treating self-contained QR fragments as proof of recorded issuance.

The earlier certificate-first plan described immutable publication, stationery, server-authoritative PDF, and verification as part of its first delivery. Those are now **family-specific certificate requirements for a later phase**, except for the shared published-template lifecycle needed by new live integrations. The [accepted ADR](../../adr/0001-server-authoritative-versioned-document-issuance.md) is retained for certificates; it does not turn an on-demand student ID-card print into an issuance. The [domain glossary](../../../CONTEXT.md) distinguishes document family, generation, and issuance. If implementation encounters a conflict among old specs, current code, and these product decisions, surface it explicitly before migrating or deleting existing templates.
