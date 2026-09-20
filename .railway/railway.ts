import {
  defineRailway,
  github,
  group,
  postgres,
  preserve,
  project,
  redis,
  service,
} from "railway/iac";

/*
 * CampusOne Railway IaC
 *
 * Database setup:
 * - Railway Postgres is provisioned by this file.
 * - API, worker, and beat services receive DATABASE_URL from Railway Postgres.
 * - The API image runs `python manage.py migrate --noinput` before Gunicorn,
 *   so an empty Railway database is initialized automatically on deploy.
 * - Keep school_platform_schema.sql updated with every database change.
 */

const repository = "abhisheksharmaprof/OneCampus";
const sourceBranch = "feature/template-studio";

const apiEnvironment = {
  DJANGO_ENV: "production",
  DJANGO_DEBUG: "false",
  DJANGO_SECRET_KEY: preserve(),
  DJANGO_ALLOWED_HOSTS:
    "localhost,127.0.0.1,testserver,healthcheck.railway.app,${{RAILWAY_PUBLIC_DOMAIN}}",
  PUBLIC_APP_DOMAIN: preserve(),
  CORS_ALLOWED_ORIGINS: preserve(),
  CSRF_TRUSTED_ORIGINS: preserve(),
  DJANGO_USE_SQLITE: "false",
  DATABASE_SSL_REQUIRE: "true",
  DATABASE_CONNECT_TIMEOUT: "10",
  CELERY_TASK_ALWAYS_EAGER: "false",
  JWT_ACCESS_MINUTES: "15",
  IDENTITY_LOGIN_RATE: "10/minute",
  IDENTITY_REFRESH_RATE: "30/minute",
  PASSWORD_RESET_URL: preserve(),
  PASSWORD_RESET_RATE: "5/hour",
  INSTITUTE_ONBOARDING_RATE: "5/hour",
  EMAIL_BACKEND: "django.core.mail.backends.smtp.EmailBackend",
  DEFAULT_FROM_EMAIL: preserve(),
  EMAIL_HOST: preserve(),
  EMAIL_PORT: preserve(),
  EMAIL_HOST_USER: preserve(),
  EMAIL_HOST_PASSWORD: preserve(),
  EMAIL_USE_TLS: preserve(),
  FILE_STORAGE_PROVIDER: "r2",
  R2_ACCOUNT_ID: preserve(),
  R2_ACCESS_KEY_ID: preserve(),
  R2_SECRET_ACCESS_KEY: preserve(),
  R2_ENDPOINT_URL: preserve(),
  R2_REGION: "auto",
  R2_PRIVATE_BUCKET: preserve(),
  R2_PUBLIC_BUCKET: preserve(),
  R2_PUBLIC_BASE_URL: preserve(),
  R2_UPLOAD_TTL_SECONDS: "900",
  R2_DOWNLOAD_TTL_SECONDS: "300",
  R2_STAGING_DELETE_BUFFER_SECONDS: "300",
  R2_CONNECT_TIMEOUT_SECONDS: "5",
  R2_READ_TIMEOUT_SECONDS: "15",
  R2_MAX_ATTEMPTS: "4",
  R2_MAX_POOL_CONNECTIONS: "20",
  FILE_STORAGE_RETENTION_DAYS: "30",
  FILE_STORAGE_MAX_PROFILE_BYTES: "5242880",
  FILE_STORAGE_MAX_BRANDING_BYTES: "10485760",
  FILE_STORAGE_MAX_DOCUMENT_BYTES: "26214400",
  FILE_STORAGE_PREVIEW_MAX_PIXELS: "40000000",
  FILE_STORAGE_THUMBNAIL_SIZE: "150",
  FILE_STORAGE_ALLOWED_ORIGINS: preserve(),
  CLOUDFLARE_API_TOKEN: preserve(),
  CLOUDFLARE_ACCOUNT_ID: preserve(),
  CLOUDFLARE_ZONE_ID: preserve(),
  SENTRY_DSN: preserve(),
  FCM_PROJECT_ID: preserve(),
  FCM_CREDENTIALS_JSON: preserve(),
  WHATSAPP_PROVIDER_API_KEY: preserve(),
};

export default defineRailway((ctx: any) => {
  const prod = ctx.environment === "production";
  const db = postgres("postgres");
  const cache = redis("redis");

  const api = service("campusone-api", {
    source: github(repository, { branch: sourceBranch, rootDirectory: "services/api" }),
    start: "./scripts/start.sh",
    healthcheck: "/api/v1/health/",
    healthcheckTimeout: 120,
    replicas: prod ? 1 : 1,
    env: {
      ...apiEnvironment,
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
    },
  });

  const worker = service("campusone-worker", {
    source: github(repository, { branch: sourceBranch, rootDirectory: "services/api" }),
    start: "celery -A config worker --loglevel=INFO",
    replicas: prod ? 1 : 1,
    env: {
      ...apiEnvironment,
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
    },
  });

  const beat = service("campusone-beat", {
    source: github(repository, { branch: sourceBranch, rootDirectory: "services/api" }),
    start: "celery -A config beat --loglevel=INFO",
    replicas: prod ? 1 : 1,
    env: {
      ...apiEnvironment,
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
    },
  });

  const instituteAdmin = service("institute-admin-web", {
    source: github(repository, { branch: sourceBranch }),
    build: "npm run build:admin",
    start: "npx --yes serve -s apps/institute-admin-web/dist -l tcp://0.0.0.0:$PORT",
    env: {
      VITE_API_BASE_URL: preserve(),
      VITE_PUBLIC_APP_DOMAIN: preserve(),
    },
  });

  const platformAdmin = service("platform-admin-web", {
    source: github(repository, { branch: sourceBranch }),
    build: "npm run build:platform-admin",
    start: "npx --yes serve -s apps/platform-admin-web/dist -l tcp://0.0.0.0:$PORT",
    env: {
      VITE_API_BASE_URL: preserve(),
      VITE_PUBLIC_APP_DOMAIN: preserve(),
    },
  });

  const backend = group("Backend", [db, cache, api, worker, beat]);
  const frontends = group("Frontends", [instituteAdmin, platformAdmin]);

  return project("campusone", {
    resources: [backend, frontends],
  });
});
