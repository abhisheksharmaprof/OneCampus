# Implementation Plan: Secure File Storage

**Branch**: `001-secure-file-storage` | **Date**: 2026-08-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-secure-file-storage/spec.md`

## Summary

Replace the current Azure-specific, API-proxied upload path with a provider-isolated Cloudflare R2 workflow in which CampusOne authorizes and records transfers while browsers send file bytes directly to object storage. Keep PostgreSQL limited to metadata and lifecycle records; use conditional, short-lived staging uploads, server-verified activation into immutable final keys, freshly authorized private reads, a separate public bucket for explicitly public branding assets, and Celery jobs for previews, retention disposal, and reconciliation. Preserve the existing admin routes as temporary compatibility adapters while the institute-admin web app moves to the new initiate → direct PUT → complete contract.

## Technical Context

**Language/Version**: Python 3.11–3.13 for the API and workers; TypeScript 6.0 with React 19.2 for the institute-admin web client

**Primary Dependencies**: Django 5.2, Django REST Framework 3.16, boto3/botocore for the R2 S3-compatible boundary, Celery 5.5 with Redis, Pillow for bounded image verification and thumbnails, React/Vite, and the existing CampusOne JWT/error/audit infrastructure

**Storage**: PostgreSQL for metadata, idempotency, lifecycle, and audit state; Cloudflare R2 private and public buckets for file bytes and variants; Redis only as the existing Celery broker/result backend

**Testing**: pytest/pytest-django with DRF API clients and provider fakes/botocore stubs; disposable R2 integration bucket tests; Vitest and React Testing Library; Ruff, Django checks, migration drift checks, OpenAPI validation, TypeScript checking, lint, and production builds

**Target Platform**: Linux-hosted Django/Celery service and modern evergreen browsers used by the institute-admin web application; future parent and staff clients consume the same access-grant contract

**Project Type**: Modular-monolith web application with a Django REST API, asynchronous workers, and React web clients

**Performance Goals**: 95% of authorized upload initiations complete within 2 seconds; 95% of file access grants begin delivery within 3 seconds; 10 MB uploads bypass the Django process; list endpoints perform no per-row signing and remain bounded to 100 rows; 99% of valid profile thumbnails are ready within 60 seconds

**Constraints**: File bodies must never enter relational columns; tenant/branch/role/relationship checks are server-side; sensitive files are private; presigned grants are bearer credentials with explicit short TTLs; upload URLs are create-only; category caps remain 5 MB for profile photos, 10 MB for branding, and 25 MB for documents; all provider calls have bounded timeout/retry behavior; existing Azure metadata/routes need a non-breaking transition; R2 has no ACL, KMS, object-lock, or versioning assumptions

**Scale/Scope**: At least 50 GB and routine activity for one 2,000-student/200-staff institute, with tenant-keyed growth to hundreds of institutes; single-part uploads only in this feature because all configured categories remain below 25 MB

## Constitution Check

*GATE: Passed before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Gate | Evidence in this plan |
|---|---|---|
| I. Production-Ready by Default | PASS | The design includes validation, authorization, stable errors, idempotency, retries, audit, soft deletion, reconciliation, safe migration, UI recovery states, and rollback-compatible legacy adapters. |
| II. Automated Verification Is Mandatory | PASS | Focused unit, API, provider-contract, authorization-matrix, lifecycle, task, UI, schema, migration, and end-to-end checks are defined in `quickstart.md`. |
| III. Scope Isolation and Regression Safety | PASS | Changes remain inside the file-storage domain, its public ownership contracts, configuration, and explicit upload consumers; legacy routes and stored Azure locators remain readable during transition. |
| IV. Secure, Scalable, and Maintainable Architecture | PASS | Provider details sit behind a typed adapter; every operation is tenant-scoped and bounded; direct transfers remove application bandwidth pressure; private/public buckets are isolated; no binary database storage is introduced. |
| V. Usable, Accessible, and Observable Experiences | PASS | The contract defines stable error codes and trace IDs; UI work includes progress, cancel, retry, focus/error handling, and server-backed states; file events and reconciliation issues are queryable without logging secrets or PII. |

No constitution violation requires an exception.

## Project Structure

### Documentation (this feature)

```text
specs/001-secure-file-storage/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md                 # Generated later by $speckit-tasks
```

### Source Code (repository root)

```text
services/api/
├── config/
│   └── settings/
│       ├── base.py                         # R2, TTL, retry, retention configuration
│       └── test.py
├── modules/
│   ├── file_storage/
│   │   ├── api/
│   │   │   ├── serializers.py             # Request/response contract mapping
│   │   │   ├── urls.py
│   │   │   └── views.py                   # Initiate, complete, list, grant, lifecycle
│   │   ├── storage/
│   │   │   ├── base.py                    # Provider protocol and typed results
│   │   │   ├── r2.py                      # boto3/R2 implementation
│   │   │   └── legacy_azure.py            # Transitional reads for existing locators
│   │   ├── authorization.py               # Tenant/branch/RBAC/relationship policy
│   │   ├── models.py                      # Metadata and lifecycle state only
│   │   ├── policies.py                    # Category, visibility, size policy
│   │   ├── selectors.py                   # Bounded tenant-scoped reads
│   │   ├── services/
│   │   │   ├── uploads.py                 # Idempotent initiate/verify/activate
│   │   │   ├── access.py                  # Private/public access grants
│   │   │   ├── lifecycle.py               # Replace/delete/restore/dispose
│   │   │   └── reconciliation.py
│   │   ├── tasks.py                       # Preview, cleanup, disposal, reconciliation
│   │   └── migrations/
│   └── people/
│       └── contracts.py                   # Public owner/guardian scope lookups
└── tests/
    ├── test_file_storage_models.py
    ├── test_file_storage_policies.py
    ├── test_file_storage_provider.py
    ├── test_file_storage_api.py
    ├── test_file_storage_authorization.py
    ├── test_file_storage_lifecycle.py
    ├── test_file_storage_tasks.py
    └── test_file_storage_legacy_compat.py

apps/institute-admin-web/src/
├── components/admin-ui/
│   └── FileUploadField.tsx                # Progress/cancel/retry presentation
└── features/files/
    ├── files.api.ts                       # CampusOne calls + external PUT helper
    ├── files.types.ts
    ├── useFileUpload.ts
    ├── FileList.tsx
    └── __tests__/
        ├── files.api.test.ts
        └── FileUploadFlow.test.tsx
```

**Structure Decision**: Keep file storage as one backend domain inside the existing modular monolith. Split provider, authorization, policy, use-case, and API responsibilities within that module rather than adding a new service. Add a feature-local frontend client so external R2 PUTs cannot accidentally inherit CampusOne authorization headers. Expose owner and guardian checks through a small public contract owned by `modules.people` instead of importing its private models from file-storage controllers.

## Phase 0 Research Decisions

The resolved decisions and official-source rationale are recorded in [research.md](research.md). All technical unknowns are resolved. The critical upload-replay constraint is resolved by signing `If-None-Match: *`, retaining the successful staging object until its grant expires, and copying to a distinct immutable final key; a replay receives a precondition failure and can never alter an active file.

## Phase 1 Design

### Data and State

[data-model.md](data-model.md) defines additive changes to `FileAsset`, `FileUploadSession`, `FileVariant`, and `FileAccessLog`, plus retention and reconciliation records. Existing IDs and Azure locators remain valid. New fields are nullable/defaulted first, data is audited and backfilled, and constraints are added only after compatibility checks against both clean and repaired migration histories.

### Public Interfaces

[contracts/openapi.yaml](contracts/openapi.yaml) defines:

- idempotent upload initiation;
- browser PUT to a returned external URL with exact signed headers;
- verified, replay-safe completion;
- bounded metadata lists without implicit access URLs;
- current-authorization access grants for all authenticated CampusOne products;
- soft delete, restore, preview retry, and access-event queries;
- the standard CampusOne success/error envelope and stable file-specific error codes.

Existing `/api/v1/admin/students/...`, `/staff/...`, `/teachers/...`, and `/institute/...` multipart routes remain temporary compatibility adapters for one release. They call the same application services and retain their current response shape while emitting deprecation telemetry. New UI work uses the versioned contracts directly.

### Operational Flow

1. CampusOne validates actor, tenant/branch, owner, category, filename, declared media, size, visibility, replacement target, and idempotency key.
2. The API creates a pending asset/upload session and returns a short-lived conditional PUT for an opaque private staging key. The signed request binds content type, integrity header, and `If-None-Match: *`.
3. The browser PUTs bytes directly to R2 without a CampusOne bearer token, then calls completion.
4. Completion locks the upload session, HEADs the staging object, verifies size and storage checksum, performs bounded signature/image verification, and copies it conditionally to an immutable final key. The staging object stays until the grant expires so upload replay fails; cleanup removes it afterward.
5. The asset becomes active atomically. Singleton replacement soft-deletes the previous active file only after the new final object is verified. Preview work is queued after commit.
6. Every private view/download requests a fresh short-lived grant after current authorization. Lists return metadata only. Audit semantics record grant issuance or denial—not an unverifiable claim that a browser consumed every byte.
7. Delete hides the asset immediately and creates a retention record. Restore is allowed before the deadline. Disposal and public-cache purge run as retryable jobs and retain a reconciliation issue until all external and metadata actions agree.

### Post-Design Constitution Re-check

| Principle | Result | Post-design evidence |
|---|---|---|
| Production readiness | PASS | Failure states, provider ambiguity, cache purge, retention, rollback, accessibility, and operator recovery have explicit models and validation scenarios. |
| Automated verification | PASS | Contracts and data transitions map to focused automated suites plus a disposable-provider end-to-end path. |
| Scope isolation | PASS | The file-storage module owns orchestration and persistence; other domains expose only narrow owner/relationship contracts; existing consumers migrate behind adapters. |
| Secure/scalable architecture | PASS | No file body reaches Django/PostgreSQL; write grants are conditional and bounded; active keys are immutable; tenant authorization is repeated for each grant; lists are paginated. |
| Usability/observability | PASS | UI progress/retry states and standard error envelopes are specified; file access/lifecycle events and reconciliation issues retain traceable outcomes without credentials or raw PII. |

No post-design gate failure or unjustified complexity remains.

## Complexity Tracking

No constitution violation is being justified. The R2 provider adapter and Celery tasks use existing module and worker boundaries; the separate public bucket is required to prevent sensitive objects from inheriting public delivery behavior.
