# Shared Versioned Letterhead Library for Template Studio

* **Author:** Codex brainstorm
* **Date:** 2026-10-30

## Overview

Template Studio could offer a reusable library of school letterheads. Staff would choose a letterhead for each document template; it would provide configured school identity and reserve header and footer space. Published templates should remain bound to the letterhead revision they selected until staff deliberately update that binding. The first release should support admit cards and marksheets with PDF output. Admit cards must support exactly 1, 2, or 4 cards per A4 page. Fee receipts and invoices are deferred. Certificate layout and issuance need a separate scope decision.

The main risk is unclear lifecycle semantics. “Shared” and “versioned” must not mean that an edit silently changes existing templates or historical output. The concept should build on existing document-template versioning and existing institute branding/letterhead asset capabilities where they fit. Staff also need reversible show/hide controls for template fields and sections, and a clear choice when a four-up card may make a long exam schedule difficult to read.

## Analysis

### Product and scope

- Validate that staff need a separately managed, reusable library across multiple document families. A library adds its own editing, publishing, retirement, and selection lifecycle; existing template layouts and publishing may already cover the immediate need.
- Distinguish an existing institute-level uploaded letterhead asset from the proposed configurable letterhead (identity fields, header/footer dimensions, and document-template binding). Reuse the existing asset and institute branding sources where appropriate; do not create a parallel upload pipeline without a demonstrated gap.
- Define the allowed identity fields and source of truth, including institute versus branch scope and which values are fixed in the revision versus supplied dynamically at render time. Prevent staff from unknowingly configuring the same logo or address twice.
- First release: admit cards and marksheets, both previewable and printable/exportable to PDF with the selected letterhead. Admit-card A4 output must offer exactly 1-up, 2-up, and 4-up layouts.
- Template editing must include visible, reversible show/hide controls for eligible fields, sections, and schedule-table columns. Hidden elements remain in the template and can be restored; changing visibility must not erase their values or bindings. Preview must immediately reflect visibility choices.
- Save template visibility controls in the template revision. Treat the selected 1/2/4-up density and any warning-driven optional-field/column adjustments as per-export overrides unless staff explicitly save them as a new template revision.
- When a four-up admit-card schedule is predicted to be too dense or overflow, show a warning with affected candidates and let staff choose how to proceed. The dialog should offer practical next steps such as changing to 1-up/2-up, adjusting which optional fields or columns show, or explicitly continuing with the four-up layout after reviewing its preview. Never silently clip content or reduce text below the legibility floor.
- Derive advisory readability warnings from the actual laid-out preview, not a separate estimate. Continuing is allowed only after the admin reviews the actual PDF preview and acknowledges the tradeoff. Identify affected pages/cards and fields and show the specific sizing or density rule that triggered the warning. Hard failures such as clipped required content, missing required data, non-renderable verification codes, or text below a minimum legibility threshold block generation and cannot be overridden.
- Fee receipts and invoices are deferred. Keep certificate layout and certificate issuance (numbering, approval, signing, reissue, verification) out of this release until their separate requirements are understood.

### Versioning and historical stability

- Published letterhead revisions should be immutable. A published document-template revision should pin the exact letterhead revision, rather than resolve the library’s latest version at render time.
- Updating a template’s letterhead should be an explicit template revision/publish action. Show affected outputs and a before/after preview. Existing generated or issued documents should remain reproducible from their saved output or pinned template and letterhead revisions.
- Show the pinned letterhead revision and template publication status in the editor and preview. Define which staff roles may create/publish revisions and state that prior generated PDFs remain reproducible while new generation uses the adopted template revision.
- Keep revisions needed by existing template bindings and historical verification. Define retirement and recovery behavior so a bad revision can be superseded without changing existing output.
- Add a nullable letterhead binding for legacy templates and preserve current rendering when it is absent. Backfill only when an existing template’s equivalent letterhead can be established; otherwise leave it unassigned.
- Roll out additively: create versioned storage and nullable references, deploy readers that accept absent references, then opt in new templates and explicitly migrate selected existing templates. Retain data on rollback and define how use can be disabled while reads remain available.
- Preserve existing asset IDs/URLs and serialized template layouts. Legacy templates without visibility flags remain visible by default, and unset density uses a specified stable default; do not rewrite receipt/invoice or certificate template data during this release.

### Layout and rendering

- Clarify whether reserved space shifts existing canvas elements, changes the usable page area, or leaves existing coordinates fixed. Define behavior across page sizes, orientation, margins, and multi-page/repeated headers and footers.
- Preview and validate the same layout rules used by the final PDF renderer. Check bounds, collisions, and overflow before publish and at render time. Preview and final PDF must use matching page geometry, fonts, assets, and pagination rules; demonstrate parity rather than assuming it.
- Define A4 1-up/2-up/4-up admit-card geometry, margins, orientation, and minimum readable text, schedule, QR, and logo sizes at actual print scale. Test the longest expected schedules at 4-up. Define overflow behavior, such as continuation or blocking validation; never silently clip content or shrink below a legibility floor.
- Show a candidate-specific readability/overflow warning before PDF output when selected 4-up cards exceed the defined safe layout. Let staff review the warning and choose another density, adjust optional visible fields/columns in the template, or explicitly continue after preview. Record the selected action for support without logging student content.
- Define which fields/sections may be hidden and whether any are required for a valid admit card or marksheet. Preserve hidden bindings and values so staff can restore them. Prevent an accidentally empty or misleading document through preview and publish validation.
- Visibility is presentation state on a template revision. Required fields and category-specific conditional requirements cannot be hidden and must contain valid data at publish and generation time. Hidden items retain their binding/configuration, are visibly marked as hidden-but-bound in the editor, and are excluded from the rendered PDF and its metadata; restoring visibility reuses the prior binding and value source. Define how a field that becomes required in a later template version is handled.
- Treat 1/2/4-up as explicit A4 page composition. Existing ID-card batch slots are not evidence that the renderer supports document-size cards imposed on A4; reuse matching iteration/print patterns, but keep card-sheet geometry distinct.
- Validate density as exactly 1, 2, or 4 and report invalid stored values rather than silently substituting a different layout.
- Define marksheet pagination for variable subject counts and long names/remarks, including repeated headings, student-per-document boundaries, row splitting, totals/signature placement, continuation labels, and overflow behavior. Prevent truncated records and ambiguous student/page association.
- Specify the deterministic PDF path or constrained browser-print contract, including embedded fonts/assets and expected page dimensions and margins.
- Enforce institute/branch authorization for letterhead reads, writes, assets, and template-version references. Use private asset access and validate ownership at publish and render time.
- Set upload size and dimension limits. Cache assets by immutable revision ID if caching is needed; avoid premature performance machinery until representative batch volume demonstrates a need.

### Operations and support

- Record structured preview, publish, binding-change, and render events with institute, category, template/revision, letterhead/revision, output mode, request/correlation ID, outcome, and sanitized failure class. Exclude student data and document contents.
- For each preview/PDF, retain a support-retrievable render ID and sanitized context: document type, template and letterhead revisions, A4 density, page size/orientation, renderer version, page count, and output hash. This should distinguish a template/letterhead change from renderer or print-setting drift without storing student data in general telemetry.
- Tie preview and final PDF to the same template revision, layout configuration, renderer version, and render context; retain a sanitized input/config fingerprint so a mismatch can be investigated without retaining student field values.
- Trace stages such as revision resolution, validation, asset loading, layout composition, pagination, rendering, and PDF serialization. Measure failures, overflow warnings, duration, output bytes, and page count by document type, 1/2/4-up density, template revision, and renderer version.
- Record warning acknowledgement or density/visibility changes with actor and template revision, without recording student content. Keep advisory warnings distinct from blocking validation failures in metrics and support diagnostics.
- Persist generated PDF provenance with the exact template/letterhead revisions and per-export density/visibility choices so the artifact can be reproduced and the override audited.
- Record whether a warning was shown, acknowledged, abandoned, or blocked, including warning code, measured overflow/readability rule, selected density, visibility-config fingerprint, actor, and resulting artifact hash. Do not log student values; keep counts institute-scoped.
- Validate required, missing, unbound, and invalid fields by stable field/section identifiers at template publish and generation. Preserve aggregate validation outcomes and distinguish blocked generation from optional-field omission.
- Bound pages/students per batch, asset dimensions/size, and concurrent rendering. Measure representative peak jobs before setting quotas or adding a queue; deterministic rendering has no LLM token budget.
- Audit who published, retired, attached, or changed a binding, with timestamp and before/after revision references. Show resolved revision provenance in previews and support diagnostics.
- For certificate issuance, if included later, instrument issuance attempts and terminal outcomes separately from previews and prints, and retain its own issuance/audit requirements.

## Goals vs. Non-Goals

* **In-Scope Goals:** Support reusable letterheads in admit-card and marksheet templates; provide preview and PDF output for both; offer reversible field/section/column visibility controls in templates; warn on potentially unreadable four-up admit cards and let staff choose how to proceed; define immutable revision binding to published templates; specify identity sources and scope; define header/footer reservation and layout validation; preserve legacy template behavior and historical output; reuse existing institute branding and asset storage when suitable; establish authorization, audit, and diagnostic requirements.
* **Out-of-Scope Non-Goals:** Include fee receipts/invoices or certificates in the first release; silently update templates when a shared letterhead changes; replace existing institute branding or file upload systems without evidence; assume all document families use one renderer; change certificate issuance, numbering, approval, signing, or verification without separate requirements; add caching or asynchronous bulk processing before scale evidence supports it.

## Alternatives Weighed

1. **Extend existing template layout/versioning with the smallest repeatable identity and header/footer settings.** This is the simpler option if staff do not need to edit and manage reusable letterheads independently. It avoids a second lifecycle and binding model.
2. **Create a shared versioned library selected by templates.** This supports reuse across document families, but adds lifecycle, authorization, revision-retention, UI, and migration work. Proceed only if cross-template reuse is a confirmed need.
3. **Reuse only the current institute letterhead upload.** This avoids duplicate asset storage, but an uploaded sheet may not provide the configurable identity fields and reserved layout dimensions described by the concept. Reuse it as an asset where it fits, rather than treating it as the complete feature by assumption.
4. **Include certificate issuance in the same first release.** Deferred because issuance may require controls beyond page design and rendering, and modifying a letterhead must not alter already-issued certificates.

## Key Decisions & Staging for Next Steps

- Keep fee receipts and invoices deferred. Revisit only after the admit-card and marksheet PDF paths are proven.
- Decide the binding model: immutable published letterhead revisions pinned by immutable published template revisions; explicit update creates a new template revision.
- Define identity fields, source of truth, institute/branch boundaries, and render-time substitutions.
- Decide how reserved dimensions interact with existing positioned layouts and define independent acceptance behavior for admit-card A4 imposition and marksheet pagination.
- Define the visibility policy for required versus optional fields, and the exact warning threshold and proceed choices for four-up admit cards with long schedules.
- Preserve unassigned legacy templates and current output; choose an additive rollout and rollback strategy.
- Confirm authorization, asset limits, revision retention, audit events, and support diagnostics.
- Keep certificate issuance as a separate decision. If brought into scope, require its issue-time revision pinning and historical verification behavior to be specified first.
- Before implementation planning, map the admit-card and marksheet rendering paths and validate PDF output against representative single-page, multi-page, and compact-layout cases.
