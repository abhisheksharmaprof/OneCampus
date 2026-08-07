from django.apps import AppConfig


class AdminConsoleConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "modules.admin_console"
    label = "admin_console"
    verbose_name = "Admin console"
