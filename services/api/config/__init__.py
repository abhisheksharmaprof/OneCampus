try:
    from .celery import app as celery_app
except ModuleNotFoundError:
    # Keep Django management commands usable when Celery is not installed in the
    # local environment. The app still works without the Celery worker.
    celery_app = None

__all__ = ("celery_app",)
