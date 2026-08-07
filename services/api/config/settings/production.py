from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403

DEBUG = False
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 3600
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = True
SECURE_CONTENT_TYPE_NOSNIFF = True

if SECRET_KEY in {"local-development-only", "local-development-only-change-before-production"}:  # noqa: F405
    raise ImproperlyConfigured("A production DJANGO_SECRET_KEY is required")
if USE_SQLITE:  # noqa: F405
    raise ImproperlyConfigured("SQLite is not allowed in production")
