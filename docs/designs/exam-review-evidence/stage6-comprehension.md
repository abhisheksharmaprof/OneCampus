# Stage 6 — Comprehension

Target: `docs/designs/exam-creation-scheduling.md`, feature 1–264 and implementation 265–354. Complete for this lens. **0 Blocker / 3 Major / 0 Nit.** These are contract gaps, not established runtime defects.

## S6-CO-01 — Major — Wire contracts cannot yet reconstruct matching clients and servers

Target 173–186, 269–275, 292, 301–302. Endpoints lack request UUID location, optional/null/clearing rules, target/effective-action representations, options responses, create-only receipts and stable error/conflict payloads. PATCH clearing optional dates is one unresolved example. Existing pagination supplies metadata, not these exam fields. Add a compact shared schema with requests, response variants, nullable fields and errors.

Evidence: `services/api/platform_core/api/pagination.py:4–24`, `apps/institute-admin-web/src/features/admin/admin.api.ts:215–256`, `apps/institute-admin-web/src/features/academics/academics.api.ts:134–138`.

## S6-CO-02 — Major — Replay after later edits has no precise result

Target 192, 271, 291, 347. “Same saved result” and a receipt containing an exam reference do not choose original revision versus current detail after a subsequent edit. Current access might cover original targets but not new ones. Specify replay status/body, revision identity and scope checks, including a reduced response when create remains permitted but view does not. This clarifies the approved retry design.

## S6-CO-03 — Major — Selected grant JSON leaves section/subject associations ambiguous

Target 149, 153, 273, 286, 298, 311. Independent `classSectionIds` and `subjectIds` arrays do not explain required section/subject pairs or overlapping grant unions. Define whether subjects intersect current ClassSubject mappings or require explicit pairs, and give two concrete examples including overlapping grants. The persisted grant format and Role Builder are first-slice commitments even though subject editing is later.

Evidence: `apps/institute-admin-web/src/features/academics/academics.api.ts:87–93`; `services/api/modules/academics/api/views.py:676–786`.

## Read evidence and limits

| Material | Coverage |
| --- | --- |
| EGM comprehension persona | Full |
| EGM re-implementation standard | Full |
| Repository graft skill | Full |
| Target | Full 1–354; truncated initial output supplemented with 171–264 |
| `concepts_brief.md` | Full 1–169; separate reread after combined-output truncation |
| `exam_scheduling_goldfish_review.md` | Full 1–125 |
| Source | Exact spans above, no returned truncation |
| Orientation | Graft repository map |

Remaining referenced source files and live configuration/runtime were uninspected. No source-wide inventory or exhaustive caller claim. Create paths are planned. No inaccessible evidence encountered. Accepted scope/reset/permission/stage decisions preserved. No tests, runtime changes, cleanup or memory retrieval.

Graft: **749,408 estimated tokens saved, 3 calls**. Review returned by completed fresh-context reviewer; orchestrator wrote artifact.
