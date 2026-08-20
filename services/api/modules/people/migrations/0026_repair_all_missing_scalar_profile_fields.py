"""Bring partially migrated people tables up to the current scalar model shape."""

from django.db import migrations, models


def repair_model(apps, schema_editor, model_name):
    model = apps.get_model("people", model_name)
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        columns = {
            column.name
            for column in connection.introspection.get_table_description(
                cursor, model._meta.db_table
            )
        }

    for field in model._meta.local_fields:
        if field.primary_key or field.remote_field is not None:
            continue
        column_name = field.db_column or field.name
        if column_name in columns:
            continue
        repair_field = field.clone()
        if not field.has_default() and not field.null:
            if isinstance(field, (models.CharField, models.TextField, models.EmailField)):
                repair_field.default = ""
            else:
                repair_field.null = True
                repair_field.default = None
        repair_field.set_attributes_from_name(column_name)
        schema_editor.add_field(model, repair_field)


def repair_people_tables(apps, schema_editor):
    repair_model(apps, schema_editor, "StaffProfile")
    repair_model(apps, schema_editor, "Student")


class Migration(migrations.Migration):
    dependencies = [("people", "0025_repair_missing_availability_start_and_religion")]

    operations = [
        migrations.RunPython(repair_people_tables, migrations.RunPython.noop),
    ]
