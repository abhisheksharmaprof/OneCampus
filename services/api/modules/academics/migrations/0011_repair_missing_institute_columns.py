"""Repair tenant columns missing from legacy academics tables."""

from django.db import migrations

MODELS = ("Grade", "Subject", "Room", "ClassSubject")


def add_missing_institute_columns(apps, schema_editor):
    connection = schema_editor.connection
    for model_name in MODELS:
        model = apps.get_model("academics", model_name)
        with connection.cursor() as cursor:
            columns = {
                column.name
                for column in connection.introspection.get_table_description(
                    cursor, model._meta.db_table
                )
            }
        column_name = "institute_id"
        if column_name in columns:
            continue

        # Existing legacy rows cannot be assigned safely to a tenant without
        # business input. Nullable keeps them readable while new writes use the
        # model's normal required-FK validation.
        quote = connection.ops.quote_name
        if connection.vendor == "postgresql":
            column_type = "uuid"
        elif connection.vendor == "sqlite":
            column_type = "char(32)"
        else:
            column_type = "varchar(36)"
        schema_editor.execute(
            f"ALTER TABLE {quote(model._meta.db_table)} "
            f"ADD COLUMN {quote(column_name)} {column_type} NULL"
        )


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0010_classsubject_is_lab"),
        ("institutes", "0013_repair_missing_institute_association"),
    ]

    operations = [migrations.RunPython(add_missing_institute_columns, migrations.RunPython.noop)]
