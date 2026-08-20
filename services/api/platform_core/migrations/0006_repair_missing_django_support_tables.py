"""Restore active Django admin and session tables when migration history drifted."""

from django.db import migrations


def create_missing_django_support_tables(apps, schema_editor):
    connection = schema_editor.connection
    existing = set(connection.introspection.table_names())
    for app_label, model_name in (("admin", "LogEntry"), ("sessions", "Session")):
        model = apps.get_model(app_label, model_name)
        if model._meta.db_table not in existing:
            schema_editor.create_model(model)
            existing.add(model._meta.db_table)


class Migration(migrations.Migration):
    dependencies = [
        ("admin", "0003_logentry_add_action_flag_choices"),
        ("identity", "0006_use_generic_users_table"),
        ("platform_core", "0005_remove_empty_legacy_tables"),
        ("sessions", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(
            create_missing_django_support_tables,
            migrations.RunPython.noop,
        ),
    ]
