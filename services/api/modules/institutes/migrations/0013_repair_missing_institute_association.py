"""Repair databases where the peer-association migration was recorded but its table is absent."""

from django.db import migrations


def create_association_if_missing(apps, schema_editor):
    model = apps.get_model("institutes", "InstituteAssociation")
    connection = schema_editor.connection
    if model._meta.db_table not in connection.introspection.table_names():
        schema_editor.create_model(model)


class Migration(migrations.Migration):
    dependencies = [("institutes", "0012_use_unprefixed_institute_tables")]

    operations = [
        migrations.RunPython(
            create_association_if_missing,
            migrations.RunPython.noop,
        ),
    ]
