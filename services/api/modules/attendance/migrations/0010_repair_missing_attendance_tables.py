"""Repair attendance tables missing from partially migrated databases."""

from django.db import migrations

MODELS = (
    "AttendanceSettings",
    "StaffAttendance",
    "LeaveType",
    "LeaveApplication",
    "LeaveBalance",
    "LeaveApplicationHistory",
    "AttendanceAuditLog",
    "AttendanceNotification",
)


def create_missing_tables(apps, schema_editor):
    connection = schema_editor.connection
    existing = set(connection.introspection.table_names())
    for model_name in MODELS:
        model = apps.get_model("attendance", model_name)
        if model._meta.db_table not in existing:
            schema_editor.create_model(model)
            existing.add(model._meta.db_table)


class Migration(migrations.Migration):
    dependencies = [("attendance", "0009_repair_missing_student_attendance_table")]

    operations = [migrations.RunPython(create_missing_tables, migrations.RunPython.noop)]
