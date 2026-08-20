"""Repair remaining scalar profile columns in partially migrated databases."""

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
    add_field_if_missing(apps, schema_editor, "StaffProfile", "max_periods_per_week", 36)
    add_field_if_missing(apps, schema_editor, "Student", "social_category", "")


class Migration(migrations.Migration):
    dependencies = [("people", "0023_repair_missing_staff_limits_and_student_gender")]

    operations = [migrations.RunPython(repair_columns, migrations.RunPython.noop)]
