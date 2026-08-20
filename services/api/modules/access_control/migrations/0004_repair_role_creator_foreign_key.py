"""Repair the role creator foreign key left pointing at the legacy users table."""

from django.db import migrations


def repair_role_creator_foreign_key(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "ALTER TABLE access_control_role "
            "DROP CONSTRAINT IF EXISTS access_control_role_created_by_id_fkey"
        )
        cursor.execute(
            "ALTER TABLE access_control_role "
            "ADD CONSTRAINT access_control_role_created_by_id_fkey "
            "FOREIGN KEY (created_by_id) REFERENCES identity_user(id) ON DELETE SET NULL"
        )


class Migration(migrations.Migration):
    dependencies = [("access_control", "0003_seed_point_approver_permission")]

    operations = [
        migrations.RunPython(
            repair_role_creator_foreign_key,
            migrations.RunPython.noop,
        ),
    ]
