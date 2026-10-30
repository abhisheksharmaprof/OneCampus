# Consolidated exam design review

**Target:** `docs/designs/exam-creation-scheduling.md`, 354 lines. Feature range 1–264; detailed implementation 265–354. **Mode:** REVIEW, uninterrupted, stages 5 → 6 → 7 → 8 → 9 completed in sequence. Nine independent fresh-context reviewers; no context reused between stages.

**Verdict: needs work before implementation.** The approved draft-only approach is feasible. Resolve seven Major contract/integration gaps before building it. This review found no Blocker. Four Nits remain. These findings concern the proposed plan and its interaction with existing code; they are not evidence of deployed exam failures.

## Prioritized actions

### C01 — Major — Include the required SQL snapshot

Target 279–285,309–321,329–343. `README.md:98–118` requires updating `school_platform_schema.sql` for table/constraint/index/permission-seed changes; snapshot instructions at 5–15 reinforce that requirement. The checklist adds four tables and permission entries but omits this artifact. Add its update and schema comparison, including relationships, constraints, indexes and seeds. Explain existing assessment definitions (`school_platform_schema.sql:664–704`) without implementing later assessment stages. Preserve migrations as runtime authority.

### C02 — Major — Define shared API schemas

Target 173–186,269–275,292,301–304,316–317. The plan names endpoints without complete request/response shapes: UUID placement, optional versus nullable fields and clearing, targets/actions/scopes, options variants, create-only receipts and stable errors. Both stale revisions and reused keys use 409 but require different recovery. Add a compact contract appendix with representative JSON and stable machine-readable codes; reference it from serializers, client types and planned contract tests. Existing request/pagination helpers do not supply exam schemas (`services/api/platform_core/api/pagination.py:4–24`; `apps/institute-admin-web/src/features/admin/admin.api.ts:215–256`).

### C03 — Major — Choose replay semantics after intervening edits

Target 192,271,291,302,310,347. “Same saved result” is ambiguous when a receipt stores an exam reference and the exam later changes. Choose original revision/result with the minimum retained data, or current authorized state explicitly. Define current scope checks and reduced responses when view access is absent. Add the lost-response → intervening edit → replay scenario to planned acceptance. This clarifies the approved retry design; it does not require a new persistence architecture.

### C04 — Major — Specify section/subject grant associations

Target 149,153,273,286,298,311. Independent section and subject arrays do not explain required section/subject pairs or overlapping-grant unions. Define their relation to ClassSubject mappings or use explicit pair entries; give examples with overlapping grants. Existing assignment relations do not decide the new JSON semantics (`apps/institute-admin-web/src/features/academics/academics.api.ts:87–93`; `services/api/modules/academics/api/views.py:676–786`). Persisted configuration and Role Builder need this definition in Stage 1 even though subject setup is deferred.

### C05 — Major — Preserve scope when academic sections change

Target 130–140,190. Existing section PATCH permits branch/grade/year changes within an institute (`services/api/modules/academics/api/views.py:639–670`; `api/serializers.py:311–323`; `models.py:286–310`). Exam-save validation and protected deletion do not prevent a later section move from invalidating exam campus/year or CLASS_TEST grade composition without revision change. Define a guard on referenced section scope edits or atomic reconciliation; include concurrent section-change/exam-save behavior. This is a source-backed integration gap in the planned invariants.

### C06 — Major — Specify foreign-key retention

Target 283–284; governing 130–140,192,206. “Protect identities where appropriate” does not choose on_delete/nullability for actor/history, coordinator, provenance/source exam and academic identities. Unspecified cascades could contradict preservation of newly created records, history and receipts. Add a relationship/deletion-policy table and feedback for blocked master-data deletion, with focused planned acceptance. No data-loss behavior was executed or established.

### C07 — Major — Make ungranted permissions discoverable

Target 285,298–299,315,318. Role Builder obtains its selectable catalog from existing roles' grants (`apps/institute-admin-web/src/features/access-control/RoleBuilderPage.tsx:54–75,156–162`; `access-control.utils.ts:33–36`). Seeding assessment.view/edit without default grants does not expose them in that catalog. Specify independent complete delegable-catalog discovery and its backend/frontend changes. Cover an administrator configuring the preset when neither permission has an existing grant. Preserve the accepted decision against broad defaults.

### C08–C11 — Nits

| ID | Target | Action |
| --- | --- | --- |
| C08 | 12,29,35,86–93,109,126,134 | Replace superseded proposal/approval wording with accepted requirements or governing-section references; preserve pending later-stage choices. |
| C09 | 308,345 | Include AppShell historical banner/current-year return in the real-year work. It also hard-codes 2026-27 (`apps/institute-admin-web/src/components/layout/AppShell.tsx:128,164–170,268–273`). Define current-year identity and historical draft edit policy; verify another current year. |
| C10 | 269 | Replace “normal usable role preset” with its concrete draft-management purpose. |
| C11 | 275 | Specify whether the search limit of 100 counts characters or bytes. |

## Traceability and severity counts

| Raw finding | Consolidated action | Treatment |
| --- | --- | --- |
| S5-ZO-01 | C01 | Original |
| S6-CO-01 | C02 | Original |
| S6-CO-02 | C03 | Original |
| S6-CO-03 | C04 | Original |
| S7-DE-01 | C05 | Original |
| S7-SY-01 | C08 | Original |
| S8-ZO-01 | C01 | Continuation, deduplicated |
| S9-IR-01 | C02 | Independent repeat, deduplicated |
| S9-IR-02 | C06 | Original |
| S9-IR-03 | C03 | Independent repeat, deduplicated |
| S9-CB-01 | C07 | Original |
| S9-CB-02 | C09 | Original |
| S9-SY-01 | C10 | Original |
| S9-SY-02 | C11 | Original |

| Count basis | Blocker | Major | Nit | Total |
| --- | --- | --- | --- | --- |
| Raw observations, including continuations | 0 | 10 | 4 | 14 |
| Unique actions | 0 | 7 | 4 | 11 |

## Stage completion and read evidence

| Stage | Completion and evidence | Artifact | Raw counts B/M/N | Graft calls / estimated savings |
| --- | --- | --- | --- | --- |
| 5 Initial zoom | Full persona, zoom-out standard, target, linked inputs and README; focused source evidence ledger | `zoom_out_report.md` | 0/1/0 | 30 / 824,756 |
| 6 Comprehension | Full persona, re-implementation standard, both ranges and linked inputs; focused API/source spans | `comprehension_report.md` | 0/3/0 | 3 / 749,408 |
| 7 Critic | Design, structural and style complete; full personas; full feature-spec standard for first two; feature range and linked inputs read; design source spans inspected | `critic_report.md` | 0/1/1 | 2 / 32,478 |
| 8 Intermediate zoom | New reviewer; full persona/standard/target/README/inputs and all three earlier stage reports; focused reuse evidence | `intermediate_zoom_out_report.md` | 0/1/0 continuing | 1 / 5,061 |
| 9 Readiness | Readiness, codebase and style complete; full personas; full implementation standard for first two; active detailed range and linked inputs read. First two read governing feature context fully; style's optional earlier context partly truncated, no finding relies on unseen text | `implementation_readiness_report.md` | 0/4/3 | 5 / 39,438 |

Raw per-reviewer reports/read ledgers are preserved under `docs/designs/exam-review-evidence/` (nine files). Mandatory active-range/persona/standard reads completed before each reviewer returned; truncated mandatory reads were supplemented. Stage synthesis waited for actual reviewer completion. Stage 7 structural review returned no findings.

## Boundaries and limitations

No target/source modifications, tests, runtime/UI checks, migrations, grant writes, cleanup, memory or conversation-history retrieval were performed. Existing source inspection was selective, not an exhaustive authentication/caller/deletion/seed or migration-leaf audit. No required document remained inaccessible; unrelated source internals and transitive historical reports remain incomplete evidence. Planned Create entries were treated as future files, not missing implementation defects. Source assertions from earlier stages are attributed when later reviewers did not independently inspect them.

Accepted draft-only delivery, one campus per event, explicit action scopes, duplication/retry design, authorized bounded development reset and later publication/scheduling stages remain intact. No new queue, solver, login provider, permission framework or later-stage implementation is proposed. Review artifacts do not execute reset authorization or establish implementation acceptance.

Graft total: **1,651,141 estimated whole-file-baseline tokens saved across 41 calls**. These tool estimates are not measured token consumption and do not establish exhaustive coverage.
