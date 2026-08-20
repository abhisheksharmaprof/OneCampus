"""Repair the optional room column missing from legacy class-subject tables."""

from django.db import migrations


def add_room_if_missing(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        columns = {
            item.name
            for item in connection.introspection.get_table_description(cursor, "class_subjects")
        }
    if "room_id" in columns:
        return
    quote = connection.ops.quote_name
    if connection.vendor == "postgresql":
        schema_editor.execute(
            f"ALTER TABLE {quote('class_subjects')} ADD COLUMN {quote('room_id')} uuid NULL"
        )
    elif connection.vendor == "sqlite":
        schema_editor.execute(
            f"ALTER TABLE {quote('class_subjects')} ADD COLUMN {quote('room_id')} char(32) NULL"
        )


class Migration(migrations.Migration):
    dependencies = [("academics", "0014_allow_institute_wide_subject_rows")]

    operations = [migrations.RunPython(add_room_if_missing, migrations.RunPython.noop)]
