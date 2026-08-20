"""Allow current room writes against legacy schemas with room_number."""

from django.db import migrations


def make_legacy_room_number_nullable(apps, schema_editor):
    connection = schema_editor.connection
    table_name = "rooms"
    column_name = "room_number"

    with connection.cursor() as cursor:
        columns = {
            column.name
            for column in connection.introspection.get_table_description(cursor, table_name)
        }
        if column_name not in columns:
            return

        if connection.vendor == "postgresql":
            quote = schema_editor.quote_name
            cursor.execute(
                f"ALTER TABLE {quote(table_name)} "
                f"ALTER COLUMN {quote(column_name)} DROP NOT NULL"
            )
        elif connection.vendor == "sqlite":
            # SQLite cannot alter nullability in place. The legacy column is
            # retained as-is there because local development does not use it.
            return


class Migration(migrations.Migration):
    dependencies = [("academics", "0017_repair_missing_room_equipment")]

    operations = [
        migrations.RunPython(
            make_legacy_room_number_nullable,
            migrations.RunPython.noop,
        ),
    ]
