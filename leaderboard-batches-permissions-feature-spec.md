# Feature Spec — Custom Roles, Multi-Branch Governance, Common Tests & the Unified Leaderboard/Batch System

This is a deep-dive on one slice of the platform: everything needed for **healthy, gamified, cross-branch and cross-institute competition** between students, built on a **custom permission system** that lets every institute and branch run itself independently. It extends `school-management-crm-features.md` and is written to be consistent with `school_platform_schema.sql` (referenced inline as `existing:` where a table already exists, and `new:` where this spec proposes an addition).

---

## 1. Custom Role & Permission Management System

### 1.1 The model

Three layers, already reflected in the schema (`permissions`, `roles`, `role_permissions`, `user_role_assignments`):

1. **Permissions** — an atomic, platform-owned catalog of actions (`attendance.mark`, `marks.publish`, `role.create`, `leaderboard.configure`, `points.award_manual`, …). Institutes never invent new permission keys; they only combine existing ones. This keeps every institute's custom role auditable and comparable, and lets the platform ship new modules without breaking existing roles.
2. **Roles** — a named bundle of permissions. Three flavors, distinguished by scope:
   - **System roles** (`institute_id IS NULL`) — Institute Admin, Branch Admin, Teacher, Parent. Cannot be edited or deleted, only cloned as a starting point.
   - **Institute-wide custom roles** (`institute_id` set, `branch_id NULL`) — e.g. "Academic Coordinator," valid across every branch of that institute.
   - **Branch-scoped custom roles** (`institute_id` + `branch_id` set) — e.g. "Sports Coordinator — Jaipur Branch," usable only at that one branch.
3. **Assignments** — a user can hold multiple roles simultaneously, each scoped to a specific institute/branch. A teacher who also coordinates sports across two branches gets two `user_role_assignments` rows: `Teacher @ Branch A` and `Sports Coordinator @ Branch A + Branch B`.

### 1.2 Role builder (institute admin UI)

- **Start from a template** — clone "Teacher," "Branch Admin," or any existing custom role, then add/remove permissions.
- **Grouped permission matrix** — permissions rendered by module (Students, Attendance, Academics, Communication, Leaderboard & Points, Roles, Reports) with a checkbox grid, not a flat list of 60 items.
- **Scope selector per role** — "This role applies to: ☐ One branch ☐ All branches of this institute." Institute admins can only create branch-scoped roles for branches they themselves manage.
- **Least-privilege enforcement** — a user can never grant a permission they don't hold themselves. A Branch Admin building a custom role cannot tick `institute.view_all_branches` even though the checkbox is visible (shown disabled with a tooltip explaining why).
- **Live preview** — "Users with this role will be able to: mark attendance for their assigned classes, view marks for their assigned classes, award points manually up to Bronze tier." Plain-English summary generated from the ticked permissions, so non-technical admins aren't just reading permission keys.
- **Point/batch-specific sub-permissions** — because manual point awards are the easiest thing to abuse, this module gets finer-grained controls than a single on/off:
  - `points.award_manual` — can award points at all
  - `points.award_manual.max_per_award` — a numeric cap the role can hand out in one transaction (e.g. a Teacher role is capped at 20; a Branch Admin at 75)
  - `points.award_manual.categories` — restrict which point categories a role can award into (a Sports Coordinator role only gets the Sports category)
  - `leaderboard.configure` — separate from `leaderboard.view`; controls who can change scope/visibility settings, not just look at rankings

### 1.3 Governance & safety rails

- **Two-person rule (optional, institute-level toggle)** — any manual point award above a configurable threshold (e.g. 50 pts) requires a second approver before it posts to the ledger.
- **Full audit trail** — every role creation, permission change, and role assignment writes to `audit_logs` (`existing`) with old/new values, so "who gave themselves institute-wide access" is always answerable.
- **Role expiry** — `user_role_assignments.valid_until` *(new column)* lets a temporary role (e.g. "Exam Duty Coordinator" for exam season) auto-expire instead of lingering as a permission a former exam coordinator still holds a year later.
- **Deactivation cascade** — deactivating a role instantly revokes it from every assigned user (checked at request time, not just at login, so a revoked permission takes effect immediately).

---

## 2. Multi-Branch Governance

- Institute → Branches → everything operational. A single-campus school is simply an institute with one branch — no special-casing needed anywhere else in the product.
- **Branch Admin** manages their branch only: staff, classes, fee structure, local circulars, and local reports. They cannot see another branch's students, staff, or finances, enforced at both the application layer and PostgreSQL Row-Level Security (`existing`, Section 13).
- **Institute Admin** sees and manages every branch: cross-branch staff transfers, cross-branch reporting, institute-wide policy (grading scale, leaderboard participation, branding) that every branch inherits unless a branch is explicitly given an override.
- **Per-branch overrides** — a small, explicit list of settings a branch *can* override from the institute default (e.g. local grading remarks, local holiday calendar) versus what's locked institute-wide (e.g. the point-category catalog, batch definitions) so a "Best Performer Batch" means the same thing at every branch and can be compared fairly.
- **Staff can be branch-exclusive or cross-branch** — most teachers belong to one branch; a Sports Coordinator, exam-paper setter, or subject-matter reviewer can be explicitly assigned across branches for coordination work like common tests.

---

## 3. Common (Inter-Branch / Inter-Institute) Tests

The mechanism that makes a *fair, comparable* leaderboard possible — students across branches only rank meaningfully against each other if at least some assessments are genuinely common.

### 3.1 Creating a common test

An Institute Admin (or a role with `assessment.create` + `assessment.create_common`) builds one test and targets it using filters instead of manually replicating it per branch:

- **Subject** and **class/grade** (e.g. Grade 8 Mathematics)
- **Branches** — all branches, or a specific subset
- **Sections within each branch** — all sections, or specific ones
- **Scheduling** — same date/time for every branch (strict simultaneity, for exam integrity) or a date *window* each branch schedules within (more practical across time zones/holiday calendars)
- **Question paper** — one shared paper (locked, non-editable per branch) or a shared question *bank* with per-branch randomized paper generation
- **Weightage in report card** vs. **weightage in leaderboard points** — a school may want a common test to count toward the leaderboard-only, without affecting the official term report card, or both.

`new:` `common_tests` (parent record with the filters above) → `common_test_branches` (which branches/sections opted in) → existing `assessments` rows generated per branch, each linked back via `common_test_id`, so all existing marks-entry, validation, and report-card machinery is reused rather than duplicated.

### 3.2 Fairness controls

- **Proctoring parity flag** — mark whether a branch ran the test online/offline/proctored, so results can be footnoted if conditions weren't identical.
- **Normalization option** — if class sizes or difficulty perception differ wildly between branches, an optional statistical normalization (z-score or percentile-based) can run before points are awarded, configurable per test.
- **Result publication gate** — results release simultaneously across all participating branches once every branch has submitted marks, so no branch sees others' results early and adjusts remarks retroactively.

### 3.3 Feeding the leaderboard

Every common-test result auto-generates a `point_transactions` row (`existing`, `source_type = 'academic_assessment'`) with `points` computed from the test's configured points formula (e.g. percentage scored × weight, or a flat rank-based bonus for top finishers institute-wide). This is what makes "how did my child rank across all four branches on the Grade 8 Math common test" a first-class, queryable view.

---

## 4. Points, Activities & the Batch (Badge) System

### 4.1 The point ledger

`existing: point_transactions` is an append-only ledger, never a mutable running total — every academic result, attendance streak, activity, or manually awarded batch writes one row. This is what makes leaderboards for *any* time slice (this week, this term, all-time) and *any* scope (class, branch, institute, network) computable and auditable without trusting a cached counter.

### 4.2 Point categories (fully configurable, not just academics)

Platform-default categories, extensible per institute:

| Category | Examples of what earns points |
|---|---|
| Academics | Test/exam scores, assignment quality, subject Olympiad results |
| Sports | Matches won, tournament participation, district/state representation |
| Arts & Culture | Music, dance, drama, art competitions, performances |
| Discipline & Conduct | Positive behavior recognition, clean-conduct streaks |
| Attendance & Punctuality | Perfect attendance, punctuality streaks |
| Leadership | Class monitor/prefect duty, student council, event leadership |
| Community Service | Volunteering, donation drives, peer tutoring |
| Innovation & Projects *(new)* | Science fair, hackathons, coding club, robotics |
| Digital Citizenship *(new)* | Responsible platform use, homework submitted on time streaks |

Institutes can add their own categories and activity types on top of the platform defaults (e.g. a school with a strong debate program adds "Debate & Public Speaking").

### 4.3 The batch (badge) catalog — "all possible batches"

Batches are the visible, collectible recognition layer on top of raw points. Every batch has: a **category** (or none, for cross-category batches), a **criteria type**, a **validity period**, and **bonus points** it grants on award (so earning a batch itself feeds back into the leaderboard). Recommended full catalog, organized by type:

**Academic performance batches**
| Batch | Criteria | Validity |
|---|---|---|
| Topper Batch | Rank 1 in class, academics | Termly |
| Merit Batch | Top 10 in class, academics | Termly |
| Subject Excellence (per subject) | Rank 1 in that subject, branch-wide | Termly |
| Most Improved — Academics | Largest positive rank change vs. previous term | Termly |
| Perfect Score | 100% on any assessment | Per-award |
| Consistency Batch | Top 20% for 3 consecutive terms | Annual |

**Cross-category / overall batches**
| Batch | Criteria | Validity |
|---|---|---|
| Best Performer Batch | Rank 1 overall points, branch | Termly |
| All-Rounder Batch | Meaningful points in 4+ categories | Termly |
| Rising Star | Most improved overall (any category) | Termly |
| Student of the Month | Rank 1 overall, institute-wide (all branches) | Monthly |
| Student of the Year | Rank 1 overall, institute-wide | Annual |
| Network Champion *(new)* | Rank 1 overall across all participating institutes in a shared leaderboard | Annual |

**Sports batches**
| Batch | Criteria | Validity |
|---|---|---|
| Sports Champion | Outstanding sports achievement | Termly |
| Athletic Excellence | Crosses sports points threshold | Termly |
| District/State Representative | Represented school beyond campus | Per-award, permanent record |
| Team Player Batch *(new)* | Manual award for team-sport contribution beyond stats | Termly |

**Arts, culture, leadership, discipline, attendance, community** — each gets a Bronze/Silver/Gold *tier ladder* rather than one flat badge, so recognition scales with sustained effort rather than being all-or-nothing:

| Tier | Points threshold example (category-specific) |
|---|---|
| Bronze | 25 pts in the category this term |
| Silver | 60 pts in the category this term |
| Gold | 100 pts in the category this term |

This tiering (`new: batch_definitions.tier` — nullable, `bronze|silver|gold`, only used by threshold-based batches) is what turns "Perfect Attendance" or "Community Champion" from a single hard-to-reach badge into a progression students can see themselves climbing.

**Special/rare batches**
| Batch | Criteria |
|---|---|
| Founder's Batch *(new)* | Manual, for a student who represents the school's values exceptionally — capped per term so it stays meaningful |
| Comeback Batch *(new)* | Manual, for significant improvement after a documented rough patch (used carefully — see §4.4 on sensitivity) |
| Perfect Term *(new)* | Zero absences, zero conduct flags, and top-half academics in the same term |

### 4.4 Award mechanics & safeguards

- **Auto-awarded batches** (points/rank threshold) are computed by a nightly job that scans `point_transactions`, checks each active `batch_definitions` row's criteria, and inserts `student_batches` rows — no manual step, no risk of a teacher forgetting to award something a student earned.
- **Manually-awarded batches** go through the role-based cap and optional two-person approval described in §1.3.
- **Anti-gaming caps** — each `activity_types` row can define a max frequency (e.g. "Positive behavior recognition" capped at once per week per student) so a well-meaning teacher can't inflate one student's ranking through repetition.
- **Sensitive batches are opt-in, admin-only, and never public-facing** — anything that could reveal a student went through a difficult period (e.g. "Comeback Batch") is visible only to the student, their parent, and staff with an explicit permission — never shown on a public or classmate-visible leaderboard.
- **No batch ever penalizes** — the system only ever *adds* recognition; there is deliberately no "worst performer" or negative public batch. Discipline concerns are tracked (category exists for reporting) but never surfaced as a public-shaming leaderboard.

---

## 5. The Leaderboard System

### 5.1 Scopes

Built on `existing: fn_leaderboard()` and `leaderboard_snapshots`, extended with the scopes below:

| Scope | What it ranks |
|---|---|
| Class/Section | Students in one section |
| Class (whole grade, one branch) | All sections of a grade at one branch |
| Subject | Ranked purely on one subject's points, one branch or institute-wide |
| Branch (all classes) | Every student at one branch |
| Institute (all branches) | Every student across every branch of one institute — this is the "common leaderboard across branches" |
| Network (multiple institutes) | Every student across every institute that has opted into a shared network (§6) |
| Batch/Badge leaderboard | Ranked by count or tier of a specific batch (e.g. "who has the most Sports batches this year") rather than raw points |
| Most-Improved leaderboard | Ranked by rank *change*, not absolute rank — gives lower-ranked students a leaderboard they can meaningfully climb too |

### 5.2 Filters (composable, applied together)

Institute, Branch, Class/Grade, Section, Subject, Point Category, Time period (weekly / monthly / termly / annual / all-time), and Batch type. Any combination is valid: "Sports leaderboard, Grade 9, all branches, this term" is one query against `fn_leaderboard()` with the relevant parameters set.

### 5.3 Who sees what

| Viewer | Default visibility |
|---|---|
| Student | Their own rank in every scope they belong to; full leaderboard names visible or anonymized per institute setting |
| Parent | Same as their child, **only if the institute has enabled parent visibility** (§5.4) |
| Teacher | Full leaderboard for their assigned classes; branch leaderboard if granted `leaderboard.view` at branch scope |
| Branch Admin | Full branch leaderboard, and institute-wide leaderboard read-only (to see how their branch compares) |
| Institute Admin | Full institute-wide leaderboard, and network leaderboard for any institute they've opted into |

### 5.4 Institute-level privacy configuration

`new: leaderboard_privacy_settings (institute_id, allow_parent_view BOOLEAN, parent_view_scope ENUM('own_child_rank_only','full_leaderboard'), anonymize_below_grade INTEGER, student_can_opt_out BOOLEAN, show_names_on_network_leaderboard BOOLEAN)`

- **Parent visibility toggle** — off by default until the institute explicitly enables it (DPDP-aligned — see §7).
- **Two parent visibility modes** — "my child's rank and the top 10 only" vs. "the full class/branch leaderboard."
- **Anonymization by grade** — younger grades (e.g. below Grade 4) can show rank positions without names ("You're #3 in your class") to reduce social pressure while keeping the motivational element.
- **Individual student opt-out** — where the institute allows it, a student/parent can request their name be hidden from *public/classmate-visible* leaderboards while their points, batches, and rank still exist for the school's own records and report cards. This protects students who find public ranking stressful without removing the underlying recognition system.

### 5.5 Performance

`leaderboard_snapshots` (`existing`) caches computed ranks on a schedule (e.g. nightly, or hourly during exam season) so a school with tens of thousands of students across many branches doesn't recompute a live aggregate on every page load. `fn_leaderboard()` remains available for on-demand/real-time views (e.g. right after a common test's results are published).

---

## 6. Cross-Institute Participation (institutes that are *not* branches of each other)

This is the "healthy competition beyond your own walls" layer — two or more genuinely separate institutes (different owners, different `institutes.id` records, not branches of one legal entity) choosing to compare their students.

### 6.1 The agreement model

`new: institute_leaderboard_partnerships`
```
id                    UUID
requesting_institute_id   UUID  -- who proposed it
partner_institute_id      UUID
status                ENUM('pending','active','declined','withdrawn')
scope                 ENUM('all_students','specific_grades','specific_subjects')
grade_filter          UUID[]   -- nullable, applies if scope is grade-limited
subject_filter        UUID[]   -- nullable
requested_at          TIMESTAMPTZ
responded_at          TIMESTAMPTZ
withdrawn_by          UUID     -- which institute withdrew, if applicable
withdrawn_at          TIMESTAMPTZ
```

- **Bilateral opt-in, not automatic** — Institute A sends a partnership request (optionally scoped to just Grade 10, or just Math+Science) to Institute B. It only becomes `active` once B accepts. Neither side is ever added to a shared leaderboard without explicit acceptance.
- **N-way networks** — a set of accepted bilateral partnerships that all include each other forms a *network*; the network leaderboard scope (§5.1) is simply "every institute with an active, mutual partnership to every other member." A school district or a franchise of independently-owned schools using the same brand can form a network this way without being technically branches of one tenant.
- **Withdrawal, anytime, by either party** — flipping status to `withdrawn` immediately removes that institute's students from the shared/network leaderboard view going forward. Historical `leaderboard_snapshots` rows are **not deleted** (they're historical fact, already shown to users at the time) but no *new* snapshots include the withdrawn institute, and it disappears from live queries immediately. This mirrors how a school can leave a sports league: past results stand, future participation stops.
- **No silent re-inclusion** — if withdrawn and later re-invited, it goes back through the same explicit acceptance flow; a lapsed partnership never silently reactivates.

### 6.2 What's actually shared

Only what's needed for ranking: `student first name + last initial or a display alias` (configurable, per `show_names_on_network_leaderboard`), rank, total points, category, and school name. Full student profile, contact info, attendance detail, and marks history are **never** exposed to a partner institute — the partnership is a leaderboard integration, not a data-sharing pipe into each other's student records.

### 6.3 Common tests across institutes

The same `common_tests` mechanism from §3 can target branches *and* partner institutes' branches simultaneously, once a partnership is active — e.g. two independently-owned schools in the same city jointly running an inter-school Math Olympiad through the platform, with one shared question paper and one combined results/leaderboard view, without either school gaining operational access to the other's roster.

---

## 7. Privacy & Compliance Notes Specific to This Feature

- Leaderboards and batches are **not** a data-collection or ad-tech feature — no cross-institute data leaves the ranking/points fields described in §6.2, consistent with the DPDP Act's ban on behavioral tracking of minors.
- Parent visibility is **opt-in by the institute**, never on by default, and DPDP's parental-consent requirement is satisfied through the same consent capture already built into institute onboarding (`existing: consent_records`).
- An institute's decision to enable/disable parent visibility, join/leave a network, or anonymize younger grades is itself logged in `audit_logs` for accountability.

---

## 8. Suggested Build Phasing

| Phase | Scope |
|---|---|
| 1 | Permission catalog + role builder (institute & branch-scoped custom roles), branch-level admin separation |
| 2 | Point ledger, activity types, platform-default batch catalog, branch and institute leaderboards with filters, parent visibility settings |
| 3 | Common tests (intra-institute, cross-branch), most-improved leaderboard, tiered batches, anti-gaming caps/approval workflow |
| 4 | Cross-institute partnerships and network leaderboards, cross-institute common tests |

If it would help, the natural next step is turning this into the actual additional schema (`common_tests`, `institute_leaderboard_partnerships`, `leaderboard_privacy_settings`, `role.valid_until`) as a migration on top of the existing `school_platform_schema.sql`.
