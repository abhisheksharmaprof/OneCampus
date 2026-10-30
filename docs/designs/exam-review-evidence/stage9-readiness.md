# Stage 9 implementation readiness raw review

Complete. **0 Blocker / 3 Major / 0 Nit.** Bounded draft slice feasible; contract decisions remain.

## S9-IR-01 — Major — Specify wire contracts

Target 271–275,292,301–304,316–317; governing 177–186,194. Serializers/types must match without complete shapes: create-only receipt, options kinds, effective scope, optional field names/nulls, and machine-readable stale versus key-conflict errors both using 409. `admin.api.ts:215–256` reuses refresh/error infrastructure but supplies no new exam schema. Add shared JSON/type/error contract examples referenced by server/client/tests.

## S9-IR-02 — Major — Decide foreign-key retention

Target 283–284; governing 130–140,192,206. “Protect identities where appropriate” leaves on_delete/nullability for coordinator, actor/history, source exam, academic year, section and campus open. Cascades could remove structured exams/history/receipts contrary to preservation. Specify retention/deletion policy for every new foreign key and feedback for blocked master deletion; add focused acceptance assertions. Plan ambiguity, not observed data loss.

## S9-IR-03 — Major — Resolve replay after edits

Target 271,291,302,310,347; governing 192. Receipt references an exam but promises same saved result; later edits produce a different revision. Choose original response/revision with minimal retained receipt data or current authorized detail explicitly. Cover lost response → intervening edit → replay with current access and create-only receipts.

Read ledger: full implementation_readiness persona, implementation-readiness standard, graft skill; full target 1–354 (active 265–354); full concepts_brief 1–169 and exam_scheduling_goldfish_review 1–125. Approved reset overrides older conversion requirement. Source: identity/services.py 50–109; admin.api.ts 133–162,215–256; academics.api.ts 87–89; academics/api/views.py 743–786. Unhelpful update_spec hit supplies no evidence. Selective context; migration leaves, deletion relations, grants/runtime/full auth callers uninspected. No inaccessible required documents. Planned Create paths not defects. No memory/history, writes, tests, runtime/UI or cleanup. Graft **13,802 estimated tokens / 2 calls**.
