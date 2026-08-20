"""Restore active file-storage tables missing from legacy cloud schemas."""

from django.db import migrations


def create_missing_file_support_tables(apps, schema_editor):
    connection = schema_editor.connection
    existing = set(connection.introspection.table_names())
    for model_name in ("FileUploadSession", "FileVariant", "FileAccessLog"):
        model = apps.get_model("file_storage", model_name)
        if model._meta.db_table not in existing:
            schema_editor.create_model(model)
            existing.add(model._meta.db_table)


class Migration(migrations.Migration):
    dependencies = [
        ("file_storage", "0003_repair_missing_file_asset"),
        ("identity", "0006_use_generic_users_table"),
    ]

    operations = [
        migrations.RunPython(
            create_missing_file_support_tables,
            migrations.RunPython.noop,
        ),
    ]
