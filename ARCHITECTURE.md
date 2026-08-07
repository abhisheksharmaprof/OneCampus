# CampusOne — Modular School CRM Architecture

> This document is the implementation contract for CampusOne. It defines boundaries that let the Parent, Staff/Teacher, and Institute Admin products evolve independently and be extracted into standalone applications later without rewriting their business logic.

## 1. Product scope

CampusOne is a multi-tenant SaaS school CRM. The platform can host many institutes; each institute has one or more branches, and every institute-level administrator is scoped to one institute unless an explicit platform-level support role is used.

### Supported clients

| Product | Users | Platform | Login allowed now |
|---|---|---|---|
| Parent app | Parents/guardians | Mobile app | Yes |
| Staff app | Teachers and other staff | Mobile app | Yes |
| Institute Admin | Institute administrators | Web only | Yes |

Do not expose admin login, admin routes, or admin workflows inside either mobile application. Conversely, parent- and staff-only experiences must not be embedded in the admin web shell.

### Initial capabilities

- Institute and branch management
- Student, parent/guardian, staff, class, subject, and timetable management
- Student-to-parent linking and invitation/activation lifecycle
- Classroom and test management for teachers
- Attendance marking and parent absence/presence notifications
- Test results, life/progress reports, and parent visibility
- Leave/application workflows (for example, parent leave requests) with review/audit trail
- In-app and push notifications
- Role- and branch-scoped access control

## 2. Non-negotiable architecture principles

1. **Product isolation first.** Parent, Staff, and Admin own their UI, feature modules, route trees, state, tests, and public API contracts. They must not import implementation code from one another.
2. **Shared does not mean coupled.** Share only stable, generic capabilities through versioned packages: design system, domain contracts, SDK, auth client, configuration, and observability. Never share a screen, feature store, product router, or product-specific business rule.
3. **Backend domains are independent modules.** Each backend module owns its API router, application service, domain model, persistence mapping, authorization policy, tests, and migrations for the tables it owns.
4. **Contract before implementation.** Cross-boundary communication occurs through typed API/event contracts, never database-table access or imports into another module's internals.
5. **Tenant safety by default.** Every institute-owned record is scoped to `institute_id`; branch-owned records are additionally scoped to `branch_id` when applicable. Authorization must validate both scope and role server-side for every request.
6. **Role routing is server-authoritative.** The client may use role claims only for navigation. The server must enforce permissions independently on every endpoint.
7. **No distributed complexity prematurely.** Start as a modular monolith with independently deployable app shells and clear contracts. Extract a backend domain into a service only when scaling, ownership, reliability, or release cadence requires it.

## 3. Recommended repository layout

Use a monorepo. It makes shared contracts/design assets reliable while preserving hard product boundaries.

```text
CampusOne/
├── apps/
│   ├── parent-mobile/                 # Parent-only mobile application
│   │   ├── src/
│   │   │   ├── app/                   # Bootstrap, providers, navigation entry
│   │   │   ├── features/              # Parent-owned feature slices only
│   │   │   │   ├── children/
│   │   │   │   ├── attendance/
│   │   │   │   ├── results/
│   │   │   │   ├── reports/
│   │   │   │   ├── leave-requests/
│   │   │   │   └── notifications/
│   │   │   ├── routes/
│   │   │   └── tests/
│   │   └── package.json
│   ├── staff-mobile/                  # Teacher/staff-only mobile application
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── features/
│   │   │   │   ├── classrooms/
│   │   │   │   ├── attendance/
│   │   │   │   ├── assessments/
│   │   │   │   ├── results/
│   │   │   │   └── student-directory/
│   │   │   ├── routes/
│   │   │   └── tests/
│   │   └── package.json
│   └── institute-admin-web/           # Institute-admin-only web application
│       ├── src/
│       │   ├── app/
│       │   ├── features/
│       │   │   ├── institutes/
│       │   │   ├── branches/
│       │   │   ├── users-and-roles/
│       │   │   ├── students/
│       │   │   ├── parents/
│       │   │   ├── staff/
│       │   │   ├── classes/
│       │   │   ├── academics/
│       │   │   └── notification-center/
│       │   ├── routes/
│       │   └── tests/
│       └── package.json
│
├── services/
│   └── api/                           # Modular backend; deploy as one API initially
│       ├── src/
│       │   ├── bootstrap/             # Application setup, DI, configuration
│       │   ├── platform/              # Cross-cutting infrastructure only
│       │   │   ├── auth/
│       │   │   ├── database/
│       │   │   ├── events/
│       │   │   ├── storage/
│       │   │   ├── notifications/
│       │   │   └── observability/
│       │   ├── modules/
│       │   │   ├── identity/          # Login, tokens, users, roles, sessions
│       │   │   ├── institute/         # Institutes, branches, institute settings
│       │   │   ├── academics/         # Classes, sections, subjects, timetables
│       │   │   ├── people/            # Students, guardians, staff, enrollments
│       │   │   ├── attendance/        # Attendance sessions/records/policies
│       │   │   ├── assessments/       # Tests, marks, results, report generation
│       │   │   ├── leave/             # Parent/student leave requests and approvals
│       │   │   └── notifications/     # Templates, delivery, preferences, logs
│       │   └── api/                   # Composition root only; mounts module routers
│       ├── tests/
│       │   ├── contract/
│       │   ├── integration/
│       │   └── modules/
│       └── migrations/
│
├── packages/
│   ├── design-system/                 # Tokens, accessible components, icons, themes
│   ├── api-contracts/                 # Versioned DTO/schema types and event contracts
│   ├── api-client/                    # Generated/typed HTTP client, auth transport
│   ├── auth-client/                   # Token storage, refresh, session helpers only
│   ├── config/                        # Typed environment/config validation
│   ├── observability/                 # Logging, tracing, error-reporting adapters
│   └── testing/                       # Reusable test factories and test utilities
│
├── docs/
│   ├── adr/                           # Architecture decision records
│   ├── api/                           # API and event contract documentation
│   ├── security/                      # Threat model, permission matrix, data policy
│   └── product/                       # Requirements supplied later
├── infra/                             # Containers, CI/CD, IaC, deployment config
├── scripts/                           # Local developer/CI automation
├── .github/                           # CI workflows, templates, CODEOWNERS
├── package.json / workspace config
└── ARCHITECTURE.md
```

### Extraction rule

Each product app may depend only on `packages/*` and published API/event contracts. Therefore, extracting `apps/parent-mobile` means copying that directory plus its declared package dependencies; it must never require `apps/staff-mobile` or `apps/institute-admin-web` source code.

Likewise, a backend module can later become a separate service by moving its module folder, its migrations, and its contract implementation behind the same versioned API/event contract.

## 4. Product boundaries and dependency rules

### Allowed imports

```text
apps/parent-mobile      -> packages/*, API contracts only
apps/staff-mobile       -> packages/*, API contracts only
apps/institute-admin-web-> packages/*, API contracts only
services/api/modules/*  -> platform/*, own module, public contracts of another module
```

### Forbidden imports

```text
parent-mobile  -> staff-mobile or institute-admin-web
staff-mobile   -> parent-mobile or institute-admin-web
institute-admin-web -> parent-mobile or staff-mobile
backend module A -> module B's repositories/entities/private services
any frontend -> database, backend internal code, or another product's feature folder
```

Enforce this with workspace dependency rules, lint import-boundary rules, and CI. A shared component belongs in `packages/design-system` only when it contains no product workflow or domain decision.

## 5. Frontend feature slice standard

Every product feature follows the same internal structure, but exists only inside its owning app.

```text
features/results/
├── api/                # Product-facing API calls using @campusone/api-client
├── components/         # Feature-local UI; not exported outside the app
├── hooks/
├── models/             # View models/selectors, never duplicate server DTOs blindly
├── screens/            # Parent/Staff/Admin screens for this product only
├── state/              # Feature-local state/query keys
├── validation/         # Form schemas and inline validation messages
├── __tests__/
└── index.ts            # Explicit public surface for this feature only
```

- Prefer server-state/query caching for remote data; keep global client state minimal.
- Keep forms close to the feature; show inline, accessible field errors.
- Do not ask users to enter operational IDs. IDs are generated and selected through validated search/pickers.
- Use feature-local routes, then compose them only in the owning product's route tree.

## 6. Authentication and role-based startup routing

### Canonical login flow

1. The client submits credentials to `POST /v1/identity/sessions`.
2. The API authenticates the user and returns a signed access token, refresh token/session reference, and a normalized session profile.
3. The client validates the response schema and stores credentials in platform-secure storage.
4. The client resolves the single active product role from the server response.
5. The client resets navigation into that role's root route. Never merely push a role screen on top of the login screen.
6. Every subsequent API request includes the access token; every endpoint repeats authorization checks.

Example normalized response:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "usr_...",
    "displayName": "Asha Kumar",
    "roles": ["PARENT"],
    "activeRole": "PARENT",
    "instituteId": "ins_...",
    "branchIds": ["br_..."]
  }
}
```

### Route policy

| `activeRole` from API | Client | Root route |
|---|---|---|
| `PARENT` | Parent mobile | `/(parent)/home` |
| `TEACHER` or `STAFF` | Staff mobile | `/(staff)/home` |
| `INSTITUTE_ADMIN` | Institute Admin web | `/admin/dashboard` |

Rules:

- The parent app accepts only `PARENT`; the staff app accepts only `TEACHER`/`STAFF`; the web app accepts only `INSTITUTE_ADMIN` (and future explicitly approved admin roles).
- If a valid user authenticates into the wrong client, end the local session and display a clear message directing them to the supported client. Do not silently expose another product's UI.
- If a user has multiple roles, the API must return an explicit `activeRole` based on the login context or a deliberate role-selection endpoint. Do not infer role from client-side priority order.
- A route guard validates session + accepted role before rendering protected content. API authorization remains the final authority.

## 7. Backend module contract

Each module uses the following shape. Names may follow the selected backend language/framework convention.

```text
modules/attendance/
├── api/                # HTTP router/controllers, request/response mapping
├── application/        # Use cases/commands/queries; transaction boundary
├── domain/             # Entities, value objects, policies, domain events
├── infrastructure/     # ORM mappings, repositories, provider adapters
├── contracts/          # Public module DTOs/events, re-exported from api-contracts
├── authorization/      # Module permission checks and scope guards
├── tests/
└── module.ts           # Explicit module registration/public surface
```

### Ownership

| Module | Owns | Publishes |
|---|---|---|
| Identity | Users, credentials, roles, sessions | session profile, role/permission contracts |
| Institute | Institute, branches, settings | branch/institute lookup contracts |
| People | Students, guardians, staff, links, enrollment | student/guardian/staff lifecycle events |
| Academics | Classes, sections, subjects, timetables | class/section assignment contracts |
| Attendance | Attendance sessions, records, policies | `attendance.recorded` event |
| Assessments | Tests, marks, results, report jobs | `result.published`, `report.ready` events |
| Leave | Leave requests, approvals/rejections | `leave.status_changed` event |
| Notifications | Preferences, templates, delivery records | notification delivery status |

A module reads another module's data through a public query contract, replicated read model, or event-built projection—not by joining or writing another module's private tables.

## 8. Multi-tenancy, data model, and permissions

### Required scope fields

- `institute_id`: required on every institute-owned entity.
- `branch_id`: required where an entity belongs to a branch.
- `created_by`, `updated_by`, timestamps: required for audit-sensitive records.
- `version`/optimistic concurrency: required for records that administrators or staff may edit concurrently.

### Important relationships

```text
Institute -> Branches
Branch -> Classes/Sections -> Student Enrollments
Student <-> Guardian links (many-to-many; one guardian can have multiple children)
Staff -> Branch assignment(s), classroom/subject assignment(s)
Assessment -> Result per student -> Parent-visible report
Attendance session -> Student attendance record -> notification event
```

### Permission approach

Use RBAC plus scope checks:

```text
permission check = role permission
                 + institute match
                 + branch assignment (when applicable)
                 + relationship check (for example, parent linked to student)
```

Examples:

- A parent can view only data for students linked to that guardian account.
- A teacher can mark attendance only for assigned class/section periods.
- A staff member can access only approved branch/class resources.
- An institute admin can administer only their own institute and assigned branches.
- Cross-branch access must be explicit; never assume it from an admin title alone.

## 9. Event and notification design

Use an outbox pattern: write the business change and its integration event in the same database transaction, then asynchronously publish it. This prevents a saved attendance record from failing to notify because a network call failed mid-request.

Example event payload:

```json
{
  "eventId": "evt_...",
  "eventType": "attendance.recorded.v1",
  "occurredAt": "2026-07-18T10:00:00Z",
  "instituteId": "ins_...",
  "branchId": "br_...",
  "subject": { "studentId": "stu_...", "attendanceId": "att_..." },
  "traceId": "trace_..."
}
```

Notification processing must be idempotent, retryable, observable, and preference-aware. Keep delivery logs but never put confidential assessment/medical details in lock-screen push text.

## 10. API conventions

- Version external endpoints: `/v1/...`.
- Use JSON request/response schemas generated from or checked against `packages/api-contracts`.
- Use consistent error bodies with `code`, `message`, `fieldErrors` (when applicable), and `traceId`.
- Paginate all list endpoints; filter and sort only through allow-listed parameters.
- Use cursor pagination for large or frequently changing lists.
- Require idempotency keys for externally retryable write actions such as attendance submit, result publish, and leave submission.
- Maintain backward compatibility for mobile clients; introduce additive changes first and deprecate deliberately.

## 11. Security, privacy, and reliability baseline

- Passwords are salted and hashed with a modern password-hashing algorithm; never log passwords, tokens, or sensitive student data.
- Use short-lived access tokens and secure refresh/session rotation.
- Store mobile credentials in OS secure storage; use secure, HTTP-only cookies for web sessions where feasible.
- Encrypt data in transit and at rest; restrict backups and production-data access.
- Audit privileged actions: role changes, branch access changes, result publication, attendance corrections, and data exports.
- Rate-limit login, password reset, invitation, and notification-triggering endpoints.
- Add consent/communication preferences and a documented data retention/deletion policy before launch.
- Add structured logs, error monitoring, metrics, traces, health checks, backups, and restore testing.

## 12. Quality gates

Every change must pass the applicable gates before merge:

1. Formatting, linting, type checking, and import-boundary rules.
2. Unit tests for use cases, authorization policies, and validation.
3. Integration tests for API + database behavior, including tenant/branch isolation.
4. Contract tests between each app/API client and the backend API.
5. End-to-end tests for login role routing, attendance marking, result publication, and parent notification visibility.
6. Accessibility checks for forms, route guards, errors, and navigation.
7. Security review for auth, authorization, PII, and notification changes.

Minimum critical regression scenarios:

- Parent login reaches the parent root and cannot access another student's data.
- Teacher/staff login reaches the staff root and can mark attendance only for assigned classes.
- Institute-admin login works only on the web app and is denied by mobile apps.
- An attendance record produces exactly one parent notification despite a retry.
- Published test results become visible only to linked parents in the correct institute/branch.
- A user from institute A cannot read or mutate institute B data by changing an ID in a request.

## 13. Delivery sequence

Build in thin, secure vertical slices rather than isolated screens.

1. Establish workspace, CI, environment validation, design system, contracts, identity, institute/branch scope, and audit/observability baseline.
2. Build admin web: institute setup, branches, staff, students, guardians, classes, and secure link/invitation flows.
3. Build parent mobile: authentication, linked-child selection, profile, attendance, results, reports, and notification inbox.
4. Build staff mobile: authentication, assigned classroom/timetable, attendance, test/result entry, and basic student view.
5. Add event-driven notifications, leave/application flows, reporting, resilience controls, and full end-to-end coverage.
6. Only after measured need, extract a backend domain into a separately deployed service while preserving its public contracts.

## 14. Decisions intentionally deferred

Do not guess these until requirements/files are provided:

- Exact technology stack (for example React Native/Expo, React web, FastAPI/NestJS, database, queue, and push provider)
- Complete role/permission matrix and whether a person can actively switch roles
- Parent invitation/identity verification method
- Whether "apply colleagues" means leave applications, college applications, or another workflow
- Report templates, grading schemes, attendance policies, and notification preferences
- Regulatory, consent, localization, language, and data-retention requirements
- Offline behavior, conflict resolution, and document/file storage requirements

When these are supplied, record consequential decisions as ADRs under `docs/adr/` and update this document without weakening the product boundaries above.
