"""Remove verified-empty legacy tables before canonical table renames."""

from django.db import migrations


# These tables have no active Django model. The migration verifies that each is
# empty at runtime rather than relying on a one-time inventory result.
DROP_ORDER = (
    "assessment_class_sections",
    "attendance_audit_log",
    "attendance_records",
    "audit_logs",
    "circular_targets",
    "consent_records",
    "device_tokens",
    "generated_documents",
    "leaderboard_snapshots",
    "marks",
    "notification_log",
    "parent_student_links",
    "point_transactions",
    "student_batches",
    "assessments",
    "circulars",
    "leave_balances",
    "leave_applications",
    "leave_types",
    "attendance_alert_settings",
    "platform_admins",
    "students",
    "users",
)


def _table_exists(connection, table_name):
    return table_name in connection.introspection.table_names()


def _replace_foreign_key(cursor, table, constraint, column, target, on_delete):
    cursor.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {constraint}")
    cursor.execute(
        f"ALTER TABLE {table} ADD CONSTRAINT {constraint} "
        f"FOREIGN KEY ({column}) REFERENCES {target}(id) ON DELETE {on_delete}"
    )


def remove_empty_legacy_tables(apps, schema_editor):
    connection = schema_editor.connection
    if connection.vendor != "postgresql":
        return

    existing_tables = set(connection.introspection.table_names())
    with connection.cursor() as cursor:
        for table_name in DROP_ORDER:
            if table_name not in existing_tables:
                continue
            cursor.execute(f'SELECT 1 FROM "{table_name}" LIMIT 1')
            if cursor.fetchone() is not None:
                raise RuntimeError(
                    f"Refusing to drop legacy table '{table_name}' because it contains data."
                )

        # These active tables were created while the legacy users table was
        # still present. Point them at the active identity table before the old
        # table is removed; the later table rename updates them automatically.
        _replace_foreign_key(
            cursor,
            "identity_otpchallenge",
            "identity_otpchallenge_user_id_fkey",
            "user_id",
            "identity_user",
            "CASCADE",
        )
        _replace_foreign_key(
            cursor,
            "access_control_userroleassignment",
            "access_control_userroleassignment_user_id_fkey",
            "user_id",
            "identity_user",
            "CASCADE",
        )
        _replace_foreign_key(
            cursor,
            "access_control_userroleassignment",
            "access_control_userroleassignment_assigned_by_id_fkey",
            "assigned_by_id",
            "identity_user",
            "SET NULL",
        )
        _replace_foreign_key(
            cursor,
            "access_control_userroleassignment",
            "access_control_userroleassignment_revoked_by_id_fkey",
            "revoked_by_id",
            "identity_user",
            "SET NULL",
        )
        _replace_foreign_key(
            cursor,
            "admin_records",
            "admin_records_created_by_id_fkey",
            "created_by_id",
            "identity_user",
            "SET NULL",
        )
        _replace_foreign_key(
            cursor,
            "class_sections",
            "class_sections_class_teacher_id_fkey",
            "class_teacher_id",
            "identity_user",
            "SET NULL",
        )
        _replace_foreign_key(
            cursor,
            "subject_teacher_assignments",
            "subject_teacher_assignments_teacher_id_fkey",
            "teacher_id",
            "identity_user",
            "NO ACTION",
        )
        _replace_foreign_key(
            cursor,
            "student_enrollments",
            "student_enrollments_student_id_fkey",
            "student_id",
            "people_student",
            "CASCADE",
        )

        for table_name in DROP_ORDER:
            if table_name in existing_tables:
                cursor.execute(f'DROP TABLE "{table_name}"')


class Migration(migrations.Migration):
    dependencies = [
        ("access_control", "0004_repair_role_creator_foreign_key"),
        ("attendance", "0010_repair_missing_attendance_tables"),
        ("identity", "0005_repair_missing_user_columns"),
        ("people", "0026_repair_all_missing_scalar_profile_fields"),
        ("platform_core", "0004_restore_audit_event_table"),
    ]

    operations = [
        migrations.RunPython(remove_empty_legacy_tables, migrations.RunPython.noop),
    ]
