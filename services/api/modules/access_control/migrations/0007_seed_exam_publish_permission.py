from django.db import migrations


def seed_permission(apps, schema_editor):
    Permission = apps.get_model("access_control", "Permission")
    Permission.objects.update_or_create(
        permission_key="assessment.publish",
        defaults={"module": "academics", "description": "Publish authorized exam setups", "is_active": True},
    )


class Migration(migrations.Migration):
    dependencies = [("access_control", "0006_seed_exam_draft_permissions")]
    operations = [migrations.RunPython(seed_permission, migrations.RunPython.noop)]
