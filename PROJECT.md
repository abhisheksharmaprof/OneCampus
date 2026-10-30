# Project: CampusOne Template Studio Master Execution

## Architecture
- **Parallel Replacement Strategy**: Complete separation between existing LayoutV2 studio/render flows and new LayoutV3 Studio Next. Existing templates, published records, and print flows remain functional with zero regressions.
- **Shared Schema & Engine (`packages/document-engine`)**: Standalone TypeScript package `@campusone/document-engine`. Single source of truth for LayoutV3 schemas, geometric normalization (mm units), legacy v2-to-v3 conversion, render plan assembly (`buildRenderPlan`), and safe HTML generation (`renderDocumentHtml`).
- **Frontend Studio Next (`apps/institute-admin-web/src/features/documents/studio-next/`)**: Modern 5-zone document studio (Top Bar, Left Component/Field Rail, Canvas Stage with 8-handle transformation, Right Inspector Stack, Bottom Status/Zoom Bar). Revision-aware saves with conflict resolution (`expectedRevision`).
- **Backend Documents API (`services/api/modules/documents/`)**: Django REST Framework endpoints for templates, versions, saved blocks, render jobs, and certificate issuance. Multi-tenant isolation enforced via `IsCurrentInstituteAdmin` and mandatory `branch_id` scoping.
- **Private Chromium Renderer (`services/document-renderer`)**: Greenfield Node.js microservice running headless Chromium via Playwright. Strictly sandboxed networking (no arbitrary external URL fetches; Base64/data URLs only), bundled versioned fonts, and deterministic page metrics.
- **Asynchronous Execution & Storage**: Redis/Celery background tasks for bulk rendering and 24-hour ephemeral artifact lifecycle. Cloudflare R2 / Azure Blob Storage integration via `modules/file_storage`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | TS-01 | Template Gallery, search, create/open, duplicate, defaults, draft/publish/archive, guarded delete, Custom Document role | M1, M6 | survey |
| 2 | TS-02 | Studio header: back/title/role, template switching, Create copy as…, master selector, dirty/save/revision states, print preview, JSON export/copy | M1 | survey |
| 3 | TS-03 | Undo/redo history, sample data toggle, zoom controls, mm rulers, separate grid/snap, bleed/safe area, inherited element protection | M1 | survey |
| 4 | TS-04 | 4 left tabs (Elements, Merge Fields, Saved Blocks, Layers) and 3 inspectors (Element, Watermark, Page & Zones) | M1, M4 | survey |
| 5 | TS-05 | 12 element types: text, image/logo, static table, dynamic table, totals, shape/band, divider, signature, QR, barcode, student photo frame, page border | M1, M2, M3 | survey |
| 6 | TS-06 | 8 resize handles, proportional corners, edge stretch, aspect ratio lock, numeric X/Y/W/H in mm, rotation stem, Shift 15° snaps, horizontal/vertical flip | M1 | survey |
| 7 | TS-07 | Smart alignment guides, keyboard nudging, multi-select, duplicate, delete, lock, visibility, z-order, layer drag/reorder, zone reassignment | M1 | survey |
| 8 | TS-08 | 4-layer tree (Header, Body, Footer, Background), inherited master badges, protected background bands, local-only unlock | M1, M4 | survey |
| 9 | TS-09 | Typography: font family/weight/size, bold/italic/underline, line height, letter spacing, text alignment, vertical alignment, text transform | M2 | survey |
| 10 | TS-10 | Styling: text/fill colors, hex/RGB/opacity, linear/radial gradients, per-edge borders, border radius, element opacity | M2 | survey |
| 11 | TS-11 | Searchable/collapsible merge fields, token insertion, fallback values, conditional prefix/suffix, auto-fit with visible overflow diagnostics | M2, M6 | survey |
| 12 | TS-12 | Asset manager: uploads/presets, contain/cover, pan/zoom crop, masks (square, rounded, circle, hexagon), filters (grayscale, brightness, contrast, white threshold removal) | M2 | survey |
| 13 | TS-13 | Bound/cropped student photo frames, signature blocks, missing-asset diagnostics, owned/versioned assets, verifiable QR and 1D barcodes | M2 | survey |
| 14 | TS-14 | Static tables: MxN grid, column divider dragging, cell merge/split, mixed labels/tokens, cell typography, padding, borders, background striping | M3 | survey |
| 15 | TS-15 | Dynamic tables: data bindings to named arrays, designed header rows, repeating row templates, field mapping, totals formulas, multiple tables | M3 | survey |
| 16 | TS-16 | Table borders & independent gridlines, thickness/color presets, per-side padding, vertical/column alignment, zebra toggle/tint | M3 | survey |
| 17 | TS-17 | Measured pagination engine: font/asset readiness, body flow across pages, repeated headings, trailing totals/signatures, overflow diagnostics | M3 | survey |
| 18 | TS-18 | Master letterheads: link/binding, draft updates, published version freezing, local detach & override, edit-master navigation | M4 | survey |
| 19 | TS-19 | Draggable header/footer zone boundaries, live mm labels, body reflow, bottom-anchored footer, first/repeat page rules, page numbers | M4 | survey |
| 20 | TS-20 | Saved blocks: header, footer, signature, badge blocks; preview/save/rename/insert/delete; local copy on insertion | M4 | survey |
| 21 | TS-21 | Watermark engine: None/Image/Text/Both, school logo/upload, static/dynamic text, font/size/color, scale, opacity, angle presets | M4 | survey |
| 22 | TS-22 | Watermark placement: center page/body, custom X/Y, tiled grid with spacing; locked background layer below content | M4 | survey |
| 23 | TS-23 | Page setup: page formats (A4P, A4L, CR80, half-sheets), orientation, margins, page border/frame, bleed/safe-area guides | M4 | survey |
| 24 | TS-24 | Production print & server PDF rendering: shared render plan parity, wait for fonts/assets, preserve fills/gradients/masks/watermarks | M5 | survey |
| 25 | TS-25 | Domain data integrations: live school/student fields, finance fee receipts, published exam schedules, academic result snapshots, certificate issuance | M6 | survey |
| 26 | TS-26 | Imposition engine: 2-up half-sheet admit cards on A4; CR80 front/back mirrored duplex pairing with blank slot handling | M6 | survey |
| 27 | TS-27 | Bulk generation engine: preflight diagnostics, progress tracking, cancel/retry idempotency, authorized download, 24-hr expiry, 500-doc workloads | M5, M7 | survey |
| 28 | TS-28 | Usability & accessibility: responsive layout, keyboard alternatives, ARIA focus/announcements, loading/error/empty states | M1-M7 | survey |
| 29 | TS-29 | Legacy migration: automated v2-to-v3 conversion copy, visual comparison, pilot per institute, rollback rehearsals, historical output preservation | M7 | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Studio Next Core Canvas & Workspace | Sprint 2: 5-zone workspace, canvas stage, 8 handles, rotation, flips, snap guides, layer tree, history, revision saves; resolve 7 TS union errors | none | DONE (167 vitest tests pass, 22 pytest pass, 0 type errors, clean build) |
| M2 | Typography, Styling, Merge Fields & Assets | Sprints 3 & 4: Typography, rich text tokens, colors/gradients, borders, field catalog, auto-fit diagnostics, asset manager, photo frames, QR/barcodes | M1 | DONE (256 vitest tests pass, 22 pytest pass, 0 type errors, clean build, unanimous gate PASS) |
| M3 | Tables & Measured Multi-Page Pagination | Sprints 5 & 6: Static MxN tables, merge/split, cell styling; dynamic tables, dataset bindings, totals; measured pagination engine, repeated headings, body flow | M2 | DONE (427 vitest tests pass across 24 files, 22 pytest pass, 0 type errors, clean build, unanimous gate PASS) |
| M4 | Masters, Zones, Saved Blocks & Watermarks | Sprint 7: Master letterheads, draft/published freeze, detach/override; draggable zone dividers; saved blocks library; watermark engine | M3 | PLANNED |
| M5 | Headless Chromium PDF Engine & Render Jobs | Sprint 8: Greenfield `services/document-renderer` microservice, `DocumentRenderJob` model, Celery tasks, PDF export, 24-hour cleanup | M4 | PLANNED |
| M6 | Domain Integrations, Imposition & Certificates | Sprints 9, 10 & 11: CUSTOM document role & manual inputs; live admit card adapter, marksheet diagnostic adapter; 2-up & CR80 imposition; certificate issuance ledger & verification | M5 | PLANNED |
| M7 | Bulk Reliability, Migration & Rollout Polish | Sprints 12 & 13: 500-record bulk preflight, chunked streaming PDF generation, memory budgeting; v2-to-v3 migration verification, pilot, rollout docs | M6 | PLANNED |
| E2E | E2E Testing Suite Track | Independent requirement-driven opaque-box test suite covering Tiers 1-4 across TS-01..TS-29; produces `TEST_READY.md` | none (parallel) | IN_PROGRESS |
| FINAL | E2E 100% Pass & Coverage Hardening | Final Milestone: Phase 1 (100% pass of Tiers 1-4); Phase 2 (Tier 5 adversarial coverage hardening with Challenger) | M7, E2E | PLANNED |

## Interface Contracts
### `packages/document-engine` ↔ Frontend `studio-next`
- `normalizeLayout(input: unknown): LayoutV3` - Validates and normalizes layout geometry in millimeters; throws on invalid bounds or non-finite numbers.
- `convertLegacyLayout(input: LayoutV2): { layout: LayoutV3, diagnostics: RenderDiagnostic[] }` - Non-destructive conversion.
- `buildRenderPlan(template: LayoutV3, data?: DocumentDataV3, assets?: Record<string, string>): RenderPlan` - Assembles static & dynamic pages.
- `renderDocumentHtml(plan: RenderPlan): string` - Pure HTML/CSS string for preview and Chromium rendering with `@page` millimeter styling.

### Frontend `studio-next` ↔ Backend `services/api`
- `GET /api/v1/documents/templates/<id>/` → `DocumentTemplateRecord` (includes `layout_revision`).
- `PATCH /api/v1/documents/templates/<id>/` with `{ layout, expectedRevision }` → 200 with incremented revision, or 409 Conflict `{ error: "STALE_TEMPLATE_REVISION", current_revision }`.
- `POST /api/v1/documents/templates/<id>/publish/` → 201 with immutable `DocumentTemplateVersion`.
- `POST /api/v1/documents/templates/<id>/convert-copy/` with `{ preview?: boolean }` → 200 preview diagnostics or 201 new v3 copy.

### Backend `services/api` ↔ Renderer `services/document-renderer`
- `POST /render/pdf` with `{ html: string, page: { widthMm, heightMm, marginsMm } }` → binary application/pdf.
- Sandbox: Network disabled (`networkidle` not dependent on external CDNs; fonts bundled locally).

## Code Layout
```
/media/abhi/Shared/CampusOne/
├── apps/institute-admin-web/
│   └── src/features/documents/
│       ├── studio-next/                  # Milestone 1-4: New LayoutV3 Studio
│       │   ├── components/               # CanvasStage, Toolbar, Inspectors, Panels
│       │   ├── hooks/                    # useStudioState, useHistory, useSelection
│       │   ├── types/                    # Studio UI state types
│       │   └── StudioNextPage.tsx        # Main entry route
│       ├── studio/                       # Retained existing LayoutV2 Studio
│       └── documents.api.ts              # API client for document templates
├── packages/document-engine/
│   ├── src/
│   │   ├── types/                        # LayoutV3, ElementV3, RenderPlan
│   │   ├── normalizer.ts                 # normalizeLayout
│   │   ├── converter.ts                  # convertLegacyLayout
│   │   ├── pagination.ts                 # Milestone 3: Measured pagination
│   │   ├── renderHtml.ts                 # renderDocumentHtml
│   │   └── index.ts                      # Main exports
│   └── test/                             # Vitest engine contract tests
├── services/api/
│   └── modules/documents/
│       ├── models.py                     # DocumentTemplate, DocumentTemplateVersion, DocumentRenderJob, CertificateIssuance
│       ├── layout_v3.py                  # Python LayoutV3 validation & conversion
│       ├── tasks.py                      # Milestone 5, 7: Celery bulk render tasks
│       ├── api/views.py                  # REST API viewsets
│       └── adapters/                     # Milestone 6: Academics, Finance, Students data adapters
└── services/document-renderer/           # Milestone 5: Greenfield Node.js Playwright microservice
    ├── src/server.ts                     # Fastify/Express rendering server
    ├── Dockerfile                        # Headless Chromium container
    └── package.json
```
