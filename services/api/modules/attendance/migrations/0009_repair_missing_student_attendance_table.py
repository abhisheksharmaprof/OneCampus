"""Repair databases where attendance migrations were recorded but the table is absent."""

from django.db import migrations


def create_student_attendance_if_missing(apps, schema_editor):
    StudentAttendance = apps.get_model("attendance", "StudentAttendance")
    connection = schema_editor.connection
    existing_tables = set(connection.introspection.table_names())

    if StudentAttendance._meta.db_table not in existing_tables:
        # Build the table from the historical model state at this migration,
        # including fields added by migrations 0002-0008. This is idempotent
        # and does not touch existing attendance data.
        schema_editor.create_model(StudentAttendance)


class Migration(migrations.Migration):
    dependencies = [("attendance", "0008_remove_attendancesettings_capture_mode_config")]

    operations = [
        migrations.RunPython(
            create_student_attendance_if_missing,
            migrations.RunPython.noop,
        ),
    ]
