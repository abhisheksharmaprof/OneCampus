# Quickstart Validation: Secure File Storage

This guide validates the completed feature end to end. It does not contain implementation bodies or migrations; use [plan.md](plan.md), [data-model.md](data-model.md), and [contracts/openapi.yaml](contracts/openapi.yaml) as the design sources.

## Prerequisites

- Python 3.11–3.13 and `uv`
- Node.js compatible with the repository lockfile and `npm`
- PostgreSQL and Redis for production-like validation
- A disposable Cloudflare R2 private bucket and separate disposable public bucket/custom domain
- R2 credentials limited to the disposable validation buckets
- Exact R2 CORS origins/headers configured for the local institute-admin origin
- No production credentials, student data, or personal documents in the test environment

Configure the API through ignored environment values using the names established by implementation, including the R2 account endpoint, access key, secret, private/public bucket names, public base URL, upload/download TTLs, retention duration, and cache-purge token. Never place real values in `.env.example`, fixtures, screenshots, logs, or this guide.

## Install and Check the Repository

From `services/api`:

```bash
uv sync
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run python manage.py migrate --plan
```

From the repository root:

```bash
npm install
npm run test:admin
npm run build:admin
```

Expected outcome: dependency installation succeeds, Django reports no system issues or unexpected migration drift, and the existing admin tests/build remain green before feature-specific validation.

## Focused Automated Validation

From `services/api`:

```bash
uv run pytest tests/test_file_storage_models.py tests/test_file_storage_policies.py -v
uv run pytest tests/test_file_storage_provider.py tests/test_file_storage_api.py -v
uv run pytest tests/test_file_storage_authorization.py -v
uv run pytest tests/test_file_storage_lifecycle.py tests/test_file_storage_tasks.py -v
uv run pytest tests/test_file_storage_legacy_compat.py -v
uv run ruff check .
uv run ruff format --check .
uv run python manage.py spectacular --file /tmp/campusone-file-storage-schema.yml --validate
```

From the repository root:

```bash
npm run test --workspace @campusone/institute-admin-web -- --run src/features/files
npm run lint --workspace @campusone/institute-admin-web
npm run typecheck --workspace @campusone/institute-admin-web
npm run build:admin
```

Expected outcome:

- category, media, filename, size, checksum, visibility, and tenant policies pass;
- the provider adapter is tested without live credentials;
- the authorization matrix covers institute/branch admins, student self, linked/unlinked parents, assigned/unassigned staff, changed relationships, released/unreleased records, and wrong-tenant concealment;
- idempotency, races, expiry, retention, restore, preview failure, disposal, purge, and reconciliation transitions pass;
- the external PUT helper sends no CampusOne bearer/cookies and handles progress, cancellation, expiry, retry, and accessible errors;
- the generated API schema includes and validates the file-storage contract.

## Run the Local Applications

Use separate terminals.

From `services/api`:

```bash
uv run python manage.py migrate
uv run python manage.py runserver 127.0.0.1:8000
```

From `services/api` with Redis available:

```bash
uv run celery -A config worker -l INFO
```

From the repository root:

```bash
npm run dev:admin
```

Expected outcome: health/readiness pass, the admin web app authenticates normally, the worker starts without printing credentials, and no storage grant URLs appear in application logs.

## End-to-End Scenario 1: Direct Private Upload

1. Sign in as an institute administrator and open a test student's document section.
2. Select a valid PDF smaller than 10 MB.
3. Observe upload progress, cancel/retry controls, and completion confirmation.
4. Reload the page and confirm the document comes from server metadata rather than local placeholder state.
5. Inspect API/network boundaries in developer tools.

Expected outcome:

- CampusOne receives JSON initiation and completion requests, not the file body;
- the browser PUT targets the opaque R2 grant and includes only the exact signed headers—never the CampusOne bearer token;
- the metadata row remains non-active until verification succeeds;
- the final key is different from the staging key and cannot be overwritten by replaying the original PUT;
- the database contains metadata/checksum/lifecycle fields but no binary body;
- refreshing the UI retains the active document.

## End-to-End Scenario 2: Validation and Replay Safety

Exercise each case with disposable content:

- invalid extension or control/path characters in a name;
- mismatched extension, media type, and signature;
- zero-byte and over-category-limit file;
- expired authorization;
- completion before PUT, repeated initiation with the same/different idempotency input, and repeated completion;
- replay of the exact successful conditional PUT before expiry.

Expected outcome:

- invalid requests return the documented stable error envelope and corrective action;
- no invalid file becomes ACTIVE;
- equivalent retries return the same logical upload/file;
- a reused idempotency key with different input returns `IDEMPOTENCY_CONFLICT`;
- replay receives a precondition failure and cannot change the active final object;
- no response or log exposes bucket, key, provider error, credential, or private storage URL.

## End-to-End Scenario 3: Authorization and Audit

For one released private marksheet, test access as:

- institute admin;
- same-branch and other-branch admin;
- the student;
- a linked parent and an unrelated parent;
- assigned and unassigned staff;
- a user from another institute;
- a formerly linked parent after the relationship is removed.

Expected outcome: only currently authorized identities receive short-lived grants. Wrong-tenant/out-of-scope requests do not disclose existence or metadata. Every allow/deny decision records actor/system, institute, file ID, action, outcome, safe reason, time, and trace ID. Audit wording says a grant was issued or denied, not that every byte was consumed.

## End-to-End Scenario 4: Replacement, Preview, Delete, and Restore

1. Upload a profile photo and wait for its compact preview.
2. Upload a replacement concurrently from two sessions.
3. Soft-delete the winning active photo, confirm normal access is denied, then restore it before retention expires.
4. Force preview processing to fail once and use retry.

Expected outcome:

- only one verified singleton is ACTIVE and the previous file enters retention only after replacement activation;
- list views request the preview rather than the original;
- preview failure leaves the original accessible and exposes a safe retry state;
- deletion immediately blocks new grants without deleting bytes;
- restore preserves ownership/privacy and is audited;
- optimistic version conflict returns a recoverable `409` instead of silently overwriting state.

## End-to-End Scenario 5: Public-to-Private Transition

Use a non-sensitive test branding asset only.

1. Publish the approved asset and confirm its immutable custom-domain URL is cacheable.
2. Reclassify it as private.
3. Simulate one cache-purge failure, then allow the reconciliation retry to succeed.

Expected outcome: sensitive categories can never be published. During transition the asset is not reported as stably private while a public cached copy may remain. The exact public object is removed, its URL is purged, the issue remains operator-visible until confirmation, and subsequent access requires authorization.

## End-to-End Scenario 6: Retention Disposal and Reconciliation

Use the short test retention period.

1. Soft-delete a private document and let retention expire.
2. Run the disposal task with one forced provider timeout.
3. Run reconciliation again after provider recovery.
4. Create disposable missing-object, orphan-staging, and metadata-mismatch cases.

Expected outcome: a timeout produces `DISPOSAL_FAILED` and an open reconciliation issue; the system never claims disposal early. Retry removes required objects and active metadata state while preserving the minimal non-sensitive audit tombstone. Reconciliation detects each mismatch without reading/logging private bodies or raw locators.

## Provider Integration and Performance Evidence

Against disposable buckets only, validate:

- conditional PUT/CORS behavior and exact signed headers;
- HEAD/checksum/copy/delete operations supported by the pinned boto3/botocore versions;
- private grants expire at the configured short TTL;
- public custom-domain caching and exact-URL purge;
- bounded timeout/retry behavior for `403`, `404`, `412`, `429`, and transient `5xx` responses;
- 95th-percentile initiation and access-grant targets;
- 10 MB direct upload with no matching large request body or memory spike in Django;
- a 100-row metadata page creates zero R2 access grants/provider signing calls;
- 99% profile-preview readiness target under representative worker load.

Record timings, provider request IDs, and trace IDs in the test report, but redact grants, keys, checksums, credentials, filenames, and personal data.

## Full Regression Gates

From `services/api`:

```bash
uv run pytest -q
uv run python manage.py check
uv run python manage.py makemigrations --check --dry-run
uv run ruff check .
uv run ruff format --check .
```

From the repository root:

```bash
npm run test:admin
npm run lint --workspace @campusone/institute-admin-web
npm run typecheck --workspace @campusone/institute-admin-web
npm run build:admin
```

The feature is ready only when all focused and regression gates pass, browser verification covers primary and important failure paths, schema validation succeeds, and no unresolved reconciliation issue exists for the validation assets.
