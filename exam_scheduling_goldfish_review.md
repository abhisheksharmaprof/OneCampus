# Exam scheduling Goldfish brainstorm review

Date: 2026-10-23. Mode: BRAINSTORM.

Target: `exam_scheduling_concepts_brief.md`, lines 1–126. Canonical synthesis: `concepts_brief.md`. The original proposal is preserved.

All six independent fresh-context reviewers completed. Raw findings: 0 Blocker, 16 Major, 5 Nit. After combining overlaps and folding operational signals/reuse into their corresponding requirements: **0 Blocker, 11 Major, 2 Nit**.

No current Stage 1 blocker was demonstrated. Major findings are requirements for the affected stage's design/release, not proof of an existing production defect. The review does not approve implementation or require deferred stages in the first release.

## Prioritized findings

### 1. Legacy authority and rollback — Major

Lens: implementation-readiness. Target: 14–16, 94–98, 105–108. Stage 1 release gate.

Legacy readability alone does not prevent generic and structured writers from creating divergent records, nor ensure old application code can read new records after rollback. Inventory readers/writers; select one authoritative write path and a policy for legacy edits/unconverted records. Define mixed-version and rollback behavior before activation. Conversion must retain tenant/exam identity and resume without duplication. Actual adapter/schema mechanics remain detailed design.

### 2. Grant compatibility and permission recovery — Major

Lenses: implementation-readiness, comprehension. Target: 72–92. Stage 1 access gate; later actions at activation.

Existing `assessment.create` grants may lack the new scope semantics. Inventory consumers/configuration, choose safe legacy/unknown handling and deliberate new grants, and coordinate policy/grant rollout without widening authority. Trace admin guards and grant composition. UI feedback must explain missing action/scope or expired access without leaking data and preserve recoverable work where authorized. Teacher self-publication with permission remains confirmed; no extra approval workflow is introduced.

### 3. Coherent publication and validation inputs — Major

Lenses: design, structural, codebase-details. Target: 10, 38, 50–52, 62–64, 94–98. Stage 4 gate.

A timetable revision and stable subject ID alone do not preserve assessment limits, candidate membership or historical labels. Publication must identify coherent schedule/assessment/participation versions. Decide snapshot versus commit-time freshness and an explicit correction/reconciliation policy. Preserve rule/version, input coverage and explainable final outcomes; bind warning acknowledgement to the relevant rule/revision. Later consumers should not invent their own reconstruction rules.

### 4. Atomic conflict acceptance and resource authority — Major

Lenses: design, structural. Target: 40–41, 52, 55, 62, 66, 98. Stage 4 candidates; Stage 5 resources.

Two different exams can both pass availability checks before either commits. Stale saves within one schedule do not solve this. Validate and commit accepted intervals atomically; choose transaction/constraint/locking and retry behavior during design. Resource assignments need one reservation/conflict authority and shared intervals including agreed buffers/extra time. Calendar integration must expose incomplete coverage. No room scheduler is required for Stage 1.

### 5. Coverage and validation repair — Major

Lens: comprehension. Target: 27, 40, 50, 62–64, 117. Stage 4 policy/UI.

Distinguish clear checks, detected conflicts and checks that cannot run. Link errors to affected rows/candidates and correction surfaces, identify prerequisite-data maintainers, and return staff to the saved draft. Decide whether incomplete candidate coverage blocks publication or permits a clearly provisional timetable. Missing inputs must never appear conflict-free.

### 6. Correlated outcomes and attributable history — Major

Lens: codebase-details; reuse from zoom-out. Target: 29, 37, 40, 54–56, 82–90, 98, 106, 111. Stage 1 operations; Stage 4 lifecycle.

Support must distinguish denied/invalid/stale/failed writes from a committed write whose response was lost. Reuse existing audit/error mechanisms for correlation IDs and structured outcomes. Keep attributable create/edit/duplicate/publish/reschedule/cancel/reconcile history with source/result revisions and reconstructable changes. State and history must agree atomically or have a recovery mechanism. Do not put sensitive candidate data in telemetry or build a separate audit platform by default.

### 7. Bounded bulk work and operational signals — Major

Lenses: design, codebase-details. Target: 31, 35–43, 49–52, 94, 102–111. Stages 3–4.

Candidate-by-paper checks can multiply queries and transaction time. Establish representative first-school scale, bulk limits and latency targets; batch membership reads and scope interval queries. Track unexpected failures/latency separately from expected input, stale-edit and permission outcomes, with a support owner. No measured evidence currently warrants a queue, external solver or tracing deployment.

### 8. Bound supported grading rules — Major

Lens: zoom-out. Target: 38, 94, 107, 116. Stage 2 product decision.

Requiring every marks/grade/hybrid and pass-rule family before scheduling risks building a generic grading system. Agree the first school's supported rules and retain explicit unsupported-rule reporting. Reuse curriculum defaults as inputs while preserving exam-specific definitions. Do not silently remove requested rule support; additional families require product agreement.

### 9. Short single-class procedure and safe bulk editing — Major

Lens: comprehension. Target: 23–25, 31, 37–39. Stages 1–3.

The shared procedure must remain practical for a class test. Define save-versus-publish required fields, progressively reveal advanced fields, group multi-class rows, and show class completeness. Preview selected row count/targets before copying common values. This retains independent schedules in one event without a separate class-test product.

### 10. Preserve work after stale-save rejection — Major

Lens: comprehension. Target: 55, 111. First stage with concurrent edits.

Reload-and-reconcile can discard a large entered grid. Preserve unsaved values, explain changed revision, and allow comparison/copy before reload; retry against current permissions and data. Automatic merging is not required.

### 11. Publication audience and current-version promise — Major

Lens: comprehension. Target: 28–29, 40, 54, 98, 121. Stage 4 product decisions.

Select staff-only versus student visibility before implementing publish. Show audience/revision/change summary and mark superseded/cancelled outputs. Decide when draft reschedules become current and who can see them. Notifications and hall-ticket regeneration are separate scope decisions, not implied deliverables.

### 12. Assign cross-cutting additions to stages — Nit

Lenses: zoom-out, structural. Target: 47–56, 106–109, 122.

Place batches, accommodations, gap policies, concurrency and archiving in the first stage whose correctness depends on them. Distinguish early structural allowance from full UI delivery. Canonical synthesis now supplies these placements without selecting the first release boundary.

### 13. Calendar reuse without duplicate authority — Nit

Lens: zoom-out. Target: 10, 17, 39–40, 98.

Reuse holiday data; derive any later exam calendar display from the authoritative exam revision. Do not ask staff to maintain duplicate exam records. The existing calendar is a date-event table, not a verified timed scheduling grid.

## Product decisions and technical gates

Unresolved product choices: first-release stages and required draft fields; first-school assessment rules; elective/batch ownership and representation; action/scope presets and recipients; publication audience; incomplete-coverage/provisional policy; warning overrides; correction/reschedule visibility and notification scope; later seating/buffer/accommodation policy.

Technical release gates: legacy writer and rollback compatibility; existing grant migration; route reachability and scope enforcement. Publication adds coherent versioning, membership freshness and atomic conflict acceptance. Stage 5 adds reservation authority and verified availability coverage. These are work to settle during detailed design, not demonstrated current implementation blockers.

Recommended defaults, not newly confirmed user decisions: reuse existing academic/RBAC/audit primitives; manual scheduling first; one concise creation procedure; bounded synchronous work until measurements justify async processing; derive calendar views from exam authority. The canonical brief proposes these safeguards. It leaves exact tables/APIs/transactions and all product choices above open.

Confirmed decisions retained: multi-class events with independent schedules/assessment limits; single-class tests using the same procedure; RBAC instead of role names/ownership; explicit cross-class grants; permitted teachers publish their own tests without separate approval. Hall tickets/results/marks, automatic scheduling, resources/seating and vault remain at their stated boundaries.

## Evidence and completed reviewers

The synthesizer read the full original brief, all six actual personas, synthesizer instructions, Codex integration guidance, Ponytail, graft skill and zoom-out standard. Each reviewer read the full 126-line brief and its persona and reported specific section/line evidence; all reports were read before synthesis. No memory/history was retrieved.

| Lens | Actual persona under EGM `agents/` | Report | Raw counts Blocker/Major/Nit |
| --- | --- | --- | --- |
| Architecture | `design_critic.md` | `/tmp/exam_goldfish_design.md` | 0 / 3 / 0 |
| Observability | `codebase_details.md` | `/tmp/exam_goldfish_codebase.md` | 0 / 3 / 1 |
| Simplicity/reuse | `zoom_out.md` | `/tmp/exam_goldfish_zoom_out.md` | 0 / 1 / 3 |
| UX | `comprehension.md` | `/tmp/exam_goldfish_comprehension.md` | 0 / 5 / 0 |
| Migration/compatibility | `implementation_readiness.md` | `/tmp/exam_goldfish_readiness.md` | 0 / 2 / 0 |
| Maintainability | `structural.md` | `/tmp/exam_goldfish_structural.md` | 0 / 2 / 1 |

Persona root: `/home/abhi/.codex/plugins/cache/egm/egm/0.1.0/agents/`. BRAINSTORM requires no additional document standard; zoom-out additionally read the bundled `resources/document_standards/zoom-out-standard.md`, graft and Ponytail. Every reviewer used `fork_turns: none`; at most two ran concurrently. Only reviewer report artifacts were authorized exceptions to persona read-only instructions.

Simplicity reviewer inspected graft results plus exact source spans. Reuse evidence:

- `services/api/modules/academics/models.py:190–240`: ClassSubject elective flag/default marks; `359–413`: enrollment lacks per-subject elective membership; `416–469`: generic AcademicOperation; `162–187`: Room general capacity.
- `services/api/modules/school_calendar/models.py:8–33` and `apps/institute-admin-web/src/features/calendar/CalendarPage.tsx:20–157`: scoped date-based events/holiday integration and table UI.
- `services/api/platform_core/api/audit.py:87–116`: audit_mutation metadata; `services/api/modules/access_control/policies.py:5–9`: effective permission key check; `apps/institute-admin-web/src/features/access-control/RoleBuilderPage.tsx:33–187`: configurable grants, not proven exam class-scope enforcement.
- `services/api/modules/admin_console/timetable_views.py:173–303`: published teaching timetable and admin guard; an integration candidate, not a booking service.

The reuse reviewer completed six graft calls and reports approximately 800,152 tool-estimated tokens saved; this is a whole-file baseline estimate, not measured actual savings. Ranked retrieval and selected spans do not establish exhaustive caller coverage or runtime behavior.

Skipped checks/risk: no code changes, tests, UI/runtime verification, performance benchmark or migration rehearsal. Implementation remains unapproved. The findings must become concrete acceptance criteria in each affected stage's reviewed design.
