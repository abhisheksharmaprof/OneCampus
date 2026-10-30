# Exam creation and scheduling — proposed plan

Date: 2026-10-23
Status: Working proposal for discussion. Implementation and Goldfish review have not started.

## Purpose and main risk

Allow exam staff to create an exam, select its classes and subjects, prepare an accurate timetable, resolve conflicts, and publish a version that later hall tickets and marks entry can use.

The main risk is building another set of unrelated exam records. A published schedule, its candidate roster, assessment components, and later marks must refer to the same exam and subject identities. A second risk is treating class overlap as sufficient: elective students can sit papers across different groups.

## Current checkout

- `services/api/modules/academics/models.py:416–469` stores exams as generic `AcademicOperation` records with a status and JSON payload. This is a persistence foundation, but it does not by itself define exam papers, candidate membership, or publication revisions.
- The same file already defines AcademicYear, AcademicTerm, Subject, ClassSection, ClassSubject, SubjectTeacherAssignment, StudentEnrollment, and Room. Reuse these identities.
- `apps/institute-admin-web/src/features/academics/AcademicOperationsPage.tsx:112–118` provides Schedule, Question Bank, Online Exams, Hall Tickets, and Analytics views. Hall Tickets currently renders exam configuration cards.
- Calendar and rooms surfaces exist. Their availability, permission rules, calendar scope, and occupancy integration must be checked before promising complete conflict detection.
- The previously discussed `MarksGradesPage.tsx`, `academics/results/views.py`, and `result_models.py` are absent from this checkout. Do not plan a dependency on those files.

## Proposed user procedure

1. Open Academics → Exams and create an exam draft.
2. Choose academic year, term, campus, participating classes and sections.
3. Load mapped subjects; select the papers and assessment components that apply.
4. Enter dates and times in a bulk schedule grid; review a calendar view.
5. Assign rooms and invigilators when that delivery stage is available.
6. Review missing fields, overlaps, holiday warnings, and roster coverage.
7. Preview and publish the timetable.
8. Reschedule through a recorded revision and regenerate affected documents later.

Confirmed scope: one exam event can contain several classes, each with its own subject schedules. Individual class tests must also be supported for a single class. Use the same exam creation procedure with one or several participating classes; a class test must not require a school-wide event. Sharing an exam event does not force classes to share subjects, dates, times, or assessment limits. Exam creation, class scope, and publication are controlled by RBAC permissions, not hard-coded teacher ownership. A teacher with the applicable permission may create a test for classes they are not assigned to; an exam controller or another authorized role may also create or publish exams. Teachers may publish their own class tests without a separate approval step when their permissions allow it.

## Feature inventory and delivery stages

| Stage | Features | Completion condition |
| --- | --- | --- |
| 1. Exam creation | Name, academic year, optional term, category, campus scope, classes/sections, date range, coordinator, instructions; draft save and edit; duplicate an earlier exam without its students, marks, or published state | Staff can create and reopen a valid draft using real academic records |
| 2. Subjects and assessment setup | Load mapped ERP subjects; identify compulsory/elective participation; marks, grade-only, or hybrid assessment; named components such as theory/practical/internal; maximum marks and independent or combined pass rules | Each paper has a stable identity and validated assessment definition; unsupported grading rules are shown explicitly |
| 3. Schedule preparation | Bulk grid with class/section, subject/component, date, shift label, start time, duration, calculated end time, reporting time, gate closing time, venue notes; copy common times to selected rows; list/calendar views; unscheduled-paper filter | Staff can prepare and save a complete multi-class timetable without repeating common inputs |
| 4. Validation and publication | Time and date validation; class and candidate overlaps; holidays/non-working days; session/date boundaries; missing papers; review screen; print/download timetable; publish, cancel, and recorded reschedule | A timetable cannot publish with blocking errors; acknowledged warnings and later changes are attributable |
| 5. Rooms and staff | Manual room and invigilator assignments; multiple rooms per paper; capacity checks using confirmed exam seating capacity; staff and room overlap checks across exams; ordinary timetable occupancy warnings | Assigned resources are available for the full interval and selected campus |
| 6. Seating and operational sheets | Student-to-room assignment, manual corrections, configurable interleaving where feasible; capacity and accessibility constraints; room door slips, attendance sheets, invigilator duty sheets | Every participating candidate has a valid seat or appears in an explicit unallocated list |
| 7. Question paper workflow | Separate syllabus/instructions from confidential papers; Set A/B/C, answer keys, blueprints; upload, review, approve, lock; timed access; private storage and download audit | Server permissions and file access enforce release rules; a hidden browser button is insufficient |

All requested scheduling features are represented across the stages. Each stage needs review before its implementation begins. Hall ticket design, marks entry, moderation, cumulative results, marksheet design, result dispatch, and promotion remain subsequent projects.

## Additional scheduling features worth including

- Copy a previous timetable as a draft with explicit new dates and current subject mappings.
- Show candidate counts, missing subject mappings, and students whose elective registration is unresolved.
- Support practical papers held in multiple batches, with individual candidate membership and batch times.
- Record approved extra time and accessibility needs with restricted visibility; extend conflict checks to the actual candidate and room interval.
- Offer configurable minimum gaps between papers as warnings; do not assume one national rule.
- Show a before/after summary when a published paper changes date, time, room, or duration.
- Reject stale saves when two staff members edit the same schedule; let the second editor reload and reconcile.
- Archive past exams and preserve their published timetable history.

Automatic timetable generation should be considered after manual scheduling rules work. It needs agreed priorities for gaps, staff availability, room use, practical batches, and unsatisfiable constraints; it cannot be promised as a simple additional toggle.

## Validation policy to agree

Blocking errors should include invalid time ordering, negative duration, invalid assessment limits, foreign institute references, overlapping papers for the same confirmed candidate, and double-booked assigned rooms or invigilators. Server validation must repeat checks before publication and assignment changes to catch concurrent edits.

Holiday clashes, short gaps, and ordinary teaching-period conflicts should initially require explicit review. The school must decide which can be overridden and by whom. Never describe a schedule as conflict-free when candidate membership, holiday data, room availability, or staff availability is missing.

Use the campus time zone for entry and display. Initially keep papers within one local day unless overnight exams are confirmed as a requirement. Room occupancy must include any agreed preparation and clearance buffers.

## Data and integration direction

### RBAC mapping and proposed permission rules

Repository evidence: `services/api/modules/access_control/migrations/0002_seed_permission_catalog.py:24–29` defines `assessment.create` and separate marks permissions. `services/api/modules/access_control/models.py:115–133` supports configuration on role permission grants. UserRoleAssignment supports institute/branch assignments and validity windows. `services/api/modules/institutes/api/rbac.py:18–42` delegates enforcement to the shared access-control policy layer. The Role Builder already edits selected permission keys and grant configuration. Reuse these mechanisms; grant configuration existing as JSON does not establish that exam-specific scopes are already enforced.

The following action names are proposed additions unless marked existing. Confirm catalog naming and configuration validation during detailed design.

| Action | Proposed permission | Required scope behavior |
| --- | --- | --- |
| Create class tests or shared exam drafts | Existing `assessment.create` | Assignment-based class/subject scope by default; explicit broader scope when granted |
| View exam drafts and schedules | `assessment.view` | Filter records by authorized scope; publication audience is a separate decision |
| Edit draft details, subjects and slots | `assessment.edit` | Ownership alone does not grant access; check action and current target scope |
| Publish a complete timetable | `assessment.publish` | Separate from creation; teachers with this grant may publish their own class tests without approval |
| Reschedule an already published timetable | `assessment.reschedule` | Requires reason and revision; revalidate conflicts and target scope |
| Cancel an exam or paper | `assessment.cancel` | Requires reason and preserved history |
| Acknowledge an overridable scheduling warning | `assessment.override_warning` | Requires reason; never bypass tenant boundaries or blocking errors |

Proposed grant scope: assigned classes/subjects, selected classes/subjects, any class within an authorized branch, or any class within the authorized institute. Selected scope must include academic year and section distinctions where needed. These are exam scope rules to implement and validate through the existing RBAC system, not claims of current capabilities.

Cross-class authority must be explicit for each action. Creating a test for an unassigned class does not automatically grant publication, access to marks, confidential papers, or later result management. Role names such as Teacher and Exam Controller are permission presets, not authorization checks. A custom role can receive the same grants. No ordinary role or assignment can cross an institute boundary.

Check both action and scope on the server for listing, reading, creation, editing, publication, duplication, and rescheduling. For a shared exam, authority must cover every included class before an action affecting the entire event is allowed. Changes to target classes must validate both the existing and requested scopes. Revocation or expiry takes effect at subsequent server checks. Record actor, action, affected exam/classes, revision, and reason for exceptional actions. UI controls reflect the same effective permissions.

Before implementing, trace the existing policy resolver and admin route guards to establish whether ordinary teachers/custom-role users can reach these endpoints. Passing a fine-grained check is insufficient if a separate admin-only guard rejects them. Review how multiple grants combine so that a broad grant for one action cannot widen another action unintentionally.

Introduce structured exam, participation, paper/component, schedule, and publication revision records as needed. Keep assessment definitions separate from timetable slots: a practical assessment may have several batches, and changing its room must not create a new subject or mark column.

Do not select exact table names or API contracts until the multi-class structure and candidate rules are agreed. Reuse existing tenant, campus, academic, staff, and enrollment records. Authorize every read and write by institute, campus, and staff responsibility.

Publication should preserve an identifiable timetable revision. Schedule edits create a new revision with a reason; later hall tickets must identify which published revision they use. Roster changes after publication need a visible reconciliation step. Cancelled papers retain history. Existing generic exam records must remain readable while a reviewed migration or explicit conversion path is introduced.

The question vault needs a separate security design. Encryption, server access timestamps, private file URLs, audit retention, and key handling are distinct requirements. A download log cannot prove whether someone printed or photographed a downloaded file.

## Proposed implementation order

1. Confirm exam ownership, multi-class structure, assessment needs, and publishing authority.
2. Trace the actual routes, serializers, callers, permissions, and existing exam data; settle the conversion path for generic records.
3. Implement Stage 1 as the first complete slice: create → persist → reopen → edit, with required tenant and validation checks.
4. Add assessment setup, then the schedule grid and server validation.
5. Add publication, revision history, and timetable output.
6. Add resource assignments, seating, and confidential paper workflow as separately reviewed slices.

For each slice, verify persisted behavior, permissions, conflicts, concurrent changes where relevant, and desktop/mobile/keyboard flows. Include tests for rules that can corrupt schedules or cross institute boundaries. Broader regression checks depend on the implementation footprint.

## Open decisions

- Resolved: shared exam events contain several classes with separate subject schedules; individual class tests contain one class.
- Which exam types and component/pass rules the first school actually uses.
- How elective registrations and practical batches are represented and maintained.
- Resolved: use RBAC permissions for exam creation, class scope, publication, warning overrides, rescheduling, and cancellation. Permission grants can allow cross-class creation; teacher assignment is not the sole scope rule.
- Define the permission actions and supported scope levels using CampusOne's existing RBAC conventions. Teachers can publish their own class tests without separate approval when granted the relevant permissions; authorized exam controllers or other roles can manage shared exams.
- Who may publish shared exams, override warnings, reschedule, and cancel, by explicit permission.
- Whether publication immediately exposes schedules to students, or only to staff initially.
- Which resource and paper-vault stages must be available for the first usable release.

## Review status

This is an anchored working proposal, not an approved design. EGM requires clarification and explicit readiness confirmation before fresh-context Goldfish reviews. Those reviews will challenge scope, usability, migration, operational cost, and failure handling before the brief is finalized.
