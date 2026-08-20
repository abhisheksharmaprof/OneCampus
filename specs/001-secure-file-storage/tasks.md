---

description: "Dependency-ordered implementation tasks for secure, tenant- and branch-scoped file storage"
---

# Tasks: Secure File Storage

**Input**: Design documents from `specs/001-secure-file-storage/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/openapi.yaml`, `quickstart.md`

**Tests**: Required by the CampusOne constitution. Within every story, create the listed tests first, confirm they fail for the missing behavior, then implement until they pass.

**Organization**: Tasks are grouped by user story so each story can be completed and validated as a standalone increment after the shared foundation.

## Required Object-Key Structure

Use two bounded buckets per environment—one private and one public—not one bucket per institute or branch. R2 has a flat namespace; these versioned prefixes provide operational organization while PostgreSQL and server-side policy remain the authorization source of truth.

```text
# Private bucket: staging uploads (eligible for short lifecycle cleanup)
v1/staging/institutes/<instituteId>/branches/<branchId|_institute>/uploads/<uploadId>/source

# Private bucket: immutable originals
v1/objects/institutes/<instituteId>/branches/<branchId|_institute>/owners/<ownerType>/<ownerId>/<category>/<assetId>/original.<ext>

# Private bucket: immutable derived variants
v1/variants/institutes/<instituteId>/branches/<branchId|_institute>/owners/<ownerType>/<ownerId>/<category>/<assetId>/<variantType>/<variantId>.<ext>

# Public bucket: policy-approved immutable branding only
v1/public/institutes/<instituteId>/branches/<branchId|_institute>/branding/<category>/<publicId>/<revisionId>.<ext>
```

Rules:

- `_institute` is the single canonical scope segment for institute-wide assets; real branch UUIDs are required for branch-owned assets.
- All segments are generated from validated enums/UUIDs; original filenames, school names, student names, emails, and user-controlled path fragments never appear in keys.
- Staging, original, variant, and public key builders are separate typed functions; no controller or task concatenates keys manually.
- Final and variant keys are immutable and create-only. Replacement creates a new asset/key and moves the old asset through retention.
- Bucket names, keys, grants, checksums, and provider credentials are confidential and excluded from public DTOs and normal logs.
- Bucket policies and CORS provide transport boundaries; institute/branch isolation is always rechecked by CampusOne authorization and database scope.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on unfinished work in the same phase
- **[Story]**: Maps the task to User Story 1–4
- Every task includes an exact repository path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish dependencies, configuration, module layout, and deployment-safe R2 conventions.

- [X] T001 Add bounded boto3/botocore and Pillow dependencies while retaining Azure packages for legacy reads in `services/api/pyproject.toml` and refresh `services/api/uv.lock`
- [X] T002 [P] Add documented, secret-free R2 endpoint, private/public bucket, custom-domain, TTL, timeout, retry, retention, CORS, and cache-purge variables in `services/api/.env.example`
- [X] T003 Configure and validate R2, retry, connection-pool, retention, staging-cleanup, and preview settings with safe production defaults in `services/api/config/settings/base.py`
- [X] T004 [P] Create provider, API, and application-service package scaffolding in `services/api/modules/file_storage/storage/`, `services/api/modules/file_storage/api/`, and `services/api/modules/file_storage/services/`
- [X] T005 [P] Create the typed frontend file feature scaffolding in `apps/institute-admin-web/src/features/files/files.types.ts`, `apps/institute-admin-web/src/features/files/files.api.ts`, and `apps/institute-admin-web/src/features/files/useFileUpload.ts`
- [X] T006 [P] Document the two-bucket policy, exact institute/branch key grammar, `_institute` rule, CORS allowlist, lifecycle prefixes, credential scope, and no-PII key rule in `docs/security/file-storage.md`
- [X] T007 [P] Add a production operations checklist for creating R2 buckets, custom-domain caching, exact-origin CORS, staging lifecycle cleanup, least-privilege tokens, alarms, and rollback in `docs/operations/r2-file-storage.md`

**Checkpoint**: Dependencies and configuration contracts are explicit; no credentials or provider resources are created by application code.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the schema, typed boundaries, key strategy, validation, permissions, and safe provider primitives required by every story.

**⚠️ CRITICAL**: No user-story implementation begins until this phase passes its focused tests and migrations.

- [ ] T008 [P] Write model, constraint, state-transition, audit-retention, and clean/repaired migration-history tests in `services/api/tests/test_file_storage_models.py`
- [ ] T009 [P] Write exhaustive key-builder tests for institute-wide and per-branch staging/original/variant/public paths, UUID normalization, traversal rejection, no-PII segments, deterministic prefixes, and collision resistance in `services/api/tests/test_file_storage_keys.py`
- [ ] T010 [P] Write category, media, size, filename, visibility, branch-scope, and sensitive-publication policy tests in `services/api/tests/test_file_storage_policies.py`
- [X] T011 Define provider-neutral grant, head, stream, conditional-copy, delete, and purge result protocols plus safe provider exceptions in `services/api/modules/file_storage/storage/base.py`
- [X] T012 Implement centralized, versioned institute/branch key builders matching the required object-key structure in `services/api/modules/file_storage/storage/keys.py`
- [X] T013 [P] Implement normalized filename, category/media/size, visibility, checksum, and branch-scope policies in `services/api/modules/file_storage/policies.py`
- [X] T014 [P] Add public owner, institute/branch, guardian, and staff/student scope lookup contracts without exposing private models in `services/api/modules/people/contracts.py`
- [X] T015 Expand `FileAsset`, `FileUploadSession`, `FileVariant`, and `FileAccessLog` and add `FileRetentionRecord` and `StorageReconciliationIssue` with indexes and additive compatibility fields in `services/api/modules/file_storage/models.py`
- [X] T016 Create additive schema migration `services/api/modules/file_storage/migrations/0005_secure_file_storage_foundation.py` without modifying migrations `0001`–`0004`
- [X] T017 Add an idempotent data-audit/backfill migration for legacy provider/status/visibility/branch fields and report unsafe rows without moving bytes in `services/api/modules/file_storage/migrations/0006_backfill_secure_file_metadata.py`
- [X] T018 Implement R2 client construction, conditional PUT signing, HEAD, bounded reads, conditional copy, signed GET, delete, and exact-URL purge with explicit timeouts/retries in `services/api/modules/file_storage/storage/r2.py`
- [ ] T019 Preserve legacy Azure locator reads behind the provider protocol and remove provider-specific behavior from shared services in `services/api/modules/file_storage/storage/legacy_azure.py`
- [ ] T020 [P] Add provider-contract tests using fakes/botocore stubs for exact signed headers, timeouts, retries, `412`, ambiguous results, no secret leakage, and R2-supported operations in `services/api/tests/test_file_storage_provider.py`
- [ ] T021 Implement centralized tenant, branch, file-permission, student/guardian, staff-assignment, release-state, and wrong-scope concealment policy in `services/api/modules/file_storage/authorization.py`
- [X] T022 Seed `files.view`, `files.upload`, `files.delete`, and explicit public-publish permissions idempotently in `services/api/modules/access_control/migrations/0005_seed_file_storage_permissions.py`
- [ ] T023 [P] Add authorization-matrix regression tests for institute/branch admins, students, linked/unlinked parents, staff, inactive memberships, changed relationships, and cross-institute requests in `services/api/tests/test_file_storage_authorization.py`
- [ ] T024 Implement bounded tenant/branch-scoped selectors and standard page metadata without per-row grant creation in `services/api/modules/file_storage/selectors.py`
- [X] T025 Define contract-aligned serializers, camelCase DTOs, stable error mappings, and bucket/key redaction in `services/api/modules/file_storage/api/serializers.py`
- [ ] T026 Wire versioned admin and shared file API namespaces while preserving legacy route imports in `services/api/modules/file_storage/api/urls.py`, `services/api/modules/file_storage/urls.py`, and `services/api/config/urls.py`

**Checkpoint**: Schema and migrations are safe, provider calls are isolated and bounded, key paths are tenant/branch structured, and all file operations have one authorization/policy entry point.

---

## Phase 3: User Story 1 - Upload and Register School Files (Priority: P1) 🎯 MVP

**Goal**: An authorized staff member can directly upload a valid file to the correct institute/branch/owner path and receive verified server-backed metadata without file bytes passing through Django or PostgreSQL.

**Independent Test**: Upload one valid student document through initiate → external conditional PUT → complete; verify the exact tenant/branch key structure, immutable final copy, metadata, idempotency, and unchanged content, then reject interrupted, expired, mismatched, oversized, replayed, unauthorized, and cross-tenant cases.

### Tests for User Story 1

- [X] T027 [P] [US1] Write initiation/completion contract tests for envelopes, idempotency, stable errors, and absence of locators in `services/api/tests/test_file_storage_api.py`
- [ ] T028 [P] [US1] Write direct-upload service tests for conditional staging, replay failure, HEAD/checksum/signature verification, immutable final copy, transaction rollback, and orphan prevention in `services/api/tests/test_file_storage_uploads.py`
- [ ] T029 [P] [US1] Write concurrent singleton replacement and duplicate completion tests using transaction locking in `services/api/tests/test_file_storage_upload_races.py`
- [ ] T030 [P] [US1] Write legacy multipart response-shape and Azure-read compatibility tests in `services/api/tests/test_file_storage_legacy_compat.py`
- [ ] T031 [P] [US1] Write frontend tests for checksum calculation, initiation, external PUT without CampusOne credentials, progress, abort, expiry retry, completion, and accessible errors in `apps/institute-admin-web/src/features/files/__tests__/files.api.test.ts`
- [ ] T032 [P] [US1] Write profile/document upload-flow component tests that reload server metadata instead of fabricating local state in `apps/institute-admin-web/src/features/files/__tests__/FileUploadFlow.test.tsx`

### Implementation for User Story 1

- [X] T033 [US1] Implement idempotent initiation with owner/branch/category policy, request fingerprinting, pending rows, staging/final keys, `If-None-Match: *`, exact headers, and after-expiry cleanup timestamp in `services/api/modules/file_storage/services/uploads.py`
- [X] T034 [US1] Implement completion locking, HEAD/size/checksum verification, bounded signature and Pillow image validation, conditional final copy, idempotent activation, and safe failure states in `services/api/modules/file_storage/services/uploads.py`
- [X] T035 [US1] Implement atomic singleton replacement that activates the verified new asset before retaining the old asset and prevents concurrent double-active rows in `services/api/modules/file_storage/services/uploads.py`
- [X] T036 [US1] Implement initiate and complete API views with traceable stable errors and transaction-safe audit events in `services/api/modules/file_storage/api/views.py`
- [X] T037 [US1] Implement the typed CampusOne initiation/completion client, browser MD5 calculation, and credential-free external conditional PUT with progress and AbortController in `apps/institute-admin-web/src/features/files/files.api.ts`
- [ ] T038 [US1] Implement the upload state machine, expiry recovery, retry safety, completion polling/state refresh, and stale-component cancellation in `apps/institute-admin-web/src/features/files/useFileUpload.ts`
- [ ] T039 [US1] Upgrade accessible file selection, progress, cancel, retry, success, and focus-managed error states while mirroring server limits in `apps/institute-admin-web/src/components/admin-ui/FileUploadField.tsx`
- [ ] T040 [US1] Replace student and staff placeholder document upload state with the server-backed direct-upload workflow in `apps/institute-admin-web/src/features/people/ProfilePages.tsx`
- [ ] T041 [US1] Migrate institute logo, letterhead, and document uploads to the shared workflow without changing unrelated profile behavior in `apps/institute-admin-web/src/features/institute/InstituteProfilePage.tsx`
- [ ] T042 [US1] Route legacy multipart endpoints through the same validation/activation services, preserve current response fields for one release, and emit deprecation telemetry in `services/api/modules/file_storage/api/legacy_views.py`
- [X] T043 [US1] Add bounded expired-session and post-expiry staging cleanup tasks that only delete keys generated by the validated staging builder in `services/api/modules/file_storage/tasks.py`

**Checkpoint**: User Story 1 is an independently deployable MVP; file bytes bypass Django, keys encode validated institute/branch scope, and invalid or replayed uploads never become ACTIVE.

---

## Phase 4: User Story 2 - View and Download Authorized Files (Priority: P2)

**Goal**: Currently authorized students, linked parents, staff, and administrators can retrieve private files through short-lived grants, while explicitly approved public branding is cacheable without exposing sensitive assets.

**Independent Test**: For one released private marksheet, grant access to the student, linked parent, and authorized staff while denying unrelated/cross-tenant users; publish one approved branding asset through the public bucket; verify metadata lists create no grants and all allow/deny outcomes are audited safely.

### Tests for User Story 2

- [ ] T044 [P] [US2] Write access-grant contract tests for original/variant purpose, TTL, disposition, safe concealment, provider failure, and no locator leakage in `services/api/tests/test_file_storage_access_api.py`
- [ ] T045 [P] [US2] Extend the full role/branch/guardian/release authorization matrix and relationship-change tests in `services/api/tests/test_file_storage_authorization.py`
- [ ] T046 [P] [US2] Write bounded list/detail/access-event pagination tests proving zero per-row signing calls in `services/api/tests/test_file_storage_selectors.py`
- [ ] T047 [P] [US2] Write public branding publication, immutable URL, sensitive-category denial, unpublish, purge failure, and reconciliation tests in `services/api/tests/test_file_storage_publication.py`
- [ ] T048 [P] [US2] Write frontend metadata-list and fresh view/download grant tests with expiry/error recovery in `apps/institute-admin-web/src/features/files/__tests__/FileAccessFlow.test.tsx`

### Implementation for User Story 2

- [ ] T049 [US2] Implement private access-grant issuance with current authorization, variant privacy inheritance, short TTL, content disposition, and truthful issued/denied audit semantics in `services/api/modules/file_storage/services/access.py`
- [ ] T050 [US2] Implement policy-approved publication to immutable public-bucket keys and public-to-private delete/purge transition state in `services/api/modules/file_storage/services/access.py`
- [ ] T051 [US2] Implement metadata list/detail, access-grant, and paginated access-event views without implicit signing in `services/api/modules/file_storage/api/views.py`
- [ ] T052 [US2] Implement typed metadata listing and fresh access-grant calls in `apps/institute-admin-web/src/features/files/files.api.ts`
- [ ] T053 [US2] Build reusable loading, empty, unavailable, preview/download, and retry UI in `apps/institute-admin-web/src/features/files/FileList.tsx`
- [ ] T054 [US2] Integrate server-backed file lists and fresh grants into student and staff document/profile sections in `apps/institute-admin-web/src/features/people/ProfilePages.tsx`
- [ ] T055 [US2] Remove list-time signed URL generation from staff/profile serializers and consume file metadata/public contracts instead in `services/api/modules/people/api/staff.py`

**Checkpoint**: User Story 2 works independently against seeded ACTIVE assets; every access decision is current, bounded, tenant-safe, and auditable, and only approved branding reaches the public bucket.

---

## Phase 5: User Story 3 - Manage File Lifecycle and Recovery (Priority: P3)

**Goal**: Authorized administrators can safely replace, soft-delete, restore, and dispose files with retention, optimistic concurrency, durable audit evidence, and operator-visible reconciliation.

**Independent Test**: Soft-delete one active document, deny normal access, restore before the deadline, then repeat through expiry with one forced provider failure; verify no early disposal claim, eventual object/metadata cleanup, and surviving non-sensitive audit history.

### Tests for User Story 3

- [ ] T056 [P] [US3] Write soft-delete, restore, retention-expiry, optimistic-version, singleton-conflict, and audit-survival tests in `services/api/tests/test_file_storage_lifecycle.py`
- [ ] T057 [P] [US3] Write disposal, retry backoff, public purge, missing-object, orphan-staging, metadata-mismatch, and idempotent reconciliation task tests in `services/api/tests/test_file_storage_tasks.py`
- [ ] T058 [P] [US3] Write lifecycle API contract tests for `204`, `409`, `410`, error actions, event pagination, and wrong-scope concealment in `services/api/tests/test_file_storage_lifecycle_api.py`
- [ ] T059 [P] [US3] Write frontend delete/restore confirmation, retention status, stale-version conflict, retry, and focus-restoration tests in `apps/institute-admin-web/src/features/files/__tests__/FileLifecycleFlow.test.tsx`

### Implementation for User Story 3

- [ ] T060 [US3] Implement transactional soft delete, retention records, restore verification, replacement history, optimistic version checks, and immutable lifecycle audit events in `services/api/modules/file_storage/services/lifecycle.py`
- [ ] T061 [US3] Implement idempotent final disposal with separate private/public delete, exact-URL purge, metadata/tombstone state, bounded retry, and truthful failure status in `services/api/modules/file_storage/services/lifecycle.py`
- [ ] T062 [US3] Implement missing/orphan/mismatch/purge/disposal detection and safe issue resolution without raw locators in `services/api/modules/file_storage/services/reconciliation.py`
- [ ] T063 [US3] Add periodic retention disposal, staging cleanup, and bounded reconciliation schedules using existing Celery infrastructure in `services/api/config/settings/base.py` and `services/api/modules/file_storage/tasks.py`
- [ ] T064 [US3] Add a dry-run-by-default operator command with explicit bounded institute/prefix scope in `services/api/modules/file_storage/management/commands/reconcile_file_storage.py`
- [ ] T065 [US3] Implement delete, restore, retry-safe conflict handling, and access-event endpoints in `services/api/modules/file_storage/api/views.py`
- [ ] T066 [US3] Implement typed lifecycle calls and retention/reconciliation status DTOs in `apps/institute-admin-web/src/features/files/files.api.ts` and `apps/institute-admin-web/src/features/files/files.types.ts`
- [ ] T067 [US3] Add accessible delete/restore confirmations, retention deadline, conflict recovery, and operator-safe failure presentation in `apps/institute-admin-web/src/features/files/FileList.tsx`
- [ ] T068 [US3] Add legacy URL/owner/singleton inventory and dry-run migration reporting in `services/api/modules/file_storage/management/commands/audit_legacy_file_storage.py`

**Checkpoint**: User Story 3 is independently testable with pre-seeded ACTIVE files; recovery and disposal remain correct across retries, races, cache purge, and provider ambiguity.

---

## Phase 6: User Story 4 - Use Efficient Image and Document Previews (Priority: P4)

**Goal**: Profile and supported document lists use small derived previews with the same privacy as their source, while preview failure never blocks the original.

**Independent Test**: Activate one valid profile image, generate and display its thumbnail without fetching the original, force one preview failure, retry successfully, and verify private/public and institute/branch paths remain identical in scope to the source.

### Tests for User Story 4

- [ ] T069 [P] [US4] Write image verification, EXIF-orientation stripping, decompression-bomb limits, thumbnail dimensions/quality, and deterministic variant-policy tests in `services/api/tests/test_file_storage_variants.py`
- [ ] T070 [P] [US4] Write preview task idempotency, retry ceiling, source-delete race, immutable branch-scoped key, and privacy-inheritance tests in `services/api/tests/test_file_storage_tasks.py`
- [ ] T071 [P] [US4] Write preview grant, retry endpoint, fallback, and original-not-blocked contract tests in `services/api/tests/test_file_storage_preview_api.py`
- [ ] T072 [P] [US4] Write frontend thumbnail/fallback/retry tests proving list views do not fetch originals in `apps/institute-admin-web/src/features/files/__tests__/FilePreviewFlow.test.tsx`

### Implementation for User Story 4

- [ ] T073 [US4] Implement bounded Pillow image verification, metadata stripping, thumbnail/display generation, and variant integrity metadata in `services/api/modules/file_storage/services/variants.py`
- [ ] T074 [US4] Implement idempotent preview generation after transaction commit with bounded retries and source-state rechecks in `services/api/modules/file_storage/tasks.py`
- [ ] T075 [US4] Implement preview retry endpoint and variant metadata responses without direct URLs in `services/api/modules/file_storage/api/views.py`
- [ ] T076 [US4] Integrate thumbnail grants, responsive preview rendering, fallback states, and retry controls in `apps/institute-admin-web/src/features/files/FileList.tsx`
- [ ] T077 [US4] Replace full-resolution profile images in student/staff list views with approved thumbnail variants in `apps/institute-admin-web/src/features/people/StudentsPage.tsx` and `apps/institute-admin-web/src/features/people/StaffPage.tsx`

**Checkpoint**: User Story 4 works independently with pre-seeded image assets and meets privacy, failure isolation, and 60-second readiness behavior.

---

## Phase 7: Polish & Cross-Cutting Production Readiness

**Purpose**: Prove migration safety, performance, observability, security, accessibility, and full regression quality across all selected stories.

- [ ] T078 [P] Add schema annotations and validate generated endpoints against `specs/001-secure-file-storage/contracts/openapi.yaml` in `services/api/modules/file_storage/api/views.py`
- [ ] T079 [P] Add structured metrics/logging for initiation, completion, grant latency, provider failures, preview age, disposal backlog, reconciliation backlog, and deprecated-route use with redaction tests in `services/api/modules/file_storage/observability.py` and `services/api/tests/test_file_storage_observability.py`
- [ ] T080 [P] Add readiness checks for configuration and provider reachability without exposing credentials or making destructive calls in `services/api/platform_core/api/health.py`
- [ ] T081 Add clean-database and repaired-history migration validation plus rollback evidence in `services/api/tests/test_file_storage_migrations.py`
- [ ] T082 Add disposable-R2 integration tests for CORS, conditional PUT replay, checksum, copy, GET expiry, delete, public cache, and purge behind an explicit opt-in marker in `services/api/tests/integration/test_r2_file_storage.py`
- [ ] T083 Add bounded 100-row list, 10 MB direct-upload, concurrent grant, thumbnail throughput, and no-Django-body performance evidence in `services/api/tests/test_file_storage_performance.py`
- [ ] T084 [P] Add frontend responsive, keyboard, focus, live-region progress, error-recovery, and reduced-motion accessibility coverage in `apps/institute-admin-web/src/features/files/__tests__/FileAccessibility.test.tsx`
- [ ] T085 Update API/security/operations documentation, compatibility window, rollback procedure, and exact key examples after implementation in `docs/api/file-storage.md`, `docs/security/file-storage.md`, and `docs/operations/r2-file-storage.md`
- [ ] T086 Execute every focused and end-to-end scenario and record redacted evidence and remaining risks in `specs/001-secure-file-storage/quickstart-results.md`
- [ ] T087 Run full backend pytest, Ruff lint/format, Django checks, migration drift, OpenAPI validation, frontend Vitest/lint/typecheck/build, and realistic browser verification commands from `specs/001-secure-file-storage/quickstart.md`

**Checkpoint**: The complete selected scope is production-ready only when all quality gates pass and no unresolved validation-bucket reconciliation issue remains.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: Starts immediately.
- **Phase 2 — Foundation**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 — US1**: Depends on Phase 2 and is the recommended MVP.
- **Phase 4 — US2**: Depends on Phase 2 for pre-seeded assets; production integration with newly uploaded files follows US1.
- **Phase 5 — US3**: Depends on Phase 2 for pre-seeded assets; replacement flow integrates with US1 and public purge integrates with US2.
- **Phase 6 — US4**: Depends on Phase 2 for pre-seeded assets; automatic post-upload scheduling integrates with US1 and preview grants integrate with US2.
- **Phase 7 — Polish**: Depends on every story included in the release.

### User Story Dependency Graph

```text
Setup → Foundation → US1 (MVP upload)
                   ├── US2 (authorized access)
                   ├── US3 (lifecycle/recovery)
                   └── US4 (previews)

Production integration: US1 → US2 → US3/US4 → Polish
```

Each story remains independently testable after Foundation by seeding the required starting asset state. For the real product flow, implement in priority order so later stories consume the preceding public contracts.

### Within Each User Story

1. Write the story's tests and confirm the relevant assertions fail.
2. Implement domain services and state transitions.
3. Implement API endpoints and contract mapping.
4. Implement frontend transport/state/UI where applicable.
5. Run focused backend/frontend suites and the independent scenario before the checkpoint.

## Parallel Opportunities

- Phase 1 documentation, environment example, backend scaffolding, and frontend scaffolding can run in parallel after T001/T003 boundaries are respected.
- In Phase 2, model, key, policy, provider, and authorization tests are parallel; implementation tasks touching separate modules are parallel until migrations/API wiring integrate them.
- After Phase 2, US2, US3, and US4 can be developed against seeded assets by separate owners while US1 is completed; production integration still follows the dependency graph.
- Within each story, backend contract/service tests and frontend tests are parallel because they touch separate files.
- Phase 7 schema, observability, readiness, integration, performance, and accessibility work can run in parallel before final evidence collection.

## Parallel Example: User Story 1

```text
Task T027: Upload API contract and idempotency tests
Task T028: Direct-upload service and replay-safety tests
Task T029: Concurrent singleton race tests
Task T030: Legacy compatibility tests
Task T031: Frontend transport/progress tests
Task T032: Frontend upload-flow component tests
```

## Parallel Example: User Story 2

```text
Task T044: Access-grant contract tests
Task T045: Role/branch/relationship authorization tests
Task T046: Bounded selector and no-N-signing tests
Task T047: Public publication/purge tests
Task T048: Frontend access-flow tests
```

## Parallel Example: User Story 3

```text
Task T056: Lifecycle state and audit-survival tests
Task T057: Disposal/reconciliation task tests
Task T058: Lifecycle API contract tests
Task T059: Frontend delete/restore tests
```

## Parallel Example: User Story 4

```text
Task T069: Image/variant policy tests
Task T070: Preview task and key/privacy tests
Task T071: Preview API contract tests
Task T072: Frontend preview/fallback tests
```

## Implementation Strategy

### MVP First: User Story 1

1. Complete Setup and Foundation.
2. Complete US1 tests before implementation.
3. Deliver initiate → direct PUT → complete for private student/staff/institute files.
4. Preserve legacy reads/routes, but make new writes use the validated R2 institute/branch hierarchy.
5. Stop and run the US1 independent scenario plus relevant regression gates before adding access/lifecycle/previews.

### Incremental Delivery

1. **MVP**: Direct, validated, tenant/branch-scoped uploads with metadata and compatibility.
2. **P2**: Current-authorization private access and narrowly approved public branding.
3. **P3**: Replacement, retention, restore, disposal, and reconciliation.
4. **P4**: Optimized previews with privacy inheritance and failure isolation.
5. **Production gate**: Full migration, security, performance, accessibility, schema, and browser evidence.

### Deployment Order

1. Deploy additive migrations and dual-read provider support.
2. Enable R2 new writes for an internal validation institute/branch behind configuration.
3. Migrate admin upload consumers and monitor deprecated-route/error/reconciliation metrics.
4. Enable additional institutes incrementally; rollback changes write routing only and never deletes R2 or Azure objects.
5. Retire legacy writes/routes and plan bulk Azure content migration only through a separate approved feature.

## Notes

- `[P]` means different files/no dependency on unfinished tasks; tasks that share a file should be scheduled serially.
- Storage prefixes improve organization and operations but are not authorization boundaries by themselves.
- Never create buckets dynamically per institute/branch or list an entire bucket on a user request; database selectors are the bounded source of truth.
- Never log or return bucket names, keys, presigned URLs, checksums, credentials, or personal filenames outside explicitly authorized metadata responses.
- Tests precede implementation, and every checkpoint requires focused tests plus adjacent regression coverage.
