# Stage 9 — Implementation Readiness

Target `docs/designs/exam-creation-scheduling.md:265–354`, governing feature context consulted. All three fresh-context reviewers completed before synthesis. **0 Blocker / 4 Major / 3 Nit. Verdict: needs work before implementation.**

| ID | Severity | Target lines | Discrepancy and recommendation |
| --- | --- | --- | --- |
| S9-IR-01 | Major | 271–275,292,301–304,316–317 | Define shared wire schemas: optional/null fields, options, actions, receipt variants, stable stale/key-conflict errors. Existing admin request layer does not define new payloads. |
| S9-IR-02 | Major | 283–284; governing 130–140,192,206 | Specify on_delete/nullability for all four records' foreign keys, including actor, coordinator and provenance; protect preservation guarantees and define blocked deletion feedback. |
| S9-IR-03 | Major | 271,291,302,310,347 | Choose original-result versus current-state replay after intervening edits; specify stored receipt data and current-access response. |
| S9-CB-01 | Major | 285,298–299,315,318 | Role Builder derives selectable permissions only from visible roles' grants. Seeded ungranted view/edit permissions need independent delegable-catalog discovery, transport and a no-existing-grants acceptance case. |
| S9-CB-02 | Nit | 308,345 | AppShell's historical banner/current-year return also hard-code 2026-27. Include real current-year identity and historical edit policy in its task. |
| S9-SY-01 | Nit | 269 | Replace subjective “normal usable role preset” with its concrete purpose. |
| S9-SY-02 | Nit | 275 | State whether search limit counts characters or bytes. |

Source evidence: `admin.api.ts:215–256` for reusable request behavior; `RoleBuilderPage.tsx:54–75,156–162` and `access-control.utils.ts:33–36` for catalog discovery; `AppShell.tsx:128,164–170,268–273` for current-year literals. Complete file paths and read ledgers are in `docs/designs/exam-review-evidence/stage9-readiness.md`, `stage9-codebase.md`, `stage9-style.md`.

All personas and applicable implementation-readiness standards fully read; active target and linked inputs fully read. Readiness/codebase reviewed complete governing feature context; style's optional earlier context was partly truncated and is explicitly incomplete. Existing source inspection selective; migration leaves, exhaustive auth callers, seed writers, complete deletion graph and runtime unverified. Create paths planned. No tests, runtime changes, cleanup or memory/history. Graft **39,438 estimated tokens / 5 calls**.
