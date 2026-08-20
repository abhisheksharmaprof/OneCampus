"""Restore the class-subject lab flag on legacy cloud schemas."""

from django.db import migrations


def add_is_lab_if_missing(apps, schema_editor):
    connection = schema_editor.connection
    with connection.cursor() as cursor:
        columns = {
            column.name
            for column in connection.introspection.get_table_description(cursor, "class_subjects")
        }
        if "is_lab" in columns:
            return
        quote = schema_editor.quote_name
        if connection.vendor == "postgresql":
            cursor.execute(
                f"ALTER TABLE {quote('class_subjects')} "
                f"ADD COLUMN {quote('is_lab')} boolean NOT NULL DEFAULT false"
            )
        else:
            cursor.execute(
                f"ALTER TABLE {quote('class_subjects')} "
                f"ADD COLUMN {quote('is_lab')} bool NOT NULL DEFAULT 0"
            )


class Migration(migrations.Migration):
    dependencies = [("academics", "0019_repair_room_type_constraint")]

    operations = [migrations.RunPython(add_is_lab_if_missing, migrations.RunPython.noop)]
