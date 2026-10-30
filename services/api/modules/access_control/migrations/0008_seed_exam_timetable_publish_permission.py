from django.db import migrations


def seed_permission(apps, schema_editor):
    Permission = apps.get_model("access_control", "Permission")
    Permission.objects.update_or_create(
        permission_key="assessment.timetable.publish",
        defaults={
            "module": "academics",
            "description": "Publish validated exam timetables",
            "is_active": True,
        },
    )


class Migration(migrations.Migration):
    dependencies = [("access_control", "0007_seed_exam_publish_permission")]
    operations = [migrations.RunPython(seed_permission, migrations.RunPython.noop)]
