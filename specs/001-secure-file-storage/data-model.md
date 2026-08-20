# Data Model: Secure File Storage

**Date**: 2026-08-20  
**Specification**: [spec.md](spec.md)  
**API contract**: [contracts/openapi.yaml](contracts/openapi.yaml)

File bytes never appear in these entities. Bucket/key fields are confidential infrastructure locators and are never serialized in public API responses or logs.

## Entity Relationships

```text
Institute 1 ── * FileAsset 1 ── 0..1 FileUploadSession
                       │  ├── * FileVariant
                       │  ├── * FileAccessEvent
                       │  └── 0..1 FileRetentionRecord
                       └── 0..* StorageReconciliationIssue

FileAsset ── logical association ── Student | Staff | Institute | Class | Subject | Term
```

Cross-domain ownership and relationship checks are performed through public query contracts owned by the associated domain. The generic association remains for compatibility, but the file-storage service validates owner type, owner ID, institute, and branch before every mutation or access grant.

## FileAsset

Represents one immutable uploaded source and its lifecycle metadata.

### Fields

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID | yes | Stable public file identifier; generated before upload. |
| `institute_id` | FK | yes | Tenant boundary; immutable. |
| `branch_id` | FK/null | no | Required when the associated owner is branch-scoped; must belong to `institute_id`. |
| `owner_type` | enum | yes | `STUDENT`, `STAFF`, `INSTITUTE`, `CLASS`, `SUBJECT`, or `TERM`; legacy `TEACHER` maps to `STAFF`. |
| `owner_id` | UUID | yes | Must resolve through the owner domain and match tenant/branch scope. |
| `category` | enum | yes | `PROFILE_PHOTO`, `LOGO`, `LETTERHEAD`, `BANNER`, `GALLERY_IMAGE`, `ID_DOCUMENT`, `CERTIFICATE`, `MARKSHEET`, `ACADEMIC_NOTE`, `OTHER_DOCUMENT`. |
| `original_file_name` | string(255) | yes | Unicode display name after removal of path/control characters; never used as an object key. |
| `extension` | string(12) | yes | Lowercase and compatible with category/media policy. |
| `declared_media_type` | string(127) | yes | Value signed for upload; not trusted as detected content. |
| `detected_media_type` | string(127)/null | no | Set by server verification before ACTIVE. |
| `size_bytes` | positive bigint | yes | Greater than zero and within category limit. |
| `checksum_algorithm` | enum | yes | Initial value `MD5`; extensible to `SHA256`/provider-supported algorithms. |
| `checksum_value` | string | yes | Canonical encoded checksum verified before activation. |
| `storage_provider` | enum | yes | New writes use `R2`; legacy rows remain `AZURE`. |
| `storage_bucket` | string | yes | Private/public provider container; confidential. |
| `storage_key` | string(1024) | yes | Opaque immutable final key; unique with provider and bucket. |
| `storage_etag` | string(255) | no | Opaque provider version evidence, not a universal checksum. |
| `storage_version_id` | string(255) | no | Retained for legacy providers; blank for R2. |
| `visibility` | enum | yes | `PRIVATE` default or `PUBLIC`; legacy `AUTHENTICATED` is migrated to `PRIVATE`. |
| `public_id` | UUID/null | no | Random stable identifier for approved public assets; never the object key. |
| `public_url` | string/null | no | Exact immutable custom-domain URL used for cache purge; only for PUBLIC. |
| `privacy_transition_state` | enum | yes | `STABLE`, `PUBLISH_PENDING`, `PRIVATE_PENDING`, `PURGE_FAILED`. |
| `status` | enum | yes | Lifecycle state below. |
| `uploaded_by_id` | FK/null | no | `SET_NULL` to preserve metadata after account removal. |
| `replaces_file_id` | self FK/null | no | Prior singleton/source replaced by this asset. |
| `version` | positive integer | yes | Starts at 1; incremented for optimistic lifecycle changes/`If-Match`. |
| `created_at`, `updated_at` | timestamps | yes | Existing time-stamped behavior. |

### Lifecycle States

```text
PENDING_UPLOAD ──initiate──> AWAITING_UPLOAD
AWAITING_UPLOAD ──complete──> VERIFYING
VERIFYING ──valid/copy──> ACTIVE
VERIFYING ──unsafe──> QUARANTINED
VERIFYING ──invalid/provider failure──> FAILED
AWAITING_UPLOAD ──expiry──> EXPIRED
ACTIVE ──delete/replace──> SOFT_DELETED
SOFT_DELETED ──restore before deadline──> ACTIVE
SOFT_DELETED ──deadline──> DISPOSAL_PENDING
DISPOSAL_PENDING ──all deletion/purge succeeds──> DISPOSED
DISPOSAL_PENDING ──external ambiguity/failure──> DISPOSAL_FAILED
DISPOSAL_FAILED ──reconcile succeeds──> DISPOSED
```

`ACTIVE` is reachable only after final-key verification. `SOFT_DELETED` and later states cannot receive normal access grants. The old singleton remains ACTIVE until the replacement reaches ACTIVE, after which the old row transitions to SOFT_DELETED within the same database transaction.

### Constraints and Indexes

- Unique `(storage_provider, storage_bucket, storage_key)`.
- Unique `public_id` when non-null.
- Check: PUBLIC requires a policy-approved category; sensitive document categories remain PRIVATE.
- Check: PUBLIC requires `public_id`; stable PUBLIC eventually requires `public_url`.
- Check: `size_bytes > 0`, `version >= 1`, checksum fields are both present.
- Conditional uniqueness for one ACTIVE singleton category per `(institute_id, owner_type, owner_id, category)` for profile photo, logo, and letterhead; add only after duplicate audit/backfill.
- Index `(institute_id, branch_id, status, created_at, id)` for bounded lists.
- Index `(institute_id, owner_type, owner_id, category, status)` for owner views.
- Index `(status, updated_at)` for processing/reconciliation sweeps.

## FileUploadSession

Represents one idempotent authorization to create a staging object.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID | yes | Public upload identifier. |
| `file_asset_id` | one-to-one FK | yes | Pending asset; same institute. |
| `institute_id`, `branch_id` | FK/null | yes/no | Copied authorization scope for bounded queries. |
| `uploaded_by_id` | FK | yes | Actor that initiated the upload. |
| `idempotency_key` | string(128) | yes | Unique per institute/uploader for the retention window. |
| `request_fingerprint` | SHA-256 string | yes | Canonical request fingerprint; mismatch with reused key is a conflict. |
| `staging_bucket`, `staging_key` | string | yes | Confidential random private locator. |
| `expected_size_bytes` | positive bigint | yes | Must match HEAD result. |
| `expected_media_type` | string | yes | Bound in signed request and verified. |
| `checksum_algorithm`, `expected_checksum` | enum/string | yes | Bound in signed request and verified. |
| `required_headers` | JSON object | yes | Allowlisted signed headers returned to the client; no credentials beyond grant headers. |
| `status` | enum | yes | `CREATED`, `UPLOADED`, `VERIFYING`, `COMPLETED`, `FAILED`, `EXPIRED`. |
| `expires_at` | timestamp | yes | Upload authorization expiry. |
| `completed_at` | timestamp/null | no | Set exactly once; repeat completion returns the same asset. |
| `failure_code` | string/null | no | Stable safe failure code; no provider secrets. |
| `staging_delete_after` | timestamp | yes | Later than grant expiry so conditional replay remains blocked. |
| `created_at`, `updated_at` | timestamps | yes | Audit and cleanup. |

### Constraints and Indexes

- Unique `(institute_id, uploaded_by_id, idempotency_key)`.
- One-to-one upload session per source asset.
- Check: `staging_delete_after > expires_at` and `expected_size_bytes > 0`.
- Index `(status, expires_at)` for expiry and `(status, staging_delete_after)` for cleanup.

## FileVariant

Represents a derived thumbnail/display object; it never weakens source privacy.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID | yes | Variant identifier used in access grants. |
| `file_asset_id` | FK | yes | Source asset. |
| `variant_type` | enum | yes | `THUMBNAIL` or `DISPLAY`. |
| `status` | enum | yes | `PENDING`, `PROCESSING`, `READY`, `FAILED`. |
| `storage_provider`, `storage_bucket`, `storage_key` | strings | when READY | Confidential immutable locator. |
| `media_type`, `size_bytes`, `width`, `height` | typed metadata | when READY | Bounded dimensions/size defined by variant policy. |
| `checksum_algorithm`, `checksum_value`, `storage_etag` | strings | when READY | Integrity/version evidence. |
| `attempt_count` | non-negative integer | yes | Bounded retry tracking. |
| `last_error_code`, `last_error_at` | string/timestamp/null | no | Safe diagnostic state; no raw provider response. |
| `created_at`, `updated_at` | timestamps | yes | Processing history. |

Unique `(file_asset_id, variant_type)`. If the source is PRIVATE, every variant is stored privately. Public variants use immutable keys only after source publication succeeds.

## FileAccessEvent

Immutable security event for file operations and access decisions.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID/bigint | yes | Event identity. |
| `institute_id`, `branch_id` | FK/null | yes/no | Tenant scope retained after asset disposal. |
| `file_asset_id` | nullable FK | no | `SET_NULL`, not CASCADE. |
| `file_asset_snapshot_id` | UUID | yes | Preserves the non-secret file identity after disposal. |
| `actor_id` | nullable FK | no | `SET_NULL` for removed users; system jobs may be null. |
| `action` | enum | yes | `UPLOAD_INITIATED`, `UPLOAD_COMPLETED`, `ACCESS_GRANT`, `ACCESS_DENIED`, `DELETE`, `RESTORE`, `PUBLISH`, `UNPUBLISH`, `DISPOSE`, `RECONCILE`, `PREVIEW`. |
| `purpose` | enum/null | no | `VIEW`, `DOWNLOAD`, `PREVIEW`, or operation-specific null. |
| `outcome` | enum | yes | `ALLOWED`, `DENIED`, `SUCCEEDED`, `FAILED`, `PENDING`. |
| `reason_code` | string/null | no | Stable non-sensitive result code. |
| `trace_id` | string/null | no | Correlates with the API/error contract. |
| `ip_address`, `user_agent` | safe request context | no | Subject to audit retention/privacy policy. |
| `metadata` | JSON object | yes | Allowlisted fields only; never URL, bucket, key, credentials, checksum, or personal document name. |
| `created_at` | timestamp | yes | Immutable event time. |

Indexes: `(institute_id, created_at, id)`, `(file_asset_snapshot_id, created_at)`, and `(institute_id, action, outcome, created_at)`.

## FileRetentionRecord

One-to-one lifecycle record that makes deletion, restoration, and disposal recoverable and auditable.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `file_asset_id` | one-to-one FK | yes | Asset under retention. |
| `deleted_at`, `retention_until` | timestamps | yes | `retention_until > deleted_at`; production default 30 days. |
| `deleted_by_id` | nullable FK | no | Actor or null for system replacement. |
| `delete_reason` | enum/string | yes | `USER_REQUEST`, `REPLACED`, `POLICY`, or approved safe reason. |
| `restored_at`, `restored_by_id` | nullable | no | Set when restored before deadline. |
| `disposal_started_at`, `disposed_at` | nullable | no | External lifecycle progress. |
| `public_purge_state`, `private_delete_state`, `public_delete_state`, `metadata_state` | enums | yes | Each `NOT_REQUIRED`, `PENDING`, `SUCCEEDED`, or `FAILED`. |
| `attempt_count`, `next_attempt_at`, `last_error_code` | retry state | no | Bounded exponential retry and operator visibility. |

Restoration is permitted only while the asset content remains verifiably present and the deadline has not passed. Disposal is complete only after every required external step succeeds.

## StorageReconciliationIssue

Represents a discovered mismatch without exposing file contents.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | UUID | yes | Issue identifier. |
| `institute_id` | FK/null | no | Null only for unassigned orphan objects. |
| `file_asset_id` | nullable FK | no | Associated asset when known. |
| `issue_type` | enum | yes | `MISSING_OBJECT`, `ORPHAN_OBJECT`, `METADATA_MISMATCH`, `FAILED_STAGING_CLEANUP`, `FAILED_DISPOSAL`, `FAILED_PUBLIC_PURGE`. |
| `status` | enum | yes | `OPEN`, `RETRYING`, `RESOLVED`, `IGNORED`. |
| `first_seen_at`, `last_seen_at` | timestamps | yes | Detection window. |
| `attempt_count`, `next_attempt_at` | retry state | yes/no | Bounded retry scheduling. |
| `safe_details` | JSON object | yes | Non-sensitive diagnostic facts only. |
| `resolved_at`, `resolution_code` | nullable | no | Resolution outcome. |

Unique open issue per `(issue_type, file_asset_id)` where an asset is known. Orphan scans use a keyed hash of the locator in diagnostics rather than the raw key.

## Migration Sequence

1. Add new enums/nullable fields, retention/reconciliation tables, and non-destructive indexes. Preserve migrations `0001`–`0004` unchanged.
2. Mark existing rows `storage_provider=AZURE`; map `AUTHENTICATED` visibility to PRIVATE behavior; normalize legacy status values without moving bytes.
3. Inventory and report dangling owners, cross-tenant associations, singleton duplicates, legacy URL fields, and rows whose physical tables were created by repair migrations.
4. Backfill branch scope where the owner domain can resolve it; leave institute-wide rows null.
5. Deploy dual-read/new-write behavior: R2 for new assets, legacy Azure adapter for old locators, old routes as adapters.
6. After clean and repaired-history validation, add conditional uniqueness/check constraints that audited data satisfies.
7. Migrate UI consumers to the new contracts; record deprecation usage. Azure content migration and route removal require a separate approved feature.

Rollback keeps the additive schema and re-enables the old route/provider for legacy writes; it never rewrites or deletes existing object locators.
