"""Remove integration columns left behind by the state-only 0003 migration."""

from django.db import migrations

LEGACY_COLUMNS = ("source_provider", "source_event_id")
LEGACY_CONSTRAINT = "uq_calendar_external_event"


def remove_legacy_columns_if_present(apps, schema_editor):
    model = apps.get_model("school_calendar", "AcademicCalendarEvent")
    connection = schema_editor.connection
    table_name = model._meta.db_table
    with connection.cursor() as cursor:
        columns = {
            column.name
            for column in connection.introspection.get_table_description(cursor, table_name)
        }
    quote = connection.ops.quote_name

    if any(column in columns for column in LEGACY_COLUMNS):
        if connection.vendor == "sqlite":
            schema_editor.execute(f"DROP INDEX IF EXISTS {quote(LEGACY_CONSTRAINT)}")
        else:
            schema_editor.execute(
                f"ALTER TABLE {quote(table_name)} DROP CONSTRAINT IF EXISTS "
                f"{quote(LEGACY_CONSTRAINT)}"
            )

    for column_name in LEGACY_COLUMNS:
        if column_name in columns:
            schema_editor.execute(
                f"ALTER TABLE {quote(table_name)} DROP COLUMN {quote(column_name)}"
            )


class Migration(migrations.Migration):
    dependencies = [("school_calendar", "0004_restore_academic_calendar_event")]

    operations = [
        migrations.RunPython(
            remove_legacy_columns_if_present,
            migrations.RunPython.noop,
        ),
    ]
