from django.db import migrations


def restore_missing_user_columns(apps, schema_editor):
    model = apps.get_model("identity", "User")
    existing = {
        column.name
        for column in schema_editor.connection.introspection.get_table_description(
            schema_editor.connection.cursor(), model._meta.db_table
        )
    }
    for field in model._meta.local_fields:
        if field.column not in existing:
            schema_editor.add_field(model, field)


class Migration(migrations.Migration):
    dependencies = [("identity", "0004_user_phone_verified_at_user_user_type")]

    operations = [migrations.RunPython(restore_missing_user_columns, migrations.RunPython.noop)]
