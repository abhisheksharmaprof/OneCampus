"""Recreate the staff invitation table when migration history is ahead of schema.

Some deployed databases recorded 0004_staffinvitation as applied without
actually creating its table. This repair is intentionally idempotent so it is
safe on databases where the table already exists.
"""

from django.db import migrations


def create_staff_invitation_table_if_missing(apps, schema_editor):
    table_name = "people_staffinvitation"
    existing_tables = set(schema_editor.connection.introspection.table_names())
    if table_name in existing_tables:
        return
    StaffInvitation = apps.get_model("people", "StaffInvitation")
    schema_editor.create_model(StaffInvitation)


class Migration(migrations.Migration):
    dependencies = [("people", "0028_rename_students_index")]

    operations = [
        migrations.RunPython(
            create_staff_invitation_table_if_missing,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
