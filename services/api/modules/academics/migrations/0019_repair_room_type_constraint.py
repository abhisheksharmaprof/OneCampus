"""Align the legacy room-type constraint with the current room UI."""

from django.db import migrations


def repair_room_type_constraint(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_room_type_check")
        cursor.execute(
            """
            ALTER TABLE rooms
            ADD CONSTRAINT rooms_room_type_check
            CHECK (lower(room_type) IN (
                'classroom', 'lab', 'laboratory', 'library', 'sports',
                'meeting', 'music', 'art', 'hall', 'office', 'other'
            ))
            """
        )


class Migration(migrations.Migration):
    dependencies = [("academics", "0018_repair_legacy_room_number")]

    operations = [
        migrations.RunPython(
            repair_room_type_constraint,
            migrations.RunPython.noop,
        ),
    ]
