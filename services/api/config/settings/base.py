import re
from datetime import timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parents[2]
env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY", default="local-development-only")
DEBUG = env.bool("DJANGO_DEBUG", default=False)

API_LOG_DIR = BASE_DIR / "logs"
API_LOG_DIR.mkdir(parents=True, exist_ok=True)
API_LOG_FILE = API_LOG_DIR / "api.log"
# Local logs intentionally represent the current server run only.  Remove old
# rotations during startup; cloud log shipping can be added later without
# changing the JSON event schema.
for api_log in API_LOG_DIR.glob("api.log*"):
    try:
        api_log.unlink(missing_ok=True)
    except PermissionError:
        # Windows keeps an open log file exclusively locked.  This happens
        # when a second management command starts while an API server is still
        # running; preserve that server's log and allow this command to start.
        pass

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "campusone": {"format": "[{levelname}] {name}: {message}", "style": "{"},
        "json": {"()": "platform_core.logging.JsonLogFormatter"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "campusone"},
        "api_file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": API_LOG_FILE,
            "formatter": "json",
            "maxBytes": env.int("API_LOG_MAX_BYTES", default=10 * 1024 * 1024),
            "backupCount": env.int("API_LOG_BACKUP_COUNT", default=5),
            "encoding": "utf-8",
        },
    },
    "loggers": {
        "modules.identity.api": {
            "handlers": ["console", "api_file"],
            "level": "INFO",
            "propagate": False,
        },
        "api.request": {"handlers": ["api_file", "console"], "level": "INFO", "propagate": False},
    },
    # Captures exception logs from every API module, including tracebacks from
    # the DRF exception handler.  Request metadata remains on api.request.
    "root": {"handlers": ["api_file", "console"], "level": "ERROR"},
}
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]
THIRD_PARTY_APPS = [
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
]
LOCAL_APPS = [
    "platform_core.apps.PlatformCoreConfig",
    "modules.identity.apps.IdentityConfig",
    "modules.institutes.apps.InstitutesConfig",
    "modules.people.apps.PeopleConfig",
    "modules.admissions.apps.AdmissionsConfig",
    "modules.attendance.apps.AttendanceConfig",
    "modules.finance.apps.FinanceConfig",
    "modules.school_calendar.apps.SchoolCalendarConfig",
    "modules.access_control.apps.AccessControlConfig",
    "modules.admin_console.apps.AdminConsoleConfig",
    "modules.academics.apps.AcademicsConfig",
    "modules.file_storage.apps.FileStorageConfig",
    "modules.documents.apps.DocumentsConfig",
]
INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "platform_core.middleware.TraceIdMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

USE_SQLITE = env.bool("DJANGO_USE_SQLITE", default=False)
if USE_SQLITE:
    DATABASES = {
        "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}
    }
else:
    DATABASES = {"default": env.db("DATABASE_URL")}
    if DATABASES["default"]["ENGINE"] == "django.db.backends.sqlite3":
        raise ImproperlyConfigured(
            "DJANGO_USE_SQLITE=false requires a PostgreSQL DATABASE_URL. "
            "Replace DATABASE_URL=sqlite:///db.sqlite3 in services/api/.env "
            "with the cloud database URL."
        )
    # Persistent connections are useful in production, but they easily exhaust
    # small hosted Postgres plans during local Django development/reloads.
    default_conn_max_age = 0 if DEBUG else 60
    DATABASES["default"]["CONN_MAX_AGE"] = env.int(
        "DATABASE_CONN_MAX_AGE", default=default_conn_max_age
    )
    # Do not let an unreachable hosted database hold an API request for the
    # driver's default (often several minutes).  This keeps health/readiness
    # checks and failed requests responsive while the database is unavailable.
    database_options = DATABASES["default"].setdefault("OPTIONS", {})
    database_options["connect_timeout"] = env.int("DATABASE_CONNECT_TIMEOUT", default=10)
    if env.bool("DATABASE_SSL_REQUIRE", default=True):
        database_options["sslmode"] = "require"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Azure Blob Storage is enabled only when explicitly configured. Local and test
# environments remain filesystem-free for metadata tests, while production uses
# private containers and short-lived SAS URLs generated by the API.
AZURE_STORAGE_ACCOUNT_NAME = env("AZURE_STORAGE_ACCOUNT_NAME", default="")
AZURE_STORAGE_ACCOUNT_KEY = env("AZURE_STORAGE_ACCOUNT_KEY", default="")
AZURE_STORAGE_CONNECTION_STRING = env("AZURE_STORAGE_CONNECTION_STRING", default="")
AZURE_STORAGE_ENDPOINT_SUFFIX = env("AZURE_STORAGE_ENDPOINT_SUFFIX", default="core.windows.net")
AZURE_STORAGE_PROFILE_CONTAINER = env("AZURE_STORAGE_PROFILE_CONTAINER", default="profile-images")
AZURE_STORAGE_DOCUMENT_CONTAINER = env("AZURE_STORAGE_DOCUMENT_CONTAINER", default="documents")
AZURE_STORAGE_INSTITUTE_CONTAINER = env(
    "AZURE_STORAGE_INSTITUTE_CONTAINER", default="institute-assets"
)
AZURE_STORAGE_TEMP_CONTAINER = env("AZURE_STORAGE_TEMP_CONTAINER", default="temporary-uploads")
AZURE_STORAGE_SAS_MINUTES = env.int("AZURE_STORAGE_SAS_MINUTES", default=10)
AZURE_STORAGE_REQUIRE_SCAN = env.bool("AZURE_STORAGE_REQUIRE_SCAN", default=False)
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "identity.User"

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:5173"])
# Vite may move to the next available port when another dev server is running.
# Keep this convenience limited to local development; production still uses the
# explicit CORS_ALLOWED_ORIGINS list above.
CORS_ALLOWED_ORIGIN_REGEXES = [r"^https?://(localhost|127\.0\.0\.1):\d+$"] if DEBUG else []
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:5173"])

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "platform_core.api.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_RATES": {
        "identity-login": env("IDENTITY_LOGIN_RATE", default="10/minute"),
        "identity-refresh": env("IDENTITY_REFRESH_RATE", default="30/minute"),
        "password-reset": env("PASSWORD_RESET_RATE", default="5/hour"),
        "institute-onboarding": env("INSTITUTE_ONBOARDING_RATE", default="5/hour"),
    },
}
PASSWORD_RESET_URL = env("PASSWORD_RESET_URL", default="http://localhost:5175/login")
SPECTACULAR_SETTINGS = {
    "TITLE": "CampusOne API",
    "DESCRIPTION": "Multi-tenant school CRM API",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "ENUM_NAME_OVERRIDES": {
        "EnquiryStatus": "modules.admissions.models.Enquiry.Status",
        "AttendanceStatus": "modules.attendance.models.StudentAttendance.Status",
    },
}
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env.int("JWT_ACCESS_MINUTES", default=15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=False)
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_BEAT_SCHEDULE = {
    "expire-file-upload-sessions": {
        "task": "modules.file_storage.tasks.expire_file_upload_sessions",
        "schedule": 300.0,
    },
    "cleanup-expired-staging-objects": {
        "task": "modules.file_storage.tasks.cleanup_expired_staging_objects",
        "schedule": 900.0,
    },
}

# Transactional email (OTP and operational notifications). Production values
# are environment-driven; tests override the delivery boundary directly.
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="CampusOne <no-reply@campusone.local>")
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=10)

# Azure Blob Storage. Leave the connection string empty when using managed
# identity with AZURE_STORAGE_ACCOUNT_URL in production.
AZURE_STORAGE_ACCOUNT_URL = env("AZURE_STORAGE_ACCOUNT_URL", default="")
AZURE_STORAGE_CONNECTION_STRING = env("AZURE_STORAGE_CONNECTION_STRING", default="")
AZURE_STORAGE_CONTAINER = env("AZURE_STORAGE_CONTAINER", default="campusone-files")
AZURE_STORAGE_SAS_EXPIRY_MINUTES = env.int("AZURE_STORAGE_SAS_EXPIRY_MINUTES", default=15)
AZURE_STORAGE_UPLOAD_EXPIRY_MINUTES = env.int("AZURE_STORAGE_UPLOAD_EXPIRY_MINUTES", default=30)
AZURE_STORAGE_MAX_UPLOAD_BYTES = env.int("AZURE_STORAGE_MAX_UPLOAD_BYTES", default=104857600)

# Secure object storage. R2 uses its S3-compatible API for application data
# transfer and the Cloudflare API only for bucket administration/cache purge.
FILE_STORAGE_PROVIDER = env("FILE_STORAGE_PROVIDER", default="r2").lower()
if FILE_STORAGE_PROVIDER not in {"r2", "azure"}:
    raise ImproperlyConfigured("FILE_STORAGE_PROVIDER must be either 'r2' or 'azure'.")

R2_ACCOUNT_ID = env("R2_ACCOUNT_ID", default="")
R2_ACCESS_KEY_ID = env("R2_ACCESS_KEY_ID", default="")
R2_SECRET_ACCESS_KEY = env("R2_SECRET_ACCESS_KEY", default="")
R2_REGION = env("R2_REGION", default="auto")
R2_ENDPOINT_URL = env(
    "R2_ENDPOINT_URL",
    default=(f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else ""),
)
R2_PRIVATE_BUCKET = env("R2_PRIVATE_BUCKET", default="campusone-private-dev")
R2_PUBLIC_BUCKET = env("R2_PUBLIC_BUCKET", default="campusone-public-dev")
R2_PUBLIC_BASE_URL = env("R2_PUBLIC_BASE_URL", default="").rstrip("/")
R2_UPLOAD_TTL_SECONDS = env.int("R2_UPLOAD_TTL_SECONDS", default=900)
R2_DOWNLOAD_TTL_SECONDS = env.int("R2_DOWNLOAD_TTL_SECONDS", default=300)
R2_STAGING_DELETE_BUFFER_SECONDS = env.int("R2_STAGING_DELETE_BUFFER_SECONDS", default=300)
R2_CONNECT_TIMEOUT_SECONDS = env.int("R2_CONNECT_TIMEOUT_SECONDS", default=5)
R2_READ_TIMEOUT_SECONDS = env.int("R2_READ_TIMEOUT_SECONDS", default=15)
R2_MAX_ATTEMPTS = env.int("R2_MAX_ATTEMPTS", default=4)
R2_MAX_POOL_CONNECTIONS = env.int("R2_MAX_POOL_CONNECTIONS", default=20)
CLOUDFLARE_API_TOKEN = env("CLOUDFLARE_API_TOKEN", default="")
CLOUDFLARE_ACCOUNT_ID = env("CLOUDFLARE_ACCOUNT_ID", default=R2_ACCOUNT_ID)
CLOUDFLARE_ZONE_ID = env("CLOUDFLARE_ZONE_ID", default="")

FILE_STORAGE_RETENTION_DAYS = env.int("FILE_STORAGE_RETENTION_DAYS", default=30)
FILE_STORAGE_MAX_PROFILE_BYTES = env.int("FILE_STORAGE_MAX_PROFILE_BYTES", default=5 * 1024 * 1024)
FILE_STORAGE_MAX_BRANDING_BYTES = env.int(
    "FILE_STORAGE_MAX_BRANDING_BYTES", default=10 * 1024 * 1024
)
FILE_STORAGE_MAX_DOCUMENT_BYTES = env.int(
    "FILE_STORAGE_MAX_DOCUMENT_BYTES", default=25 * 1024 * 1024
)
FILE_STORAGE_PREVIEW_MAX_PIXELS = env.int("FILE_STORAGE_PREVIEW_MAX_PIXELS", default=40_000_000)
FILE_STORAGE_THUMBNAIL_SIZE = env.int("FILE_STORAGE_THUMBNAIL_SIZE", default=150)
FILE_STORAGE_ALLOWED_ORIGINS = env.list(
    "FILE_STORAGE_ALLOWED_ORIGINS", default=CORS_ALLOWED_ORIGINS
)

_r2_bucket_pattern = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$")
for _setting_name, _bucket_name in {
    "R2_PRIVATE_BUCKET": R2_PRIVATE_BUCKET,
    "R2_PUBLIC_BUCKET": R2_PUBLIC_BUCKET,
}.items():
    if not _r2_bucket_pattern.fullmatch(_bucket_name):
        raise ImproperlyConfigured(
            f"{_setting_name} must be a lowercase R2 bucket name between 3 and 63 characters."
        )
if R2_PRIVATE_BUCKET == R2_PUBLIC_BUCKET:
    raise ImproperlyConfigured("R2 private and public buckets must be different.")

for _setting_name, _value, _minimum, _maximum in (
    ("R2_UPLOAD_TTL_SECONDS", R2_UPLOAD_TTL_SECONDS, 60, 3600),
    ("R2_DOWNLOAD_TTL_SECONDS", R2_DOWNLOAD_TTL_SECONDS, 30, 900),
    ("R2_CONNECT_TIMEOUT_SECONDS", R2_CONNECT_TIMEOUT_SECONDS, 1, 30),
    ("R2_READ_TIMEOUT_SECONDS", R2_READ_TIMEOUT_SECONDS, 1, 60),
    ("R2_MAX_ATTEMPTS", R2_MAX_ATTEMPTS, 1, 8),
    ("R2_MAX_POOL_CONNECTIONS", R2_MAX_POOL_CONNECTIONS, 1, 200),
    ("FILE_STORAGE_RETENTION_DAYS", FILE_STORAGE_RETENTION_DAYS, 1, 365),
):
    if not _minimum <= _value <= _maximum:
        raise ImproperlyConfigured(f"{_setting_name} must be between {_minimum} and {_maximum}.")
