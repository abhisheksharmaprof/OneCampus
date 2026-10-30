# Stage 7 — Critic review

Target `docs/designs/exam-creation-scheduling.md:1–264`. All three fresh-context reviewers completed before synthesis. **0 Blocker / 1 Major / 1 Nit.**

## S7-DE-01 — Major — Protect exam scope against section edits

Target 130–140,190. Existing section PATCH permits campus/year/grade changes (`services/api/modules/academics/api/views.py:639–670`, `api/serializers.py:311–323`, `models.py:286–310`). Exam write-time validation plus deletion protection does not preserve saved target invariants after such changes or their concurrent races. Define a restriction on scope-changing section edits while referenced, or atomic reconciliation, and cover the concurrent boundary. A design integration gap, not evidence of a deployed exam defect.

## S7-SY-01 — Nit — State finalized decisions consistently

Target 12,29,35,86–93,109,126,134 still describe approved decisions as proposals/tasks awaiting approval despite status at 5 and binding implementation contract. Replace obsolete approval language with accepted requirements/references, preserving pending later-stage choices.

Structural review found no standard violation. Raw artifacts and detailed read ledgers: `docs/designs/exam-review-evidence/stage7-design.md`, `stage7-structural.md`, `stage7-style.md`. All personas/full applicable feature-spec standards and target ranges read; linked input documents read fully. Relevant code spans inspected only by design reviewer; other source context remains outside lens coverage. No tests, runtime changes, cleanup or memory retrieval. Graft **32,478 estimated tokens / 2 calls**.
