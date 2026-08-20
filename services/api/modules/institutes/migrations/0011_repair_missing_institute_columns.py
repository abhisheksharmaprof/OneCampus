from django.db import migrations


def restore_missing_columns(apps, schema_editor):
    model = apps.get_model("institutes", "Institute")
    connection = schema_editor.connection
    existing = {
        column.name
        for column in connection.introspection.get_table_description(
            connection.cursor(), model._meta.db_table
        )
    }

    # Some deployments recorded the historical migrations while the database
    # schema was only partially provisioned. Add only columns that are absent;
    # this is safe for databases that already have the complete schema.
    for field in model._meta.local_fields:
        if field.column not in existing:
            schema_editor.add_field(model, field)


class Migration(migrations.Migration):
    dependencies = [("institutes", "0010_avoid_main_branch_code")]

    operations = [migrations.RunPython(restore_missing_columns, migrations.RunPython.noop)]
