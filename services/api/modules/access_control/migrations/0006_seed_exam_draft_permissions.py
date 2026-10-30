from django.db import migrations


EXAM_PERMISSIONS = (
    ("assessment.view", "View authorized exam drafts"),
    ("assessment.edit", "Edit authorized exam drafts"),
)


def seed_exam_permissions(apps, schema_editor):
    Permission = apps.get_model("access_control", "Permission")
    for permission_key, description in EXAM_PERMISSIONS:
        Permission.objects.update_or_create(
            permission_key=permission_key,
            defaults={
                "module": "academics",
                "description": description,
                "is_active": True,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("access_control", "0005_seed_file_storage_permissions")]

    operations = [migrations.RunPython(seed_exam_permissions, migrations.RunPython.noop)]
