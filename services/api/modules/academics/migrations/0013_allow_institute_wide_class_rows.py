"""Allow current institute-wide classes in legacy schemas with branch_id."""

from django.db import migrations


def make_legacy_branch_nullable(apps, schema_editor):
    connection = schema_editor.connection
    table = connection.ops.quote_name("classes")
    column = connection.ops.quote_name("branch_id")
    with connection.cursor() as cursor:
        columns = {
            item.name
            for item in connection.introspection.get_table_description(cursor, "classes")
        }
    if "branch_id" not in columns:
        return
    if connection.vendor == "postgresql":
        schema_editor.execute(f"ALTER TABLE {table} ALTER COLUMN {column} DROP NOT NULL")
    elif connection.vendor == "sqlite":
        # SQLite cannot alter nullability in place; the test schema is rebuilt by
        # Django migrations, while PostgreSQL is the supported dev runtime.
        return


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0012_repair_missing_academic_tables"),
    ]

    operations = [
        migrations.RunPython(make_legacy_branch_nullable, migrations.RunPython.noop),
    ]
