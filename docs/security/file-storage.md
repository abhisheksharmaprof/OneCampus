# Secure file storage

CampusOne stores file bytes in Cloudflare R2 and stores only metadata, policy state, and opaque provider locators in PostgreSQL. Application responses and normal logs never expose bucket names, object keys, checksums, credentials, or provider error bodies.

## Bucket boundary

Each deployment environment has exactly two buckets:

- A private bucket for staging uploads, immutable originals, and private variants.
- A public bucket only for explicitly approved, immutable branding assets.

Creating a bucket per institute or branch is deliberately avoided. R2 is a flat object namespace; authorization comes from PostgreSQL tenant/branch relationships and is re-evaluated before every grant.

## Versioned object-key grammar

```text
v1/staging/institutes/<instituteId>/branches/<branchId|_institute>/uploads/<uploadId>/source
v1/objects/institutes/<instituteId>/branches/<branchId|_institute>/owners/<ownerType>/<ownerId>/<category>/<assetId>/original.<ext>
v1/variants/institutes/<instituteId>/branches/<branchId|_institute>/owners/<ownerType>/<ownerId>/<category>/<assetId>/<variantType>/<variantId>.<ext>
v1/public/institutes/<instituteId>/branches/<branchId|_institute>/branding/<category>/<publicId>/<revisionId>.<ext>
```

`_institute` is the only institute-wide branch segment. Every other identifier is a canonical UUID and every category/type is a validated enum. Human names, email addresses, original filenames, roll numbers, and user-provided path fragments are prohibited in keys.

Staging grants are short-lived conditional PUT requests. Completion verifies object metadata and content before copying to a new immutable final key. Replacements create a new asset; final keys are never overwritten.

## Browser and credential controls

Bucket CORS must contain exact application origins, the minimum methods (`PUT`, `GET`, `HEAD`), the exact signed request headers, and only `ETag` as an exposed response header. Wildcard origins are prohibited for private workflows.

R2 S3 credentials are server-only and scoped to the two environment buckets. The Cloudflare account API token used by Wrangler and cache purge is separate, least-privilege, rotated, and never returned to the browser. Public custom domains are attached only to the public bucket.

R2 lifecycle cleanup is defense in depth for `v1/staging/`. Django retention state remains authoritative for soft delete, restore, disposal, and reconciliation because provider lifecycle execution is asynchronous.
