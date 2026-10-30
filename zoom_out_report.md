# Stage 5 — Initial Zoom Out

Mode: REVIEW. Lens: Skeptical Architect. Target: `docs/designs/exam-creation-scheduling.md`, full lines 1–354. Result: **0 Blocker / 1 Major / 0 Nit**. Review complete for this lens; focused source coverage, not an exhaustive runtime audit.

## S5-ZO-01 — Major — Include the required SQL setup snapshot in the schema change

- Target: lines 279–285 (ordered schema checklist), 309–321 (remaining file checklist), 329–343 (execution/schema verification).
- Source: `README.md:98–118`; `school_platform_schema.sql:5–15`, with existing assessment definitions at `school_platform_schema.sql:664–704` and generic academic operations at `school_platform_schema.sql:1334–1342`.
- Discrepancy: the plan adds four tables and two permission catalog entries through Django models/migrations but omits `school_platform_schema.sql` entirely. Repository instructions require that snapshot to be updated for every table, constraint, index, or seed-permission change in the same task. Completing the checklist as written would leave the human-reviewed setup schema inconsistent with the new exam authority. The snapshot also contains older assessment/marks definitions; its existing scope must be reconciled explicitly rather than inadvertently creating another apparent exam source.
- Recommendation: add one checklist item to update the snapshot with the four draft tables, relevant relationships/constraints/indexes, and new permission seeds; describe how its existing assessment definitions relate to the staged exam model without requiring Stage 2 implementation. Add a schema-contract comparison to the planned verification. Preserve Django migrations as runtime authority.
- Classification: **proven omission in the proposed implementation plan**, not a demonstrated existing runtime defect or a demand that planned files already exist. This adds the repository-required artifact; it does not expand the accepted feature scope.

## Architectural assessment

The root objective and first-slice boundary are clear. One exam authority, explicit academic identities, existing role configuration transport, existing session flow, and existing audit/request primitives are appropriate reuse. No evidence supports adding a solver, queue, separate login provider, shared permission framework rewrite, or broad compatibility machinery. Draft history and retry receipts have distinct approved transactional purposes; this review does not reopen those decisions. Concrete file/API detail is appropriately concentrated in the technical and implementation sections rather than the overview.

Reuse searches found `audit_mutation`/`write_audit_event`, the existing `RoleBuilderPage` configuration mechanism, role grant services, active-window helpers, institute-admin helper, and the normal identity session resolver. A file-upload idempotency validator exists but validates a storage-specific key format; it is not a reusable exam receipt service and does not justify importing storage-domain policy into academics. No reusable exam scope/receipt implementation was established by the search. Ranked retrieval is not proof of absence across every unindexed file.

## Read-evidence ledger

All ranges below were returned without tool-output truncation. Source skeletons list signatures/spans and are not claimed as full implementation reads.

| Material | Coverage |
| --- | --- |
| EGM `agents/zoom_out.md` | Full file, 1–74 |
| EGM `resources/document_standards/zoom-out-standard.md` | Full file, 1–60 |
| `.agents/skills/graft/SKILL.md` | Full file, 1–150 |
| Target | Full 1–354, bounded reads 1–180 and 181–354 |
| `concepts_brief.md` | Full 1–169 |
| `exam_scheduling_goldfish_review.md` | Full 1–125 |
| `design_draft.md` | Full-file diff against fully read target; only difference is relative input-link destinations at line 6. No independent semantic difference. |
| `README.md` | Full 1–224, as required by zoom-out project-alignment standard |
| `services/api/modules/academics/models.py` | Complete skeleton; exact source 243–356 (section and subject-assignment identities) |
| `services/api/modules/academics/api/views.py` | Complete skeleton; exact source 65–128 (generic writer); graft full source 676–740, 743–786 |
| `services/api/modules/access_control/policies.py` | Complete skeleton and full source 1–26 |
| `services/api/modules/access_control/selectors.py` | Complete skeleton; exact source 1–56 |
| `services/api/modules/institutes/api/permissions.py` | Complete skeleton; exact source 45–73 |
| `services/api/modules/access_control/api/permissions.py` | Complete skeleton and full source 1–32 |
| `services/api/modules/identity/services.py` | Complete skeleton and full source 1–123 |
| `services/api/modules/access_control/services.py` | Complete skeleton; graft source 32–43, 47–77 |
| `services/api/modules/access_control/api/serializers.py` | Complete skeleton; graft source 52–65 |
| `services/api/modules/academics/api/urls.py` | Skeleton found no indexed definitions; full source 1–75 read |
| `apps/institute-admin-web/src/features/access-control/RoleBuilderPage.tsx` | Complete skeleton; full returned function 33–187 read after expanding its truncated graft span; graft source 16–31 |
| `apps/institute-admin-web/src/features/access-control/types.ts` | Complete skeleton, definitions 1–73 |
| `apps/institute-admin-web/src/features/access-control/access-control.css` | Full 1–33 |
| `apps/institute-admin-web/src/features/academics/AcademicOperationsPage.tsx` | Complete skeleton, definitions 15–152 |
| `apps/institute-admin-web/src/App.tsx` | Complete skeleton, definitions 66–336 |
| `apps/institute-admin-web/src/components/layout/AppShell.tsx` | Complete skeleton, definitions 32–279 |
| `apps/institute-admin-web/src/adminNavigation.ts` | Complete skeleton, definitions 1–205 |
| `apps/institute-admin-web/src/features/academics/INTEGRATION.md` | Full 1–20 |
| `services/api/tests/test_academics_api.py` | Complete skeleton, definitions 13–347; not executed |
| `services/api/tests/test_identity_sessions.py` | Complete skeleton, definitions 13–165; not executed |
| `services/api/tests/test_session_lifecycle.py` | Complete skeleton, definitions 8–142; not executed |
| `services/api/tests/test_access_control_api.py` | Complete skeleton, definitions 8–147; not executed |
| `services/api/tests/test_access_control_foundation.py` | Complete skeleton, definitions 20–194; not executed |
| `apps/institute-admin-web/src/features/access-control/__tests__/RoleBuilderPage.test.tsx` | Skeleton no definitions; full source 1–23; not executed |
| `apps/institute-admin-web/src/App.test.tsx` | Skeleton no definitions; full source 1–436 in bounded chunks; not executed |
| `apps/institute-admin-web/src/Auth.test.tsx` | Skeleton; exact source 1–110 of 211; remaining test bodies uninspected; not executed |
| `apps/institute-admin-web/src/features/academics/__tests__/AcademicOperationsPage.test.tsx` | Skeleton and full source 1–65; not executed |
| `services/api/platform_core/api/audit.py` | Graft full source 36–84, 87–116 |
| `services/api/modules/file_storage/services/uploads.py` | Graft source 52–60 only, reuse candidate |
| `services/api/modules/attendance/models.py`, `api/views.py` | Graft source history definition 162–166 and history view 581–601, reuse candidates |
| `school_platform_schema.sql` | Focused source 1–20, 650–745; indexed-text search anchors 1334–1342; not whole-file read |

Existing-file availability: target's existing source/document paths were inventoried; none was missing or inaccessible. The shortened `selectors.py` reference resolves beside `policies.py`. Shell command strings in the verification section are commands, not missing filenames. All `Create` entries (new migrations, scope/service/API modules, reset command/package initializers, exam UI/types/API/styles, and new tests) are planned work and were not reported as missing evidence. No tests, runtime flows, grant writes, migrations, or data cleanup were run. Only this raw report was written under the delegated read-only exception. Uninspected source internals and transitive historical-review inputs are not represented as inspected.

Graft: 30 calls (map 1, ask 3, grep 1, skeleton 25); tool-estimated whole-file-baseline savings **824,756 tokens**. These estimates are not measured token consumption or exhaustive caller evidence.
