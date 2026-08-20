"""Repair databases where the document migration is recorded but its table is absent."""

from django.db import migrations


def create_document_template_if_missing(apps, schema_editor):
    model = apps.get_model("documents", "DocumentTemplate")
    connection = schema_editor.connection
    if model._meta.db_table not in connection.introspection.table_names():
        schema_editor.create_model(model)


class Migration(migrations.Migration):
    dependencies = [("documents", "0001_initial")]

    operations = [
        migrations.RunPython(
            create_document_template_if_missing,
            migrations.RunPython.noop,
        ),
    ]
