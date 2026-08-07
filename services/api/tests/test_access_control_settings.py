from config.settings.test import *  # noqa: F403

INSTALLED_APPS = [*INSTALLED_APPS, "modules.access_control.apps.AccessControlConfig"]  # noqa: F405
ROOT_URLCONF = "modules.access_control.api.urls"
