from django.db import migrations


def create_event_table_if_missing(apps, schema_editor):
    model = apps.get_model("school_calendar", "AcademicCalendarEvent")
    table_name = model._meta.db_table
    existing_tables = schema_editor.connection.introspection.table_names()
    if table_name not in existing_tables:
        schema_editor.create_model(model)


class Migration(migrations.Migration):
    dependencies = [("school_calendar", "0003_remove_calendarintegrationconnection_institute_and_more")]

    operations = [migrations.RunPython(create_event_table_if_missing, migrations.RunPython.noop)]
