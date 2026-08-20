"""Create academic tables absent from databases with incomplete migration history."""

from django.db import migrations


def create_missing_tables(apps, schema_editor):
    connection = schema_editor.connection
    existing = set(connection.introspection.table_names())
    for model_name in ("AcademicTerm", "AcademicOperation"):
        model = apps.get_model("academics", model_name)
        if model._meta.db_table not in existing:
            schema_editor.create_model(model)


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0011_repair_missing_institute_columns"),
        ("institutes", "0013_repair_missing_institute_association"),
        ("people", "0022_repair_missing_availability_and_birth_date"),
    ]

    operations = [migrations.RunPython(create_missing_tables, migrations.RunPython.noop)]
