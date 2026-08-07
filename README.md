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
- PostgreSQL and Redis for a production-like setup (SQLite and eager Celery are available for local development)

## Getting started

Install the JavaScript workspace dependencies from the repository root:

```bash
npm install
```

Configure and run the API:

```bash
cd services/api
cp .env.example .env
uv sync --all-groups
uv run python manage.py migrate
uv run python manage.py runserver
```

In another terminal, run an admin application from the repository root:

```bash
npm run dev:admin
# or
npm run dev:platform-admin
```

The institute admin app runs on `http://localhost:5173`; the platform admin app runs on `http://localhost:5174`.

For the complete local configuration, readiness checks, and onboarding flow, see [RUNNING_AND_TESTING.md](RUNNING_AND_TESTING.md).

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
