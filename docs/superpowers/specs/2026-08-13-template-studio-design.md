# Template Studio — Design Spec

**Date:** 2026-08-13
**Scope:** `apps/institute-admin-web` (React) + `services/api` (Django)
**Status:** Approved by user (brainstorming session 2026-08-13)
**Reference:** user-supplied prototype `school-erp-template-builder.html` (Downloads) — its layout,
interactions, and feature set are the visual/UX source of truth for the editor.

## 1. Goal

Replace the structured-form template editor with a platform-wide **Template Studio**: a
Canva-style free-canvas, drag-and-drop editor for five document categories — Fee Invoice,
Fee Receipt, Mark Sheet, ID Card, Certificate. Users drag elements (text, tables, images,
totals, shapes, signatures, QR codes) and merge-field tokens onto an accurate page, edit
properties in a side panel, and print pixel-faithful output. Three ready-made presets ship
per category; everything is customisable.

**Explicitly not in finance:** the Studio is a top-level module. The finance suite's
Templates section is removed; invoice/receipt flows keep only a template *picker* filtered
to their categories.

## 2. Decisions locked during brainstorming

1. **Free canvas** (Figma/Canva-style absolute positioning), not zones-only or grid-snap-only —
   with snap-to-guides, bounds clamping, and guardrails.
2. **Canvas format replaces the v1 layout format entirely.** Testing phase: no data
   migration — existing template rows are deleted; presets reseed natively in v2.
3. **Element palette:** text (with `{{token}}` placeholders), items table, image/logo,
   shapes & bands, divider, totals block, signature, QR code.
4. **Overflow = grow-and-push:** the table grows with real rows at render time; elements
   below the table's bottom edge shift down; content past the page bottom paginates with
   the table header repeated. Elements beside/above never move.
5. **Hand-rolled DOM canvas** — absolutely-positioned divs + one pointer-events
   drag/resize hook. No drag library. Only new dependency: a small QR generation lib
   (plus `pako` or the native CompressionStream for deflate).
6. **Spreadsheet-style formulas** with the reference's syntax, evaluated by a **safe
   parser** (tokenizer + recursive descent + AST evaluation). `new Function`/`eval` never
   touches stored content.
7. **QR self-contained documents:** QR encodes a verify URL whose `#fragment` carries the
   compressed document data; a static login-free page renders it without any database.
8. **Phasing:** Phase 1 = complete Studio (all categories editable, presets, sample-data
   print, invoices/receipts live). Phase 2 = generation flows (mark-sheet batch, ID-card
   batch, certificate fill-and-print) and live data adapters for non-fee categories.

## 3. Document categories

| Category | Page size(s) | Pages | Live data (phase) |
|---|---|---|---|
| FEE_INVOICE | A4 portrait; half-top/half-bottom print areas | 1 | Finance invoices (Phase 1) |
| FEE_RECEIPT | A4 portrait; half areas | 1 | Finance payments (Phase 1) |
| MARKSHEET | A4 portrait | 1 | `AcademicOperation(kind=MARK)` payloads (Phase 2) |
| ID_CARD | CR80 86×54 mm | 2 (front/back) | Student / staff profile (Phase 2) |
| CERTIFICATE | A4 landscape | 1 | Student profile + free fields (Phase 2) |

Until a category's live adapter ships, the Studio provides full editing and printing with
realistic sample data (as in the reference prototype).

## 4. Template format (layout JSON v2)

Stored in `DocumentTemplate.layout`; backend validates shape/size, otherwise opaque.

```jsonc
{
  "version": 2,
  "page": {
    "sizeId": "A4P" | "A4L" | "CR80" | "A4P_HALF_TOP" | "A4P_HALF_BOTTOM",
    "marginMm": 10,
    "background": "#FFFFFF"            // or { "imageUrl": "..." }
  },
  "zones": {
    "headerMm": 24, "footerMm": 18,
    "repeatHeader": true, "repeatFooter": true,
    "hideHeaderOnFirstPage": false
  },
  "watermark": { "enabled": false, "mode": "text" | "image",
                 "text": "SAMPLE", "imageUrl": "", "opacity": 0.07 },
  "pages": [ { "elements": [ /* Element[] */ ] } ]   // 2 entries for ID_CARD (front/back)
}
```

**Units are millimetres** on the page's physical coordinate space (A4P = 210×297).
The editor converts mm↔px at zoom level; the print renderer emits mm-based CSS.

**Element (common):** `{ id, type, x, y, w, h, locked?: boolean }` plus per-type fields:

- `text`: `content` (may contain `{{token}}`), `style { fontSize, bold, italic, align, color }`
- `image`: `src: "institute-logo" | url`, `fallbackInitials`
- `table`: `datasetId`, `columns: [{ id, label, type: "data"|"formula", dtype?, formula?,
  widthPct, align }]`, `style { headerBg, headerColor, fontSize }`
- `totals`: `datasetId`, `rows: [{ id, label, kind: "value"|"formula", value?, formula?,
  emphasize? }]`
- `shape`: `shape: "rect"`, `fill` — `divider`: `stroke` color
- `signature`: `label` only in Phase 1 (the reference's e-sign / digital-stamp modes are
  Phase 2)
- `qr`: `encode: "verify-url" | "document-number"`

Constraints: at most one `table` element per template — grow-and-push is defined relative
to it, and templates without a table (ID cards, certificates) simply never paginate; zone
membership is derived from position (top edge inside header band / bottom
edge inside footer band), shown with zone tags exactly like the reference.

## 5. Formula engine (`engine/formula.ts`)

Reference-compatible syntax, safe implementation:

- Grammar: numbers, double-quoted strings, refs `[Column label]` / `[Row label]`,
  operators `+ - * / ( )` and comparisons `> >= < <= == !=`,
  functions `IF, SUM, AVG, MAX, MIN, ROUND, RANK, PERCENTILE, SUM_TABLE`.
- Implementation: tokenizer → recursive-descent parser → AST → evaluator with an explicit
  environment (row values, all rows for RANK/PERCENTILE, table columns for SUM_TABLE,
  earlier totals rows for `[Row]` refs). Cycle-safe (totals rows evaluate top-to-bottom;
  forward refs = `#ERR`).
- Any parse/eval error renders `#ERR` in that cell only; never throws to the UI.
- Shared by editor preview, print renderer, and (Phase 2) batch generation.
- Column editor UI per the reference: data/formula type toggle, ƒx input with live row-1
  preview, quick-formula chips per dataset, add/remove columns; totals row editor with
  fixed-value/formula rows, result preview, emphasize toggle.

## 6. Data-source registry (`engine/datasets.ts`)

Per category: token groups (grouped by source — Student / Invoice / Fees / School — with
search, drag-or-click insert), table datasets (column presets + sample rows), totals
presets, sample values, and a live-binding adapter interface:

```ts
interface DatasetAdapter {
  sampleRows(): Row[]
  liveRows(context: DocumentContext): Promise<Row[]>   // Phase 1: fee_items only
  tokens(context: DocumentContext): Record<string, string>
}
```

Phase 1 live adapters: `fee_items` (invoice line items) and fee/school/student token
resolution from the existing invoice + branding APIs — reusing what `invoiceRender.ts`
resolves today. Marks/ID/certificate adapters are Phase 2; their sample data ships now.

## 7. Editor architecture (frontend)

Feature folder `apps/institute-admin-web/src/features/documents/` (see structure below).
One editor for all categories; category drives page size, palette availability, token
groups, and datasets.

```
documents/
  TemplateStudioPage.tsx      — home: category cards → per-category gallery → editor
  studio/
    StudioEditor.tsx          — 3-pane shell (rail | stage | props) + toolbar
    CanvasStage.tsx           — page, zone bands, watermark, elements, selection,
                                drag/move/resize (usePointerDrag), snap guides, drops
    elements/                 — per-type renderers shared by stage and print pipeline
    PropertiesPanel.tsx       — Element tab (per-type forms) + Page tab (print area,
                                zones, watermark, background)
    ComponentRail.tsx         — palette, page-zone shortcuts, merge fields w/ search
    useEditorState.ts         — single reducer: elements, selection, history, page settings
  engine/
    formula.ts                — safe formula parser/evaluator
    datasets.ts               — registry (tokens, datasets, samples, adapters)
    docRender.ts              — layout+data → print HTML (mm CSS, zone repetition,
                                grow-and-push pagination, escaping)
    qrPayload.ts              — compact encode/decode + deflate for QR payloads
  verify/VerifyPage.tsx       — static login-free verify route (renders from #fragment)
```

**Toolbar:** undo/redo, sample-data toggle, zoom (40–200%), Preview print, Save.
**Canvas interactions** (all from the reference): drag from palette or click-to-add;
token chips drag onto text elements (append) or empty canvas (new text element);
selection with type-label badge and single corner resize handle; zone tags for
header/footer membership; element lock; duplicate/delete; double-click text →
**inline contentEditable** (not `prompt()`); Esc deselect; Delete key; arrow-key nudge
1 mm (Shift = 5 mm); snap to page margins/centre and sibling edges with visible guides;
elements clamp to the page; minimum sizes enforced.
**State:** one reducer (`useEditorState`) — every mutation dispatches; history is a
bounded snapshot stack (undo/redo); autosave is out of scope (explicit Save).

**Print pipeline:** `docRender.ts` replaces `invoiceRender.ts`. Emits a standalone HTML
document with mm-based CSS `@page` sizing, repeats header/footer-zone elements on every
page per zone settings (honouring `hideHeaderOnFirstPage`), applies grow-and-push, embeds
watermark and background, HTML-escapes every interpolated value (single escape choke
point, same discipline as today), and prints via the existing popup pattern. Invoice
editor live preview, payments receipt printing, and dues printing migrate to it;
`invoiceRender.ts` and the finance `TemplatesSection` are deleted.

## 8. QR self-contained documents

- QR content: `https://<app-host>/verify#<payload>`;
  payload = base64url(deflate(compact JSON `{ v:1, cat, num, date, inst, student, items,
  totals, status }`)).
- The fragment never reaches a server. `VerifyPage` decodes and renders a clean fixed
  layout from the fragment alone — no auth, no API, no database; only static hosting must
  be reachable.
- Capacity rule: if the encoded payload exceeds ~2.5 KB, deterministically degrade to a
  summary payload (parties + totals + status, no line items). QR always scans.
- `encode: "document-number"` mode stores just the number as plain text (internal
  scanning).
- Editor shows the QR with sample payload; real payloads are produced at print time from
  the bound document.

## 9. Backend (`services/api/modules/documents/`)

**Model `DocumentTemplate`:** id UUID, institute FK, name (120), `category`
(FEE_INVOICE / FEE_RECEIPT / MARKSHEET / ID_CARD / CERTIFICATE), `layout` JSON,
`is_default`, created_by, timestamps. Constraints: single default per (institute,
category) — partial unique, like today's per-kind constraint.

**Endpoints** (same conventions as the finance suite — `{success,data}` envelope,
`IsCurrentInstituteAdmin` tenant scoping, `audit_mutation` on every mutation,
paginated lists):

| Method | Path | Notes |
|---|---|---|
| GET/POST | `documents/templates` | `?category=` filter; GET seeds presets per category on first access |
| GET/PATCH/DELETE | `documents/templates/<id>` | delete blocked for defaults; default-switch atomic |

**Layout validator:** version==2, sizeId whitelist, ≤2 pages (2 only for ID_CARD),
element-count cap (200), per-element numeric bounds, 64 KB total cap. Otherwise opaque.

**Finance changes:** drop `InvoiceTemplate` (delete rows + model; testing-phase reset);
repoint `FeeInvoice.template` FK to `documents.DocumentTemplate` (SET_NULL); remove
`fees/templates` endpoints and their tests; invoice/receipt pickers call
`documents/templates?category=...`.

**Navigation:** new top-level sidebar entry "Template Studio" (single route, own view id);
finance sub-sidebar loses its Templates item.

## 10. Presets (~15, authored as v2 JSON)

- **Invoice ×3:** classic letterhead, colour band, minimal.
- **Receipt ×3:** counter receipt, A4 half-top with cut line, formal.
- **Mark sheet ×3:** term report (grade-band IF formulas), compact result slip,
  detailed (RANK + PERCENTILE columns, result summary totals).
- **ID card ×3:** student photo card (front/back), staff card, minimal.
- **Certificate ×3:** achievement, participation, character (A4 landscape, border
  shapes).

Every preset prints correctly with sample data out of the box and demonstrates the
features (formulas on mark sheets, QR on invoices, zones on multi-page-capable docs).

## 11. Security

- Formula engine: no code evaluation; parser rejects unknown identifiers; property-name
  attacks (`constructor`, `__proto__` as labels) are inert strings.
- Rendering: single `escapeHtml` choke point in `docRender.ts`; colours/URLs/alignment
  whitelisted or escaped exactly as the current renderer does (carrying over the
  hardening from the finance renderer reviews).
- Verify page renders only from its own fragment; no tenant data fetched; nothing logged
  server-side from the fragment.
- Backend: tenant scoping on every query; audit events on create/update/delete/default
  switch; layout validator prevents oversized/malformed payloads.

## 12. Testing

- `formula.ts`: arithmetic, precedence, IF nesting, RANK/PERCENTILE, SUM_TABLE, row refs,
  string handling, `#ERR` paths, injection-shaped inputs.
- `docRender.ts`: escaping, mm geometry per sizeId, zone repetition + hideHeaderOnFirst,
  grow-and-push pagination, CR80 two-page output, watermark.
- `qrPayload.ts`: round-trip, unicode, oversize degradation rule.
- `useEditorState`: undo/redo, drop, move/resize clamping, lock behaviour, page settings.
- Backend: per-endpoint tenant isolation, default constraint, validator rejections,
  audit events, preset seeding idempotency.
- App smoke test: Studio route renders, category gallery opens editor.

## 13. Phase plan

**Phase 1 (this spec's implementation plan):** documents backend module + finance
repoint; engine (formula, datasets w/ fees live + samples for all, docRender, qrPayload);
Studio UI (home, editor, rail, stage, props panel); all 15 presets; verify page;
invoice/receipt flows migrated to docRender; finance TemplatesSection + invoiceRender
removed; navigation.

**Phase 2 (separate spec later):** marks payload contract + live mark-sheet adapter;
ID-card batch generation (pick students/staff → print sheet); certificate fill-and-print
flow; signature e-sign/stamp modes; QR verification against live records.
