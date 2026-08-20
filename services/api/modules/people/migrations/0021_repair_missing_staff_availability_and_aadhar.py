"""Repair legacy databases missing staff availability and student identity columns."""

from django.db import migrations


def add_field_if_missing(apps, schema_editor, model_name, field_name, default):
    model = apps.get_model("people", model_name)
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        columns = {
            column.name
            for column in connection.introspection.get_table_description(
                cursor, model._meta.db_table
            )
        }

    field = model._meta.get_field(field_name)
    column_name = field.db_column or field.name
    if column_name in columns:
        return
    repair_field = field.clone()
    repair_field.default = default
    repair_field.set_attributes_from_name(column_name)
    schema_editor.add_field(model, repair_field)


def repair_columns(apps, schema_editor):
    add_field_if_missing(
        apps,
        schema_editor,
        "StaffProfile",
        "available_days",
        ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
    )
    add_field_if_missing(apps, schema_editor, "Student", "aadhar_number", "")


class Migration(migrations.Migration):
    dependencies = [("people", "0020_repair_missing_staff_student_columns")]

    operations = [
        migrations.RunPython(repair_columns, migrations.RunPython.noop),
    ]
