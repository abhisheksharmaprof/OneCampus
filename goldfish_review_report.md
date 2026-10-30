# Goldfish Annotated Review Report

**Status:** resolved — 11 proposed fixes accepted; 0 contested; 0 unaddressed.

**Target:** `docs/designs/exam-creation-scheduling.md` (`full file`, currently 359 lines)

The proposals below correspond to C01–C11 in `consolidated_review_report.md`. The current target already contains candidate text for these proposals from the preceding resolution pass; this report is the EGM Resolve decision gate before treating those edits as accepted.

## Prioritized Findings & AI Suggestions

### Issue 1 [Zoom-out reviewers] - Severity: High
* **Affected Scope:** Lines 124–140, 289–329 ([target](docs/designs/exam-creation-scheduling.md#L124-L140)) (Data model and ordered file checklist)
* **Discrepancy Description:** The checklist adds four tables and permission entries but omits the required `school_platform_schema.sql` artifact.
* **Rationale:** README snapshot instructions require the schema snapshot to track table, constraint, index, and permission-seed changes; migrations remain runtime authority.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Add the schema snapshot to the implementation checklist and compare it with finalized migrations and models.
* ***Proposed Edit:*** Add a checklist item for `school_platform_schema.sql`, including relationships, constraints, indexes, and permission seed definitions.

### Issue 2 [Comprehension and implementation-readiness reviewers] - Severity: High
* **Affected Scope:** Lines 173–189, 267–277, 290–325 ([target](docs/designs/exam-creation-scheduling.md#L173-L189)) (API contract and implementation checklist)
* **Discrepancy Description:** Endpoint names did not define complete request/response shapes, optional versus nullable behavior, target/actions/scopes, options variants, create-only receipts, or stable error codes.
* **Rationale:** Existing request and pagination helpers do not establish these exam-specific contracts; stale revisions and idempotency conflicts need distinct recovery paths.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Add representative JSON contracts and reference them from serializers, client types, and planned contract tests.
* ***Proposed Edit:*** Specify UUID placement, request fields, omission/null semantics, detail/list/options responses, actions, receipt shape, and stable machine-readable errors.

### Issue 3 [Comprehension and implementation-readiness reviewers] - Severity: High
* **Affected Scope:** Lines 194–196, 270–310, 350–357 ([target](docs/designs/exam-creation-scheduling.md#L194-L196)) (Retry behavior)
* **Discrepancy Description:** “Same saved result” was ambiguous if the exam changed after the original request; replay authorization and reduced response behavior were unspecified.
* **Rationale:** A receipt stores an exam reference and must not accidentally expose current detail after a lost-response retry.
* ***AI Suggestion:*** PROPOSE FIX
* ***Justification:*** Specify a minimal original receipt, current authorization checks, and behavior for changed payloads or unavailable targets.
* ***Proposed Edit:*** Replay only the original request/exam/revision receipt after current create scope checks; return 409 for a changed payload and a stable unavailable-receipt error if the exam is gone. Add an intervening-edit replay scenario to acceptance.

### Issue 4 [Comprehension reviewer] - Severity: High
* **Affected Scope:** Lines 148–160, 275–298, 311–325 ([target](docs/designs/exam-creation-scheduling.md#L148-L160)) (Permission scopes)
* **Discrepancy Description:** Independent section and subject arrays did not define pair associations or overlapping-grant unions.
* **Rationale:** Separate arrays can imply an unsafe Cartesian product; persisted grants need precise semantics even before subject scheduling ships.
* ***AI Suggestion:*** PROPOSE FIX
* **Justification:*** Use explicit section-subject tuple entries and define union behavior at each grant’s declared granularity.
* **Proposed Edit:*** Define `classSubjectPairs: [{classSectionId, subjectId}]`, preserve tuples, and state same-action union semantics without cross-action combination.

### Issue 5 [Design reviewer] - Severity: High
* **Affected Scope:** Lines 124–142, 194–200 ([target](docs/designs/exam-creation-scheduling.md#L124-L142)) (Section scope invariants)
* **Discrepancy Description:** Existing section updates can change campus/grade/year after an exam is saved, invalidating its scope without an exam revision.
* **Rationale:** Save-time checks and delete protection do not prevent later scope-changing edits or races with target writes.
* ***AI Suggestion:*** PROPOSE FIX
* **Justification:*** Add an explicit guard and serialization rule for section identity changes while referenced by active exams.
* **Proposed Edit:*** Block campus/grade/year edits while a non-cancelled exam targets the section, return affected exam IDs, and serialize those edits against target writes.

### Issue 6 [Implementation-readiness reviewer] - Severity: High
* **Affected Scope:** Lines 124–142, 200–209, 293–305 ([target](docs/designs/exam-creation-scheduling.md#L124-L142)) (Foreign-key retention)
* **Discrepancy Description:** “Protect identities where appropriate” did not define deletion behavior for actor/history, coordinator, source exam, academic references, and receipts.
* **Rationale:** Unspecified cascades could delete history or receipts and conflict with the new-record preservation policy.
* ***AI Suggestion:*** PROPOSE FIX
* **Justification:*** State field-specific PROTECT/SET_NULL and retained-snapshot rules; prohibit silent deletion of unrelated records.
* **Proposed Edit:*** Protect institute/campus/year/section/term; null optional coordinator/source links; retain actor and receipt snapshots if nullable links are cleared; only remove targets/history through a future explicitly authorized exam deletion.

### Issue 7 [Codebase and implementation-readiness reviewers] - Severity: High
* **Affected Scope:** Lines 160–163, 290–306, 315–325 ([target](docs/designs/exam-creation-scheduling.md#L160-L163)) (Permission catalog discovery)
* **Discrepancy Description:** Role Builder derives selectable permissions from current role grants, so ungranted `assessment.view` and `assessment.edit` may remain undiscoverable.
* **Rationale:** Seeding definitions without granting defaults does not make them selectable.
* ***AI Suggestion:*** PROPOSE FIX
* **Justification:*** Specify full permission-catalog discovery filtered by what the administrator may delegate, without broad auto-grants.
* **Proposed Edit:*** Add a catalog endpoint/response and corresponding frontend/API checklist item; verify create/view/edit can be configured when view/edit are unassigned.

### Issue 8 [Style reviewer] - Severity: Low
* **Affected Scope:** Lines 5–12, 86–119, 130–143 ([target](docs/designs/exam-creation-scheduling.md#L5-L12)) (Approval wording)
* **Discrepancy Description:** Some language still describes approved decisions as proposals awaiting approval.
* **Rationale:** Superseded status wording makes the design's decision state unclear; pending later-stage choices should remain open.
* ***AI Suggestion:*** PROPOSE FIX
* **Justification:*** Use accepted requirements or references to the governing section while retaining truly pending later-stage decisions.
* **Proposed Edit:*** Remove stale proposal/approval phrasing from the approved first-slice boundary.

### Issue 9 [Codebase reviewer] - Severity: Low
* **Affected Scope:** Lines 310–311, 350–357 ([target](docs/designs/exam-creation-scheduling.md#L310-L311)) (AppShell academic year)
* **Discrepancy Description:** AppShell hard-codes 2026–27 in its year banner/current-year return behavior; the plan only mentioned year choices.
* **Rationale:** Historical draft editing needs a real current-year source and should not be blocked or mislabeled.
* ***AI Suggestion:*** PROPOSE FIX
* **Justification:*** Define current-year identity, historical selection, and historical edit behavior in the plan and acceptance checks.
* **Proposed Edit:*** Update the AppShell checklist entry to use actual year choices, default to current year, permit historical draft editing, and avoid a misleading banner.

### Issue 10 [Style reviewer] - Severity: Low
* **Affected Scope:** Lines 269–273 ([target](docs/designs/exam-creation-scheduling.md#L269-L273)) (Role preset)
* **Discrepancy Description:** “Normal usable role preset” is vague about which actions it grants and why.
* **Rationale:** A preset must not silently grant broader authority.
* ***AI Suggestion:*** PROPOSE FIX
* **Justification:*** State the convenience and its explicit effects.
* **Proposed Edit:*** Define a create+view+edit convenience preset that applies the selected scope separately to each action and is selected deliberately.

### Issue 11 [Style reviewer] - Severity: Low
* **Affected Scope:** Lines 275–277 ([target](docs/designs/exam-creation-scheduling.md#L275-L277)) (Search bound)
* **Discrepancy Description:** The search length bound of 100 did not say whether it measures characters or bytes.
* **Rationale:** Unicode search values make the limit ambiguous.
* ***AI Suggestion:*** PROPOSE FIX
* **Justification:*** Define a deterministic character-count basis.
* **Proposed Edit:*** State that search is capped at 100 Unicode code points.
