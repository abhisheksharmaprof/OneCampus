# CampusOne Template Studio — Consolidated Implementation Plan

> **Status:** Approved design; implementation underway. This is the canonical feature and sprint ledger. Update status and evidence here as work proceeds.
>
> **Goal:** Deliver a visual document studio with reusable letterheads, print-accurate output, authorized live data, and reliable bulk PDFs.
>
> **Architecture:** Build a parallel replacement within the existing React app, using a new layout schema and renderer while retaining the current Studio during migration. Reuse Django authentication, storage, template records, and business workflows.
>
> **Tech stack:** React, TypeScript, Django/DRF, PostgreSQL, Celery/Redis, Chromium rendering.
>
> **Design source:** Approved design, feature register, decisions, and acceptance criteria in this document. Source references: W = supplied written specification; H = supplied campusone_template_studio.html; R = current repository and accepted issuance ADR.

## Decisions and constraints

| Decision | Requirement |
|---|---|
| Scope | Full roadmap: editor, live integrations, server PDFs, bulk generation. |
| Delivery | Parallel replacement; current Studio stays available during migration. |
| Masters | Draft children follow the latest published master; published children freeze resolved master and asset versions. |
| Inherited edits | Detach and edit locally; edit master draft is a separate action. |
| Role conversion | Create copy as… with binding diagnostics; never silently change a template's business purpose. |
| Custom Documents | Approved school/student fields and typed manual inputs. |
| Visual direction | Use the supplied HTML and add features unique to the written specification. |
| Bulk | Combined PDF, target 500 marksheets/admit cards per job. Existing ID-card limit stays until proven. |
| Temporary downloads | Expire after 24 hours; certificate issuance records remain available for authorized re-rendering. |
| Units | Geometry/margins/padding/zones in mm, type in pt, angles in degrees; CSS uses 96/25.4 px per mm. Zoom never changes stored geometry. |

Preserve existing templates, published versions, finance printing, and unrelated worktree changes. Enforce institute/branch authorization on records, templates, assets and downloads. Never use sample values in live output. Zero-height header/footer zones are valid. A visible control alone is not evidence of completion. Do not add dependencies when existing code can provide the feature.

### Review focus

1. Long names, multilingual content, and delayed fonts cannot silently clip.
2. A master update during editing or bulk rendering cannot mix versions.
3. Multiple expanding tables and trailing totals/signatures cannot overlap footers.
4. Worker retries cannot duplicate certificate issuance or document pages.
5. Conversion/rollback preserve existing documents and keep new-format documents readable.

## Feature register

Initial status for all IDs is **Planned**. Track each ID as Planned, In progress, Blocked (with named blocker and task), or Verified. Record source, sprint, dependencies, tests and evidence when updating. IDs below cover the union of W and H; HTML behavior that mutates a shared master is intentionally replaced by the approved detach/master-draft flow.

| IDs | Feature coverage | Source | Sprint |
|---|---|---|---|
| TS-01 | Gallery, search, create/open, duplicate, defaults, draft/publish/archive, guarded delete, current families and Custom Document role. | W/R | 1–2, 9 |
| TS-02 | Back/title/role, template switching, Create copy as…, master selector, dirty/save/error states, print preview and JSON export/copy. | W/H | 1–2 |
| TS-03 | Undo/redo, sample data, zoom, mm rulers, separate grid/snap, bleed/safe area, inherited protection. | W/H | 2 |
| TS-04 | Four left tabs: Elements, Merge Fields, Letterheads & Saved Blocks, Layers; three inspectors: Element, Watermark, Page & Zones; floating toolbar. | W/H | 2, 7 |
| TS-05 | Text, image/logo, static/dynamic table, totals, shape/band, divider, signature, QR, barcode, student photo frame, page border/frame; table in every role. | W/H | 2, 4–6 |
| TS-06 | Drag; eight resize handles; proportional corners; edge stretch; aspect lock; numeric X/Y/W/H; rotation stem/angle; Shift snaps at 15°; horizontal/vertical flip. | W/H | 2 |
| TS-07 | Smart alignment guides; keyboard nudging; selection, duplicate, delete, lock, visibility, z-order, layer drag/reorder, zone reassignment. | W/H | 2 |
| TS-08 | Header/body/footer/background layer tree, inherited badges, protected background bands, local-only unlock. | W/H | 2, 7 |
| TS-09 | Font family/weight/size, bold/italic/underline, line height, letter spacing, left/center/right/justify and top/middle/bottom alignment, case conversion. | W/H | 3 |
| TS-10 | Text/fill colors, hex/RGB/opacity, linear/radial gradients, linked/per-edge border widths, solid/dashed/double, color, radius, element opacity. | W/H | 3 |
| TS-11 | Searchable/collapsible field groups, token insertion and mixed text, fallback, conditional prefix/suffix, auto-fit with visible minimum/overflow result. | W/H | 3, 9–10 |
| TS-12 | Upload/presets, contain/cover, pan/zoom crop, square/rounded/circle/hexagon masks, opacity, grayscale, brightness/contrast, white-background threshold removal. | W/H | 4 |
| TS-13 | Bound/cropped student photos, signatures, rotation, missing-asset diagnostics, owned/versioned assets, real QR/barcodes. | W/H | 4 |
| TS-14 | Static table rows/columns, draggable widths, merge/split cells, mixed labels/fields, cell editing and formatting. | W | 5 |
| TS-15 | Dynamic arrays, designed headers, repeating row template, field mapping, totals, multiple tables, authorized datasets. | W/H | 6 |
| TS-16 | Table borders and independent gridlines, thickness/color presets, per-side padding, vertical/per-column alignment, zebra toggle/tint. | W/H | 5–6 |
| TS-17 | Measured pagination, repeated headings, body flow, totals/trailing content, empty states, overflow diagnostics. | W/R | 6 |
| TS-18 | Master header/footer/background, link, draft update, published freeze, local detach/override, edit-master navigation. | W/H | 7 |
| TS-19 | Draggable header/footer lines and live mm labels, numeric controls, body reflow, bottom-anchored footer, repeat/first-page rules, page number. | W/H/R | 7 |
| TS-20 | Saved headers, footers, signatures, badges/blocks; preview/save/rename/insert/delete; insertion copies locally. | W | 7 |
| TS-21 | Watermark None/Image/Text/Both, school logo/upload, static/dynamic text, font/size/color, scale, opacity, angle/presets. | W/H | 7 |
| TS-22 | Page/body center, custom X/Y, tiled watermarks and gaps; locked background between page and content. | W/H | 7 |
| TS-23 | Orientation, page size, per-edge margins, background/image, border/frame offset, bleed/safe-area guides. | W/H/R | 7 |
| TS-24 | Browser print and server PDF parity; wait for fonts/assets; preserve fills, gradients, masks and watermarks. | W/H | 1, 8 |
| TS-25 | Live school/student/custom data, finance compatibility, published exam schedule, finalized results, certificate issue/verify. | W/R | 9–11 |
| TS-26 | Two-up half-sheet admits; CR80 front/back pairing, mirrored duplex slots, stable order and blank unused slots. | W/R | 10 |
| TS-27 | Bulk preflight/progress/cancel/retry/idempotency, authorized download, expiry, 500-document acceptance. | W | 8, 12 |
| TS-28 | Responsive panels; keyboard operation; focus, screen-reader names/announcements; readable loading/error/empty states. | R | Every UI sprint |
| TS-29 | Conversion report, visual comparison, pilot, default migration, rollback, historical output preservation. | R | 0–1, 13 |

### Field catalog

- **School:** school_name, school_address, school_gstin, school_pan, school_phone, school_email, school_website, authorised_signatory, school_logo.
- **Student:** student_name, roll_no, admission_no, class_section, dob, father_name, mother_name, student_photo, blood_group.
- **Exam:** exam_name, academic_year, exam_center, reporting_time, gate_close_time, subject_schedule_table.
- **Results:** marks_table, total_marks, percentage, cgpa, final_grade, attendance_summary, result_status, class_teacher_remarks.
- **Datasets:** subject marks, student exam schedules, static school affiliation grids.

Table-valued fields bind/insert a table rather than render as scalar text. Preserve aliases used by existing templates. Results, grade, CGPA, attendance and totals come only from authorized records/configured policy. No invented grading formula or sample fallback in live output. Track missing source/policy as a blocker rather than marking the field live.

## Implementation contracts

Repository root: /media/abhi/Shared/CampusOne.

- New React editor: apps/institute-admin-web/src/features/documents/studio-next/.
- Shared schema/normalization/composition/pagination/safe rendering: packages/document-engine/.
- API validation, versioning, master resolution, saved blocks, conversion and jobs: services/api/modules/documents/.
- Private Chromium renderer: services/document-renderer/.
- Business record adapters stay within finance/people/academics owners; tests stay adjacent and in services/api/tests/.
- Keep the current studio/ and v2 renderer usable during migration. Avoid unrelated refactors.

New interfaces (v2 semantics remain unchanged):

- LayoutV3: explicit zones/page setup, ordered elements, rich text/typed fields, table modes, watermark, master binding and asset references.
- normalizeLayout(input) -> LayoutV3: validate and normalize; reject invalid geometry/unsupported structures.
- convertLegacyLayout(layoutV2) -> { layout, diagnostics }: create a copy and report loss/unsupported features.
- resolveTemplate(child, masterVersion) -> ResolvedTemplate: compose frozen or draft-resolved inherited zones.
- DocumentDataV3: typed scalar fields, named datasets, images, manual inputs, source revision and readiness diagnostics.
- buildRenderPlan(template, data, assets) -> RenderPlan; renderDocumentHtml(plan) -> string.
- RenderDiagnostic: stable code, severity, element/field reference, actionable message.
- APIs: revision-aware saves (stale write conflicts), immutable publication/archive, saved-block CRUD, conversion preview/copy, authorized preflight/preview, bulk job status/cancel/download, certificate issue and privacy-minimized verification.

Client input is not authoritative. The API resolves live records and sends a fixed payload to the renderer. Master/assets and source revision are pinned for each publication/job. Body positions are body-origin-relative; header/footer zone-relative; footer bottom anchored. Flow order governs expanding tables and attached elements. Repeat table headings/stationery. Never clip silently. Rotated tables are fixed blocks when they fit; reject paginating rotated tables. Reuse restricted formula evaluator; never execute arbitrary expressions. Watermarks sit above page background and below content. Default opacity 10%, allowed 2–50%; rotation −180° to +180°; image page-width scale 10–100%, with HTML motif multiplier separately 40–160%. Fonts/assets are locally available and versioned for reproducible output.

## Sprint sequence

Each increment uses test-first development: add a focused failing test, run and inspect the expected failure, implement the smallest change, run focused and integration checks, record feature/evidence here. Preserve unrelated worktree edits; stage only owned files.

### Sprint 0 — Coverage and baseline

- [ ] Save this canonical roadmap and preserve both input references in documentation.
- [ ] Expand TS IDs into individually checkable rows with exact source locations/control references.
- [ ] Inventory current editor, templates, formats, printing, permissions, assets and live data.
- [ ] Capture representative v2 layouts/output for all existing families.
- [ ] Identify missing field sources and assign prerequisites to Sprints 9–11.

**Exit:** All supplied features have owners and acceptance checks; legacy fixtures cover existing families.

### Sprint 1 — Schema, persistence and PDF vertical slice

- [x] Define LayoutV3 and matching frontend/backend validation, multiple tables, bounded page count, assets.
- [ ] Add revision-aware saving and immutable v3 publication.
- [ ] Add converted-copy flow; never mutate v2 original.
- [ ] Dispatch render by layout version.
- [ ] Save, reload and render a text/image v3 document to PDF.

**Tests:** round-trip, stale-write conflict, nonfinite geometry, cross-institute refs, immutable versions, v2 compatibility, PDF dimensions.
**Exit:** A persisted v3 template renders while existing families remain usable.

### Sprint 2 — Workspace, canvas and layers

- [ ] Add route/gallery entry and five-zone workspace matching the reference layout.
- [ ] Build elements, selection, contextual toolbar/inspector.
- [ ] Add drag, eight handles, rotation, flips, aspect lock, zoom-independent coordinates, snapping and guides.
- [ ] Add layer ordering, visibility, lock, zones, history, keyboard shortcuts, dirty state and JSON export.
- [ ] Add responsive panels and keyboard alternatives.

**Tests:** geometry at multiple zooms, each handle, rotation center, single history commit per gesture, redo invalidation, lock behavior, shortcuts while editing text, save during edit.
**Exit:** Core edit/save/reload works by mouse and keyboard.

### Sprint 3 — Typography, style and fields

- [ ] Add structured text/token editing, full typography, colors, gradients, border/radius controls.
- [ ] Add full searchable field catalog, fallback, conditional prefix/suffix and auto-fit diagnostics.
- [ ] Add versioned fonts and missing-font errors.

**Tests:** long names, multilingual text, mixed tokens, missing versus zero, auto-fit minimum, CSS/PDF parity, escaped hostile input.
**Exit:** Text/fields match between editor, preview, print and PDF.

### Sprint 4 — Assets, photos, signatures and codes

- [ ] Add authorized uploads and reusable versioned assets.
- [ ] Add crop/pan/zoom, masks, fit, image filters; remove-white-background creates a derived copy.
- [ ] Bind photos/signatures and show missing asset diagnostics.
- [ ] Produce valid QR/barcode output.

**Tests:** crop persistence, transparency, filters, missing/deleted/inaccessible asset, file rejection, QR/barcode decode.
**Exit:** Preview and server render use the same accessible asset version.

### Sprint 5 — Static tables

- [ ] Enable static tables across roles.
- [ ] Add cell editing, row/column add/remove, column divider resize, merge/split.
- [ ] Add per-cell typography, padding, alignment, borders and striping.

**Tests:** repeated merge/split, delete intersecting merged cells, width totals, narrow columns, mixed tokens, multiple header grids, undo/save.
**Exit:** Header affiliation grids and student detail tables are usable.

### Sprint 6 — Dynamic tables and pagination

- [ ] Bind multiple tables to named authorized datasets; design headings and repeating rows.
- [ ] Connect totals and column styles.
- [ ] Measure after font/asset readiness; flow tables and attached trailing elements across pages.
- [ ] Repeat headings and report unsplittable/overflow conditions.

**Tests:** 0/1/many rows, wrapping, multiple tables, totals/signatures on later page, footer clearance, empty data, rotated overflow.
**Exit:** Complete accurate pagination with no silent clipping.

### Sprint 7 — Masters, zones, blocks, watermarks and page setup

- [ ] Add versioned master link, draft update notice, frozen publication, local detach and master draft editing.
- [ ] Add draggable zone boundaries, zero-height support, body reflow, footer anchor and page rules.
- [ ] Add saved-block CRUD and copy-on-insert.
- [ ] Add None/Image/Text/Both watermarks, typography, placement, tiling, opacity/rotation/scale.
- [ ] Add page formats/orientation/margins/frame/background/bleed/page numbering.

**Tests:** draft follows new master, published frozen, detach appearance, no shared mutation, incompatible geometry, watermark placement after zone changes, zero-footer admit.
**Exit:** Reusable masters preserve version boundaries and render correctly.

### Sprint 8 — Production print/PDF jobs

- [ ] Harden private Chromium rendering with shared render plan.
- [ ] Connect Celery jobs, bounded concurrency and health reporting.
- [ ] Add authenticated preflight, status/progress, cancel/retry/download.
- [ ] Wait for fonts/assets; block arbitrary external fetching.
- [ ] Expire and clean temporary output at 24 hours.

**Tests:** browser/PDF parity, missing font, worker failure/timeout, retry idempotency, cancel, authorization, expiry cleanup.
**Exit:** Server-generated PDFs need no browser-local resource and are safely downloadable.

### Sprint 9 — Finance, students and Custom Documents

- [ ] Bind approved school/student fields and typed manual inputs.
- [ ] Keep invoice/payment values and numbering owned by finance.
- [ ] Integrate published templates with existing finance/student flows.
- [ ] Add missing-source diagnostics and copy-as-role validation.

**Tests:** invoice/receipt regressions, student scope, missing optional values, manual validation, incompatible role conversion, zero sample fallback.
**Exit:** Finance/student/custom live output uses authorized real data and published templates.

### Sprint 10 — Academic output and imposition

- [ ] Use published timetable and authorized candidate snapshot for admit cards.
- [ ] Map exam fields and each candidate’s subject schedule.
- [ ] Add finalized result snapshot adapter using academic records and configured grading policy.
- [ ] Track unimplemented source capture or grading policy as blocking prerequisite; do not fabricate values.
- [ ] Add two-up admit sheets and preserve CR80 front/back mirrored duplex pairing.

**Tests:** unpublished timetable, electives, timetable revision, unauthorized candidate, unfinalized results, missing policy, 1/2/3 half-sheet admits, 1/8/9 card batches, half-page overflow.
**Exit:** Academic data is sourced/authorized; no requested field is claimed live without source evidence.

### Sprint 11 — Certificate issuance

- [ ] Add immutable value snapshots and atomic numbering.
- [ ] Pin template/master/assets and renderer version to issuance.
- [ ] Make issue/re-render idempotent; add opaque verification, revoke and replace.
- [ ] Retain issuance record, not rendered download artifact, by default.

**Tests:** concurrent issuance, retries, historical re-render, revocation/replacement, permissions, privacy of public lookup.
**Exit:** Codes identify real issuance records and template edits cannot alter issued content.

### Sprint 12 — Bulk reliability

- [ ] Pin master/template/source snapshot for the job; stable ordering and all-or-nothing preflight.
- [ ] Stream bounded chunks into combined PDF; recover/cancel/retry and expire output.
- [ ] Run 500-record marksheet and admit-card workloads.

**Tests:** 1/50/500, invalid member blocks job, worker interruption, master revision during render, duplicate request, page completeness/order, memory/duration measurements.
**Exit:** Both 500-document workloads pass with recorded performance and recovery evidence.

### Sprint 13 — Migration, pilot and rollout

- [ ] Convert representative v2 templates into separate v3 copies; compare outputs.
- [ ] Verify all legacy live workflows and v2 published versions.
- [ ] Browser acceptance on desktop/tablet/mobile; physical A4, half-sheet and duplex calibration.
- [ ] Pilot per institute, switch defaults only after evidence, rehearse rollback.

**Tests:** defaults, legacy versions, formulas/assets, popup handling, physical alignment, rollback, remaining register blockers.
**Exit:** Every required feature Verified, blockers closed, rollout and rollback evidence recorded.

## Verification and release gates

Use existing commands, focusing tests during each sprint:

```bash
npm --prefix /media/abhi/Shared/CampusOne/apps/institute-admin-web test
npm --prefix /media/abhi/Shared/CampusOne/apps/institute-admin-web run typecheck
npm --prefix /media/abhi/Shared/CampusOne/apps/institute-admin-web run lint
npm --prefix /media/abhi/Shared/CampusOne/apps/institute-admin-web run build
```

From services/api:

```bash
uv run pytest tests/test_document_studio_v3.py
uv run pytest tests/test_document_render_jobs.py
uv run pytest tests/test_document_template_conversion.py
uv run pytest tests/test_document_certificate_issuance.py
```

Create focused suites in their owning sprints and run affected existing finance/student/academic/document suites. Add shared frontend/backend validation fixtures.

Browser acceptance: compose a master with table/logo/footer/combined watermark; create child marksheet/admit/certificate; exercise every control; save/reload/undo/redo; compare draft update, frozen publication and detach; generate authorized live records; compare preview/PDF pages/dimensions; decode codes; print at actual size and check duplex alignment. A passing build or job status is not browser/print acceptance.

A feature reaches **Verified** only with functional UI, persistence/history, API validation/authorization, preview/print/PDF parity, automated tests, browser evidence and physical evidence when printer-dependent.

## Progress log

| Date | Sprint/feature | Evidence | Status / blocker |
|---|---|---|---|
| 2026-10-30 | Design and roadmap | Both attachments inventoried; repository baseline inspected; independent coverage review completed; this roadmap saved. | Sprint 0 in progress: representative output fixtures and complete field-source inventory remain. |
| 2026-10-30 | Sprint 1 / TS-24, TS-29 | Added parallel LayoutV3 schema and frontend/backend validation; supports up to 100 pages and 500 elements, multi-table layouts, zero-height zones, orientation checks and typed master bindings. API save route validates v3 without changing v2 validation. | In progress: immutable version persistence, revision conflicts, full conversion diagnostics, renderer dispatch and PDF vertical slice remain. |
| 2026-10-30 | Sprint 1 / conversion | V2-to-v3 conversion preserves page sides, mm geometry, zones, visibility/style properties and copied letterhead elements; reports unsupported elements and legacy image relinking. | In progress: conversion API endpoint and visual comparison remain. |
| 2026-10-30 | Sprint 1 / versioning | Added `layout_revision` migration and revision in template responses. V3 saves require `expectedRevision`; successful saves increment revision; stale saves return 409. V3 letterheads can now be published as immutable `DocumentTemplateVersion` snapshots; a test proves later draft edits preserve the published payload. | In progress: editor client does not yet send `expectedRevision`; pinned master resolution and immutable publication for all v3 template roles need integration. |
| 2026-10-30 | Sprint 1 / render slice | Added `buildRenderPlan` and `renderDocumentHtml` for v3 text and authorized raster data-URL assets. Output keeps mm geometry, escapes document fields, rejects remote/unsupported asset sources and reports missing assets or unimplemented element types. | In progress: this is preview markup only; no Chromium worker, PDF output, watermark/layout composition or full element renderer exists yet. |
| 2026-10-30 | Verification | Document-engine suite: 62 passed; typecheck and production build passed (existing >500 kB chunk warning). Document validator/admin API suites: 21 passed; Ruff passed for new validator and migration. Django migration state check reports no model drift. | Full frontend suite: 3 failures remain (student navigation timeout; two exam placeholder/loading tests). Combined document preset run also exposed 2 existing preset-count failures. Migration history against configured Supabase DB could not be checked because DNS resolution failed. |

## Skipped checks and risk

Plan creation required no runtime, browser, migration, PDF, load, or physical-print checks; none are claimed. Those checks are acceptance gates above. Legacy worktree has extensive unrelated edits; preserve them and never stage all changes.
