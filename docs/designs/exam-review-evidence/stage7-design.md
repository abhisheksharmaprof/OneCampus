# Stage 7 design critic raw review

Complete. **0 Blocker / 1 Major / 0 Nit.**

## S7-DE-01 — Major — Mutable sections can invalidate saved exam scope

Target 130–140, 190. Sources: `services/api/modules/academics/api/views.py:639–670`, `api/serializers.py:311–323`, `models.py:286–310`. Existing section PATCH permits branch, grade and academic-year changes within the institute. The planned exam validates matching campus/year and CLASS_TEST grade composition only during exam writes. A later section move can violate those invariants without advancing exam revision; protected deletion does not protect updates. Define whether referenced sections reject scope-changing updates or receive atomic reconciliation. Cover concurrent exam-save/section-move races. This is a proposed design integration gap, not a currently implemented exam failure.

Read ledger: full design_critic persona, full feature-spec standard, full graft skill, full target 1–354 (active 1–264), full concepts_brief 1–169 and exam_scheduling_goldfish_review 1–125. Graft source: academics.api.ts 87–89 and academics/api/views.py 676–740. Exact opened spans: academics/api/views.py 296–318,351–370,630–673; serializers.py 85–99,115–128,311–323; models.py 243–310. Other returned definition locations were not implementation reads. Uninspected authentication/access/audit/frontend implementations, downstream bodies and runtime data. No inaccessible requested document. Create paths planned. Accepted boundaries/reset/publication decisions preserved. No edits, tests, runtime, cleanup, history/memory. Graft **32,478 estimated tokens / 2 calls**.
