"""Repair the admissions enquiry table when its initial DDL was skipped."""

from django.db import migrations


def create_enquiry_if_missing(apps, schema_editor):
    model = apps.get_model("admissions", "Enquiry")
    connection = schema_editor.connection
    if model._meta.db_table not in connection.introspection.table_names():
        schema_editor.create_model(model)


class Migration(migrations.Migration):
    dependencies = [("admissions", "0001_initial")]

    operations = [migrations.RunPython(create_enquiry_if_missing, migrations.RunPython.noop)]
