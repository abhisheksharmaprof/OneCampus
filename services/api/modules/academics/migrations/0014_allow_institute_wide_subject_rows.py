"""Allow current institute-wide subjects in legacy schemas with branch_id."""

from django.db import migrations


def make_legacy_branch_nullable(apps, schema_editor):
    connection = schema_editor.connection
    table = connection.ops.quote_name("subjects")
    column = connection.ops.quote_name("branch_id")
    with connection.cursor() as cursor:
        columns = {
            item.name
            for item in connection.introspection.get_table_description(cursor, "subjects")
        }
    if "branch_id" not in columns:
        return
    if connection.vendor == "postgresql":
        schema_editor.execute(f"ALTER TABLE {table} ALTER COLUMN {column} DROP NOT NULL")


class Migration(migrations.Migration):
    dependencies = [("academics", "0013_allow_institute_wide_class_rows")]

    operations = [
        migrations.RunPython(make_legacy_branch_nullable, migrations.RunPython.noop),
    ]
