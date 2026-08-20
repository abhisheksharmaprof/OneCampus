"""Repair the room name column missing from legacy cloud schemas."""

from django.db import migrations


def add_room_name_if_missing(apps, schema_editor):
    connection = schema_editor.connection
    table_name = "rooms"
    with connection.cursor() as cursor:
        table_names = connection.introspection.table_names(cursor)
        if table_name not in table_names:
            return
        columns = {
            item.name
            for item in connection.introspection.get_table_description(cursor, table_name)
        }

    if "name" in columns:
        return

    quote = connection.ops.quote_name
    if connection.vendor == "postgresql":
        schema_editor.execute(
            f"ALTER TABLE {quote(table_name)} "
            f"ADD COLUMN {quote('name')} varchar(100) NULL"
        )
        schema_editor.execute(
            f"UPDATE {quote(table_name)} "
            f"SET {quote('name')} = COALESCE(NULLIF({quote('room_type')}, ''), 'Room') "
            f"|| ' ' || LEFT({quote('id')}::text, 8) "
            f"WHERE {quote('name')} IS NULL"
        )
        schema_editor.execute(
            f"ALTER TABLE {quote(table_name)} ALTER COLUMN {quote('name')} SET NOT NULL"
        )
    elif connection.vendor == "sqlite":
        schema_editor.execute(
            f"ALTER TABLE {quote(table_name)} ADD COLUMN {quote('name')} varchar(100) NULL"
        )
        schema_editor.execute(
            f"UPDATE {quote(table_name)} SET {quote('name')} = "
            f"COALESCE(NULLIF({quote('room_type')}, ''), 'Room') || ' ' || substr({quote('id')}, 1, 8) "
            f"WHERE {quote('name')} IS NULL"
        )


class Migration(migrations.Migration):
    dependencies = [("academics", "0015_repair_missing_class_subject_room")]

    operations = [migrations.RunPython(add_room_name_if_missing, migrations.RunPython.noop)]
