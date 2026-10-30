# Academic structure integration

Import the feature-local entry point and mount it for the AC2 route:

```tsx
import { AcademicStructurePage } from './features/academics'

<AcademicStructurePage
  accessToken={session.accessToken}
  branches={dashboard.context.branches}
  selectedBranch={branch}
  teachers={teacherOptions}
/>
```

- Route target: `/academics/structure` (AC2, “Classes, Sections & Subjects”).
- `selectedBranch` accepts a branch UUID or `all`. It scopes section lists and defaults the section form; academic years, classes, and subjects remain institute-wide.
- `branches` must contain the active institute branches. Optional `teachers` should contain teacher user IDs (not staff-profile IDs), names, and branch IDs. Without it, sections can still be created and edited with an unassigned class teacher.
- The page owns no routing or shell state. The host should pass the same branch context used by `AppShell`.
- API requests use `/api/v1/admin/academics/{academic-years|classes|subjects|sections}` and require the existing bearer token. API validation messages and trace references are rendered in list and modal error states.

## Exam draft workflow

`ExamDraftsPage` is mounted at Assessment & Results (AAR1) by the host application. It uses the same active institute web session and bearer token as the academic structure feature. Teacher/staff admin-web sessions are admitted only when they have a configured exam `assessment.view` or `assessment.create` grant. Their shell is limited to this workspace; scoped exam endpoints still enforce each action and target on every request.

The structured draft API lives under `/api/v1/admin/academics/exams`:

- `GET /options?kind=bootstrap` returns authorized `campuses`, `academicYears` (including `isCurrent`), `categories`, and effective `actions`.
- `GET /options?kind=sections&action=create|view|edit&campusId=…&academicYearId=…` returns paged `items` with section, campus, class, and year identifiers. `terms` and `coordinators` are separate `kind` values.
- `GET /` lists paged draft `items`; `POST /` creates a draft using a UUID `requestId`, one campus/year, category, name, and nonempty `classSectionIds`.
- `GET /{examId}` opens a view-authorized draft. `PATCH /{examId}` requires `expectedRevision`; stale edits return `409 revision_conflict`.
- `POST /{examId}/duplicate` creates an independent draft after checking source view and destination create scope. It never copies marks, candidates, or publication state.

Creation and duplication are idempotent for a request ID and identical payload. Reusing a request ID with different details returns `409 request_key_conflict`. A create-only user receives a save receipt (`requestId`, `examId`, `savedRevision`) without draft details; list/detail require view coverage over every target. View, edit, and create grants are independent.

Role Builder stores versioned exam permission options with each assessment action. `schemaVersion: 1` supports `examScope` values `assigned`, `selected`, `branch`, and `institute`; selected scopes use section IDs and exact class-section/subject pairs. Empty legacy assessment configuration does not grant access to the structured endpoints. `assessment.view` and `assessment.edit` are available in the active permission catalog but are not automatically assigned to default roles.

Generic `AcademicOperation` records of kind `EXAM` are excluded from the legacy list and cannot be created, edited, or deleted through the generic writer. New drafts have status `DRAFT`; subject-level schedules, time slots, publication, rooms, seating, hall tickets, and marks remain later phases.

The development cleanup command is dry-run by default and requires explicit `--institute-id` values. Apply mode is limited to `DEBUG` development settings and requires `--confirm-target` to exactly match its displayed database identity. Inspect the dry-run counts and target identity before applying it; it only targets generic `AcademicOperation.EXAM` rows and refuses related non-exam deletion effects.
