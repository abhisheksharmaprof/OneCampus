from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("identity", "0005_repair_missing_user_columns"),
        ("platform_core", "0005_remove_empty_legacy_tables"),
    ]

    operations = [
        migrations.AlterModelTable(name="user", table="users"),
    ]
