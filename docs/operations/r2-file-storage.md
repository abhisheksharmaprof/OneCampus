# R2 file-storage operations

## Provisioning checklist

1. Create one private and one public bucket for the target environment. Use lowercase names with an environment suffix; never create per-institute buckets.
2. Keep the private bucket private. Do not enable its `r2.dev` URL or attach a custom domain.
3. Attach the production branding custom domain only to the public bucket. Set `R2_PUBLIC_BASE_URL` and `CLOUDFLARE_ZONE_ID` after DNS is active.
4. Replace the development origins in `infra/cloudflare/r2-private-cors.dev.json` with exact production origins before applying it. Never use `*` for a private upload/download flow.
5. Apply `infra/cloudflare/r2-private-lifecycle.json` only to the private bucket. Confirm the rule targets `v1/staging/` and aborts incomplete multipart uploads after one day.
6. Create an R2 S3 token limited to object read/write on the two buckets. Put its Access Key ID and Secret Access Key only in the API secret store.
7. Create a separate Cloudflare API token limited to R2 bucket administration for provisioning. Add Zone Cache Purge only when public branding is enabled.
8. Configure alerts for upload-completion failures, provider latency/errors, preview backlog, retention backlog, reconciliation issues, and unexpected R2 storage/operation growth.

## Wrangler commands

Run these from the repository root after loading an ignored environment containing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`:

```bash
npx --yes wrangler@latest r2 bucket create campusone-private-dev --env-file services/api/.env
npx --yes wrangler@latest r2 bucket create campusone-public-dev --env-file services/api/.env
npx --yes wrangler@latest r2 bucket cors set campusone-private-dev --file infra/cloudflare/r2-private-cors.dev.json --env-file services/api/.env
npx --yes wrangler@latest r2 bucket cors set campusone-public-dev --file infra/cloudflare/r2-public-cors.dev.json --env-file services/api/.env
npx --yes wrangler@latest r2 bucket lifecycle set campusone-private-dev --file infra/cloudflare/r2-private-lifecycle.json --env-file services/api/.env
npx --yes wrangler@latest r2 bucket info campusone-private-dev --env-file services/api/.env
npx --yes wrangler@latest r2 bucket info campusone-public-dev --env-file services/api/.env
npx --yes wrangler@latest r2 bucket cors list campusone-private-dev --env-file services/api/.env
npx --yes wrangler@latest r2 bucket lifecycle list campusone-private-dev --env-file services/api/.env
```

Bucket creation and policy application are idempotent only when the operator first lists/inspects existing resources. Never delete or empty a bucket as an automated rollback.

## Rollback

Disable new upload initiation, keep reads on the last known-good provider, and allow pending grants to expire. Revert the application provider flag only after metadata reconciliation. Preserve both buckets and their objects; bucket deletion is destructive and is not part of rollback. For public-to-private changes, delete the public object and purge its exact old URL before declaring the transition complete.
