from django.db import migrations


def restore_audit_event_table(apps, schema_editor):
    """Create the current audit-event table when an older schema skipped it."""
    model = apps.get_model("platform_core", "AuditEvent")
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        existing_tables = set(connection.introspection.table_names(cursor))
    if model._meta.db_table not in existing_tables:
        schema_editor.create_model(model)


class Migration(migrations.Migration):
    dependencies = [
        ("institutes", "0012_use_unprefixed_institute_tables"),
        ("platform_core", "0003_repair_jwt_blacklist_tables"),
    ]

    operations = [
        migrations.RunPython(restore_audit_event_table, migrations.RunPython.noop),
    ]
