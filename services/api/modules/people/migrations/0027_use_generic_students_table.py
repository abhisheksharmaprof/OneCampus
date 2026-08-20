from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("people", "0026_repair_all_missing_scalar_profile_fields"),
        ("platform_core", "0005_remove_empty_legacy_tables"),
    ]

    operations = [
        migrations.AlterModelTable(name="student", table="students"),
    ]
