# Cross-Section Combined Lessons for the Timetable Generator

**Date:** 2026-08-13
**Status:** Approved by user (design review)

## Problem

Today every timetable assignment (`SubjectTeacherAssignment`) and every generated
lesson entry is tied to exactly one `ClassSection`. There is no way to schedule a
lesson shared by multiple sections of the same grade — needed for language and
elective subjects where students from sections A/B/C combine at the same period
(possibly split across several parallel options such as French/Spanish/German),
and for whole-grade shared periods.

## Requirements (confirmed with user)

1. An assignment can target any subset of a grade's sections, including "all
   sections" (a static snapshot at creation time, not a live set). Works for any
   subject, primarily language/elective.
2. **Joint block semantics:** when sections share a common period, every
   participating section is marked busy at that exact (day, period); the period
   appears identically on each section's grid and nothing else can be scheduled
   for those sections at that time.
3. **Parallel options:** several assignments (each with its own teacher and
   optional room) can run simultaneously in the same joint block (e.g.
   French/Teacher A in Room 1, Spanish/Teacher B in Room 2), drawing from the
   same combined pool of sections. These must land on the exact same day+period
   every week.
4. Linking mechanism: a simple "Combined Slot" label on the assignment.
   Assignments sharing the same label **and** the exact same section set are
   auto-treated as one joint block. No separate CRUD entity.
5. Existing single-section assignments keep today's behavior unchanged.

## Design

### 1. Data model — `services/api/modules/academics/models.py`

`SubjectTeacherAssignment` changes:

- Replace the single `class_section` FK with
  `class_sections = ManyToManyField(ClassSection)`. A normal assignment has one
  section in the set; a combined lesson has 2+.
- Add `combined_slot_label` — optional short text field (e.g.
  `"Class 10 – Second Language"`). Assignments sharing both the same label and
  the exact same `class_sections` set are parallel options that must share a
  day+period every week. Blank for ordinary lessons, including plain
  multi-section ones with no parallel alternatives.
- Uniqueness: "one teacher per subject within a given section-set" — the old
  `uq_section_subject_teacher` DB constraint is replaced by serializer/service
  level validation (M2M cannot express set-level unique-together in the DB).

Validation rules (serializer/service layer):

- All `class_sections` in one assignment must belong to the same `Grade`,
  `branch`, and `academic_year`.
- "All sections" in the UI pre-checks every current `ClassSection` for the
  grade — a static snapshot, not dynamic.
- All assignments sharing a `combined_slot_label` + section-set must have
  identical `periods_per_week` and `avoid_repeat_same_day`; mismatches are
  rejected, since the group is forced onto the same slots.

**Migration:** data migration converts each existing `class_section` value into
a single-row `class_sections` M2M entry; `combined_slot_label` defaults blank.
No behavior change for existing data.

### 2. Solver — `apps/institute-admin-web/src/features/timetable/TimetableGenerator.jsx`

- **Task building (`buildTaskQueue`):** group assignments by
  `(combined_slot_label, class_sections set)` when the label is non-blank. Each
  group becomes one joint task per weekly occurrence (shared
  `periods_per_week`), instead of one task per assignment.
- **Candidate search / placement (`getSingleCandidates`,
  `getDoubleCandidates`, `placeCandidate`, `canPlaceAt`):** a joint task's
  candidate slot at `(day, period)` is valid only if every section in the set
  has `classBusy` false, every distinct teacher across the group's assignments
  has `teacherBusy` false, and every distinct room (if any) has `roomBusy`
  false. Placement marks `classBusy` for all sections and `teacherBusy` /
  `roomBusy` per assignment. Teacher daily caps (`maxPeriodsPerDay`) and
  availability windows are checked per teacher as today.
- **Entries produced:** a joint task placed at `(day, period)` emits one
  timetable entry per `(section, assignment)` pair — e.g. 3 sections × 2
  parallel options = 6 entries sharing the same day/period. This preserves the
  existing single-`classId`-per-entry shape, so downstream rendering, exports,
  and the publish bundle need minimal changes.
- Non-parallel multi-section assignments (blank label, 2+ sections): one task,
  placed once, entries duplicated per section — same mechanism, group size 1.
- Single-section assignments (`class_sections` length 1): unchanged behavior.
- Pre-flight validation (`validateTimetableInput`) accounts for joint tasks
  when computing per-section load (a joint block consumes one slot in every
  participating section).
- Local search (`localSearchImprove`) either moves a joint block atomically
  (all its entries together) or skips joint-block entries in swaps; it must
  never separate parallel options.

### 3. Frontend UX — `TimetablePage.tsx` / `TimetableGenerator.jsx` (Assignments tab)

- Assignment form: replace the single section dropdown with a multi-select of
  sections scoped to the chosen grade, plus an "All sections" checkbox.
- Optional "Combined Slot" text/select field, shown once 2+ sections are
  selected; reusing the same label on another assignment with the same section
  set links them as parallel options.
- Timetable grid: a joint-block period displays all parallel subject/teacher
  options together (e.g. "French (Mrs. X) / Spanish (Mr. Y)") on each
  participating section's row at that slot.
- Backend validation errors (mismatched `periods_per_week`, sections spanning
  grades, duplicate subject within a section-set) surface inline on the form.
- Bulk import (Assignments sheet): the sections column accepts multiple section
  names (delimiter-separated) and an optional combined-slot column; single
  values continue to work as today.

### 4. Testing

- **Solver unit tests (`TimetableGenerator.solver.test.jsx`):**
  - Joint task placement blocks all participating sections at that slot.
  - Parallel options always co-locate on the same day/period, all weekly
    occurrences.
  - Teacher/room double-booking across an unrelated lesson is still caught.
  - Local search never separates a joint block.
  - Single-section assignments produce identical results to today.
- **Backend tests:**
  - M2M validation: cross-grade rejection, mismatched `periods_per_week`
    rejection, duplicate subject-per-section-set rejection.
  - Migration correctness for existing single-section data.
- **Frontend tests (`TimetablePage.test.tsx`):** multi-select save payload,
  "All sections" snapshot behavior, combined-slot field visibility.

## Out of scope

- Cross-grade combined lessons (sections from different grades).
- Live/dynamic "all sections" membership that updates when sections are added.
- Student-level elective choice tracking (which student attends which option).
