"""Repair the room equipment column in legacy cloud schemas."""

from django.db import migrations


def add_room_equipment_if_missing(apps, schema_editor):
    connection = schema_editor.connection
    table_name = "rooms"
    with connection.cursor() as cursor:
        columns = {
            column.name
            for column in connection.introspection.get_table_description(cursor, table_name)
        }

        if "equipment" in columns:
            return

        quote = schema_editor.quote_name
        if connection.vendor == "postgresql":
            cursor.execute(
                f"ALTER TABLE {quote(table_name)} "
                f"ADD COLUMN {quote('equipment')} jsonb NULL"
            )
            cursor.execute(
                f"UPDATE {quote(table_name)} SET {quote('equipment')} = %s::jsonb "
                f"WHERE {quote('equipment')} IS NULL",
                ["[]"],
            )
            cursor.execute(
                f"ALTER TABLE {quote(table_name)} ALTER COLUMN {quote('equipment')} "
                "SET DEFAULT '[]'::jsonb"
            )
            cursor.execute(
                f"ALTER TABLE {quote(table_name)} ALTER COLUMN {quote('equipment')} SET NOT NULL"
            )
        else:
            cursor.execute(
                f"ALTER TABLE {quote(table_name)} "
                f"ADD COLUMN {quote('equipment')} text NULL"
            )
            cursor.execute(
                f"UPDATE {quote(table_name)} SET {quote('equipment')} = %s "
                f"WHERE {quote('equipment')} IS NULL",
                ["[]"],
            )


class Migration(migrations.Migration):
    dependencies = [("academics", "0016_repair_missing_room_name")]

    operations = [
        migrations.RunPython(
            add_room_equipment_if_missing,
            migrations.RunPython.noop,
        ),
    ]
