"""Repair the student parent-name column missing from legacy databases."""

from django.db import migrations


def add_father_name_if_missing(apps, schema_editor):
    model = apps.get_model("people", "Student")
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        columns = {
            column.name
            for column in connection.introspection.get_table_description(
                cursor, model._meta.db_table
            )
        }
    field = model._meta.get_field("father_name")
    column_name = field.db_column or field.name
    if column_name not in columns:
        repair_field = field.clone()
        repair_field.null = True
        repair_field.default = None
        repair_field.set_attributes_from_name(column_name)
        schema_editor.add_field(model, repair_field)


class Migration(migrations.Migration):
    dependencies = [("people", "0016_assign_admin_employee_codes")]

    operations = [migrations.RunPython(add_father_name_if_missing, migrations.RunPython.noop)]
