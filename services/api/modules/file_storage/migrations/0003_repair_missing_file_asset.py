"""Repair the file asset table when its migration was recorded without DDL."""

from django.db import migrations


def create_file_asset_if_missing(apps, schema_editor):
    model = apps.get_model("file_storage", "FileAsset")
    connection = schema_editor.connection
    if model._meta.db_table not in connection.introspection.table_names():
        schema_editor.create_model(model)


class Migration(migrations.Migration):
    dependencies = [("file_storage", "0002_letterhead_asset")]

    operations = [
        migrations.RunPython(create_file_asset_if_missing, migrations.RunPython.noop)
    ]
