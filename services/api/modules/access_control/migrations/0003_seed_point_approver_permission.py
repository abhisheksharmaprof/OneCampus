from django.db import migrations


def add_permission(apps, schema_editor):
    Permission = apps.get_model("access_control", "Permission")
    Permission.objects.get_or_create(
        permission_key="points.approve_manual_award",
        defaults={
            "module": "leaderboard",
            "description": "Approve manual point awards above the configured threshold",
            "is_active": True,
        },
    )


class Migration(migrations.Migration):
    dependencies = [("access_control", "0002_seed_permission_catalog")]
    operations = [migrations.RunPython(add_permission, migrations.RunPython.noop)]
