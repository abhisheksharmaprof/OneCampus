import os

from django.core.exceptions import ImproperlyConfigured

VALID_ENVIRONMENTS = {"development", "production", "test"}


def settings_module():
    environment = os.getenv("DJANGO_ENV", "development").lower()
    if environment not in VALID_ENVIRONMENTS:
        raise ImproperlyConfigured(
            f"Unsupported DJANGO_ENV={environment!r}; expected one of {sorted(VALID_ENVIRONMENTS)}"
        )
    return f"config.settings.{environment}"
