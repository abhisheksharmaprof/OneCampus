from django.db import migrations


def restore_blacklist_tables(apps, schema_editor):
    connection = schema_editor.connection
    existing = set(connection.introspection.table_names())
    outstanding = apps.get_model("token_blacklist", "OutstandingToken")
    blacklisted = apps.get_model("token_blacklist", "BlacklistedToken")
    if outstanding._meta.db_table not in existing:
        schema_editor.create_model(outstanding)
    if blacklisted._meta.db_table not in existing:
        schema_editor.create_model(blacklisted)


class Migration(migrations.Migration):
    dependencies = [
        ("platform_core", "0002_add_audit_target_fields"),
        ("token_blacklist", "0013_alter_blacklistedtoken_options_and_more"),
    ]

    operations = [migrations.RunPython(restore_blacklist_tables, migrations.RunPython.noop)]
