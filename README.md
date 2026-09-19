# CampusOne

CampusOne is a modular, multi-tenant school CRM built as a monorepo. It is designed to support parent, staff/teacher, and institute-admin experiences with clear product and backend-domain boundaries.

## Repository structure

```text
apps/
  institute-admin-web/   # Institute administrator web application
  platform-admin-web/    # Platform administrator web application
services/
  api/                   # Django API and domain modules
packages/                # Shared packages as they are introduced
```

The architecture and product boundaries are described in [ARCHITECTURE.md](ARCHITECTURE.md). Product and feature specifications live in the repository alongside the implementation.

## Prerequisites

- Node.js 20+
- npm
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) for the Django API
- A Supabase Postgres database URL for `DATABASE_URL`
- Redis for background workers in production; local development may use eager Celery

## Getting started

CampusOne uses Supabase/PostgreSQL as the application database in every
developer and deployment environment. Do not switch the app to SQLite for local
development.

Install the JavaScript workspace dependencies from the repository root:

```bash
npm install
```

Configure the API:

```bash
cd services/api
cp .env.example .env
uv sync --all-groups
```

Edit `services/api/.env` and set at least these values:

```env
DJANGO_SECRET_KEY=<long-random-local-secret>
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,testserver,api.snifply.com
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175
CSRF_TRUSTED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175
DATABASE_URL=<supabase-postgres-session-pooler-or-direct-url>
DJANGO_USE_SQLITE=false
DATABASE_SSL_REQUIRE=true
DATABASE_CONNECT_TIMEOUT=10
REDIS_URL=redis://127.0.0.1:6379/0
CELERY_TASK_ALWAYS_EAGER=true
```

For Supabase, prefer the session pooler connection string when your machine or
host cannot reach the direct database endpoint. If migration startup fails with
`failed to resolve host 'db.<project-ref>.supabase.co'`, copy the current
connection string from Supabase Dashboard -> Project Settings -> Database ->
Connection string and retry with that URL.

Apply migrations and run the API:

```bash
uv run python manage.py migrate
uv run python manage.py runserver
```

In another terminal, run the Institute Admin web app:

```bash
cp apps/institute-admin-web/.env.example apps/institute-admin-web/.env
npm run dev:admin
```

The institute admin app runs on `http://localhost:5173`; the API runs on
`http://127.0.0.1:8000`.

To start both admin apps, the API, and the Cloudflare tunnel together with fixed ports, run from the repository root:

```bash
npm run dev
```

The public admin URLs are `https://institute.snifply.com` and `https://platform.snifply.com`. The tunnel configuration is stored in `cloudflared/campusone.yml`.

If you only need the platform admin frontend, run `npm run dev:platform-admin`;
it uses `http://localhost:5174`.

For the complete local configuration, readiness checks, and onboarding flow, see [RUNNING_AND_TESTING.md](RUNNING_AND_TESTING.md).

## Database setup file

The database setup file is [school_platform_schema.sql](school_platform_schema.sql).
Every database change must update this file in the same PR or task as the Django
model/migration change. Django migrations in `services/api/modules/*/migrations`
remain the runtime deployment mechanism, but `school_platform_schema.sql` is the
single SQL setup snapshot humans should review when checking the complete schema.

For a schema change:

```bash
cd services/api
uv run python manage.py makemigrations
uv run python manage.py migrate
uv run python manage.py makemigrations --check --dry-run
```

Then edit `school_platform_schema.sql` so a fresh Supabase/Postgres database can
be reviewed or recreated from the same schema contract. Do not add tables,
columns, indexes, constraints, or seed permissions in code without updating that
file.

## Deployment

Deploy the API and web apps as separate services.

The repo includes a single Railway IaC manifest at `.railway/railway.ts` for the
full Railway shape: API, worker, beat, Redis, Institute Admin web, and Platform
Admin web. Before applying it, replace
`REPLACE_WITH_GITHUB_OWNER/REPLACE_WITH_REPO` with the GitHub repository slug and
set the preserved secrets/domains in Railway. The database remains Supabase
Postgres; `DATABASE_URL` must be the Supabase connection string.

### API service

The API lives in `services/api` and includes a Dockerfile plus
`services/api/scripts/start.sh`. The start script runs:

```bash
python manage.py migrate --noinput
python manage.py collectstatic --noinput
gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-8000}"
```

On Railway or another Docker host:

1. Create a web service from this repository.
2. Set the service root directory to `services/api`.
3. Use `services/api/Dockerfile`.
4. Set the health check path to `/api/v1/health`.
5. Add production environment variables:

```env
DJANGO_ENV=production
DJANGO_DEBUG=false
DJANGO_SECRET_KEY=<production-secret>
DJANGO_ALLOWED_HOSTS=<api-domain>
PUBLIC_APP_DOMAIN=<public-root-domain>
CORS_ALLOWED_ORIGINS=https://<institute-admin-domain>,https://<platform-admin-domain>
CSRF_TRUSTED_ORIGINS=https://<institute-admin-domain>,https://<platform-admin-domain>
DATABASE_URL=<supabase-postgres-url>
DJANGO_USE_SQLITE=false
DATABASE_SSL_REQUIRE=true
REDIS_URL=<redis-url>
CELERY_TASK_ALWAYS_EAGER=false
```

Add the storage, email, Sentry, and Cloudflare/R2 variables from
`services/api/.env.example` when those integrations are enabled. Keep all secret
values in the host's secrets manager, not in Git.

Create a second worker service from the same `services/api` root when background
jobs are needed, and use this start command:

```bash
celery -A config worker --loglevel=INFO
```

Use this command for a scheduler service if periodic jobs are enabled:

```bash
celery -A config beat --loglevel=INFO
```

### Web apps

The web apps are Vite builds:

```bash
npm install
npm run build:admin
npm run build:platform-admin
```

Deploy `apps/institute-admin-web/dist` and `apps/platform-admin-web/dist` to a
static host such as Cloudflare Pages, Netlify, Vercel static output, or an
equivalent CDN. Set the app environment variable before building:

```env
VITE_API_BASE_URL=https://<api-domain>
VITE_PUBLIC_APP_DOMAIN=<public-root-domain>
```

After deployment, verify:

```bash
curl --fail https://<api-domain>/api/v1/health
curl --fail https://<api-domain>/api/v1/ready
curl --fail https://<institute-admin-domain>/
```

## Common commands

```bash
npm run build:admin
npm run build:platform-admin
npm run test:admin
```

Application-specific commands are available in each app’s `package.json`, including linting, type checking, and watch mode.

## Environment and security

Never commit `.env` files, credentials, private keys, database dumps, or production data. Use the provided `.env.example` files as templates and keep secrets in your local environment or a secrets manager.

## Project status

CampusOne is under active development. The repository includes the current admin interfaces, API foundation, architecture decisions, and implementation specifications; additional mobile products and shared packages will be added incrementally.
