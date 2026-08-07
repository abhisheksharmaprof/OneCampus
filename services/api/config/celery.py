import os

from celery import Celery

from config.environment import settings_module

os.environ.setdefault("DJANGO_SETTINGS_MODULE", settings_module())
app = Celery("campusone")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
