# Stage 9 codebase details raw review

Complete, needs work. **0 Blocker / 1 Major / 1 Nit.**

## S9-CB-01 — Major — Seeded permissions lack Role Builder discovery

Target 285,298–299,315,318. `RoleBuilderPage.tsx:54–75,156–162` loads roles and renders a catalog derived exclusively from existing grants by `access-control.utils.ts:33–36`. Newly seeded assessment.view/edit with no visible role grant therefore cannot appear. Specify complete delegable-catalog discovery independent of granted permissions, including backend response/transport/catalog derivation. Cover new catalog entries with no existing grants, preserving no broad defaults. This is a source-backed planned integration omission.

## S9-CB-02 — Nit — Real year options leave hard-coded current-year behavior

Target 308,345. `AppShell.tsx:128,164–170,268–273` compares against literal 2026-27, displays historical read-only banner, and switches back to that literal. Replacing dropdown options alone leaves those behaviors unspecified. Include them in AppShell work; define current-year identity and historical draft-edit policy, verify a different current year.

Read ledger: full codebase_details persona, implementation-readiness standard, graft skill, target 1–354 (active 265–354), concepts_brief 1–169, exam_scheduling_goldfish_review 1–125; bounded rereads recovered oversized output. Source inspected: RoleBuilderPage.tsx 16–25,33–187; access-control.utils.ts 1–57; AcademicOperationsPage.tsx 15,141–152; admin.api.ts 215–256; identity/services.py 50–109; access_control/api/permissions.py 17–32; access-control.api.ts 47–49; AppShell.tsx 62–279. App.tsx/navigation file hits not source inspection. No exhaustive auth callers, catalog endpoint, migrations, audit, seeds or test infrastructure audit. No inaccessible required document. Create files planned; accepted boundaries preserved. No history/memory, tests, writes, runtime or cleanup. Graft **25,636 estimated tokens / 3 calls**.
