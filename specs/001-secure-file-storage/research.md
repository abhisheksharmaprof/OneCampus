# Phase 0 Research: Secure File Storage

**Date**: 2026-08-20  
**Specification**: [spec.md](spec.md)

All technical-context unknowns are resolved below. Provider claims are based on current Cloudflare R2 and AWS SDK documentation; repository decisions are based on the existing CampusOne Django, React, Celery, audit, and error-contract code.

## 1. Object Storage Provider

**Decision**: Use Cloudflare R2 through its S3-compatible API with boto3/botocore, behind a provider protocol owned by `modules.file_storage`.

**Rationale**: R2 matches the supplied requirement for egress-heavy school documents, supports the required S3 operations and presigned URLs, and lets the browser transfer bytes without exposing provider credentials. A provider protocol prevents R2 configuration and response quirks from leaking into models or API contracts. Use the documented R2 endpoint, region `auto`, SigV4, and only operations listed as supported.

**Alternatives considered**:

- Keep Azure Blob: lowest migration effort because CampusOne currently uses Azure, but conflicts with the requested R2 direction and leaves the module hard-coded to a provider.
- AWS S3: mature and compatible, but its egress profile is less suitable for this read-heavy feature.
- Proxy all bytes through Django: simple to validate, but violates the direct-transfer requirement and makes the API process a bandwidth bottleneck.
- Add a Worker upload gateway: can enforce arbitrary stateful upload policy, but adds another deployable runtime that is unnecessary once conditional create-only uploads are used.

**Sources**: [R2 S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [R2 presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)

## 2. Direct, Effectively Single-Use Uploads

**Decision**: Sign a short-lived PUT to a random private staging key and require `If-None-Match: *`, the exact `Content-Type`, and an integrity header. Keep the successfully uploaded staging object until the URL expires, copy it conditionally to a separate immutable final key after verification, and never issue a write grant for a final key.

**Rationale**: Cloudflare documents that a presigned URL is reusable until expiry, so session state alone cannot revoke it. R2 supports conditional `PutObject`; retaining the first staging object causes a replay to fail with `412 PreconditionFailed`. Copying to a distinct final key means even an unexpected staging replay cannot alter an active file. A 15-minute upload TTL accommodates school connectivity; completion is idempotent and cleanup removes staging only after expiry plus a safety buffer.

**Alternatives considered**:

- Presign the final key: fewer operations, but a replay can overwrite active content until expiry.
- Delete staging immediately after copy: saves temporary storage but re-enables successful replay before expiry.
- Rotate R2 credentials: revokes unrelated grants and is too broad for one upload.
- Stateful Worker token consumption: literal one-shot semantics but adds runtime/state complexity.

**Sources**: [R2 presigned URL behavior](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 conditional PutObject support](https://developers.cloudflare.com/r2/api/s3/api/), [R2 error codes](https://developers.cloudflare.com/r2/api/error-codes/)

## 3. Upload Size and Multipart Scope

**Decision**: Use one conditional PUT per upload in this feature. Preserve category limits of 5 MB for profile photos, 10 MB for branding assets, and 25 MB for documents. Do not build multipart upload yet.

**Rationale**: All current limits are far below the R2 single-upload limit, and the specification measures the common 10 MB path. Multipart state, part retries, abort, and cleanup add complexity without a current user requirement. The API checks declared size before signing and verifies actual size at completion. Because a bearer could still send an oversized body before rejection, storage usage alarms and staging lifecycle cleanup bound operational risk; strict ingress byte enforcement would require a gateway.

**Alternatives considered**:

- Multipart for every file: enables resume but adds 5 MiB part rules and more failure states for small school documents.
- Browser upload through Django: enforces size during ingress but violates the direct-transfer requirement.

**Sources**: [R2 upload methods](https://developers.cloudflare.com/r2/objects/upload-objects/), [R2 limits](https://developers.cloudflare.com/r2/platform/limits/)

## 4. Integrity and Content Validation

**Decision**: Persist checksum algorithm/value separately from the provider ETag. Bind `Content-MD5` for the initial single-PUT path, verify size and checksum with provider metadata, then inspect a bounded object stream before activation. Pillow verifies and measures raster images; documents must match the category signature policy. SVG uploads are excluded from the initial public-image allowlist unless a separate sanitization pipeline is added.

**Rationale**: ETag meaning differs for multipart and should be treated as opaque storage-version evidence. Declared media type and file extension are attacker-controlled. Server-side inspection of the staged content is required before ACTIVE status. Keeping the original private and activating only after verification prevents unsafe content from becoming visible.

**Alternatives considered**:

- Trust client SHA-256 or Content-Type: insufficient at a trust boundary.
- Use ETag as a universal MD5: incorrect for multipart and future provider behavior.
- Add full malware scanning now: desirable when an approved scanner exists, but the feature specification makes it optional; the state model leaves a quarantine/scanning hook.

**Sources**: [R2 checksum and operation compatibility](https://developers.cloudflare.com/r2/api/s3/api/), [AWS presigned checksum guidance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

## 5. Private and Public Delivery

**Decision**: Keep originals and all sensitive assets in a private bucket with no public custom domain. Use short-lived presigned GET grants after current CampusOne authorization. Copy only explicitly public, non-sensitive branding variants into a separate public bucket served through a production custom domain using immutable versioned keys.

**Rationale**: An R2 custom domain makes its bucket publicly reachable and cannot be used for presigned URLs. Bucket separation prevents a policy mistake from exposing sensitive documents. Immutable public URLs are cache-friendly. Public-to-private transitions delete/disable the public object and purge its exact URL; the transition remains pending until purge succeeds.

**Alternatives considered**:

- One bucket with mixed prefixes: simpler configuration but a public-domain mistake has a larger blast radius.
- Make profile photos universally public: conflicts with privacy-by-default; only policy-approved branding is public initially.
- Proxy all private reads: gives definitive byte-delivery telemetry but reintroduces application bandwidth cost.

**Sources**: [R2 custom domains and cache](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/), [R2 consistency/cache caveats](https://developers.cloudflare.com/r2/reference/consistency/), [Cloudflare cache purge API](https://developers.cloudflare.com/api/resources/cache/methods/purge/)

## 6. Authorization and Audit Semantics

**Decision**: Centralize file policy in `authorization.py`. Admin operations require the existing institute context plus seeded `files.view`, `files.upload`, or `files.delete` permissions and branch/owner scope. Shared access-grant endpoints additionally evaluate current student self, linked guardian, staff assignment, and release rules through public contracts owned by the relevant domain. Record grant issued/denied, not “download completed.”

**Rationale**: The current module checks only an admin role, does not invoke defined file permissions, and generates signed URLs while serializing list rows. Authorization must run for every grant because roles and relationships can change. A direct presigned GET does not prove that a browser consumed bytes, so audit wording must remain truthful. Denials record safe scope/outcome data without revealing object keys or sensitive filenames.

**Alternatives considered**:

- Treat list/detail access as download access: causes signing side effects and misleading audit records.
- Duplicate student/guardian/assignment state into file storage: creates stale authorization data and violates domain ownership.
- Worker-proxied reads: supports byte-delivery telemetry but is not required by the specification and adds another runtime.

## 7. Metadata and Domain Boundaries

**Decision**: Evolve the existing `modules.file_storage` models additively and split API, provider, policy, selectors, and application services inside that domain. Keep provider locators private. Add public owner/relationship query contracts to `people` and equivalent owning modules rather than importing their models from file-storage views.

**Rationale**: The current models already cover assets, upload sessions, variants, and access logs. Reusing their UUIDs and rows avoids unnecessary migration. `ARCHITECTURE.md` forbids cross-module private model access; narrow public lookups preserve boundaries and keep the modular monolith extractable.

**Alternatives considered**:

- New standalone storage service: premature distributed complexity.
- Continue importing `Student` and `StaffProfile` directly in controllers: convenient but violates the repository architecture contract.
- Replace all existing tables: high migration and rollback risk with no user value.

## 8. Lifecycle, Retention, and Reconciliation

**Decision**: Make soft deletion authoritative in PostgreSQL, default production retention to 30 days, and use Celery tasks for expired-upload cleanup, preview generation, final disposal, public-cache purge, and reconciliation. R2 lifecycle rules clean stale staging and incomplete uploads as a safety net, not as the business clock.

**Rationale**: R2 lifecycle deletion is asynchronous and cannot represent restore eligibility or a failed multi-step disposal. A retention record and reconciliation issue preserve exact state, retries, operator visibility, and a minimal audit tombstone after object deletion. Existing Celery/Redis infrastructure avoids adding a scheduler technology.

**Alternatives considered**:

- R2 lifecycle rules only: timing is not exact and cannot coordinate metadata/audit state.
- Immediate hard delete: prevents recovery and dispute handling.
- Synchronous disposal in the DELETE request: couples user latency to external failures and cannot safely reconcile ambiguity.

**Source**: [R2 object lifecycle behavior](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)

## 9. Provider Timeouts and Retries

**Decision**: Construct a shared boto3 client using explicit Botocore configuration: 5-second connect timeout, 15-second read timeout, standard retry mode with four total attempts, and a pool sized to API/worker concurrency. Retry transient provider failures only; reconcile ambiguous mutations with HEAD rather than blindly writing again.

**Rationale**: Provider defaults are not an operational contract. Standard retry mode includes exponential backoff and circuit-breaking behavior. Immutable final keys and conditional copy make reconciliation safe.

**Alternatives considered**:

- SDK defaults: may hold requests too long and change across versions.
- Retry every error: repeats semantic/auth failures and can amplify incidents.
- Reissue a write after an ambiguous result: risks overwriting or duplicating data.

**Sources**: [Boto3 retry modes](https://docs.aws.amazon.com/boto3/latest/guide/retries.html), [Botocore Config](https://docs.aws.amazon.com/botocore/latest/reference/config.html), [R2 errors](https://developers.cloudflare.com/r2/api/error-codes/)

## 10. Browser CORS and Credentials

**Decision**: Configure exact production/development app origins, PUT only for the upload bucket, the precise signed request headers, exposed ETag, and a finite preflight cache. The frontend uses a dedicated external-upload helper that does not attach CampusOne JWTs or cookies.

**Rationale**: R2 evaluates CORS independently of signature validity. Wildcard origins or headers widen bearer-token exposure. The current `adminRequest` transport always adds the CampusOne bearer and therefore must not send the external PUT.

**Alternatives considered**:

- Reuse `adminRequest` for R2: leaks an unrelated JWT to a third-party origin and applies inappropriate refresh/error logic.
- `*` CORS: inappropriate for private school workflows.

**Source**: [R2 CORS](https://developers.cloudflare.com/r2/buckets/cors/)

## 11. Encryption and Secret Handling

**Decision**: Rely on R2 automatic AES-256-GCM encryption at rest and TLS in transit. Keep narrowly scoped R2 credentials server-only in environment configuration. Do not send unsupported AWS KMS/SSE headers and do not adopt SSE-C without a future compliance/key-management requirement.

**Rationale**: R2 already encrypts objects and metadata. SSE-C requires the customer key on every operation and makes data unrecoverable if the key is lost. Existing CampusOne rules prohibit secrets in source, clients, and logs.

**Alternatives considered**:

- SSE-C by default: substantial key lifecycle and presigning complexity without a stated requirement.
- Client-side encryption: changes preview/search/user recovery behavior and is outside current scope.

**Sources**: [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/), [R2 SSE-C](https://developers.cloudflare.com/r2/examples/ssec/)

## 12. Compatibility and Migration

**Decision**: Add nullable/defaulted fields and new tables; do not rewrite migrations `0001`–`0004`. Keep existing Azure locators readable through a legacy adapter and retain existing multipart routes for one release. New writes use R2. Inventory `Institute.logo_url`, institute document filenames, leave supporting-document URLs, dangling generic owners, and singleton duplicates before adding constraints or retiring Azure configuration.

**Rationale**: Existing repair migrations show that some cloud databases may have migration state that differs from physical schema. A dual-read/new-write transition permits rollback and avoids silently losing legacy files. Bulk content migration is explicitly outside this feature.

**Alternatives considered**:

- Big-bang provider migration: high rollback and data-loss risk.
- Rewrite initial migrations: unsafe for deployed databases.
- Keep legacy routes indefinitely: prolongs proxied-upload cost and duplicates behavior.
