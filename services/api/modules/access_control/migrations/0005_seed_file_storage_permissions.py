from django.db import migrations


FILE_PERMISSIONS = (
    ("files.view", "View authorized file metadata and request access grants"),
    ("files.upload", "Upload files for authorized owners and scopes"),
    ("files.delete", "Soft-delete and restore authorized files"),
    ("files.publish", "Publish policy-approved institute branding"),
)


def seed_file_permissions(apps, schema_editor):
    Permission = apps.get_model("access_control", "Permission")
    Role = apps.get_model("access_control", "Role")
    RolePermission = apps.get_model("access_control", "RolePermission")

    permissions = {}
    for key, description in FILE_PERMISSIONS:
        permission, _ = Permission.objects.update_or_create(
            permission_key=key,
            defaults={"module": "files", "description": description, "is_active": True},
        )
        permissions[key] = permission

    for role in Role.objects.filter(name__in=("Institute Admin", "Branch Admin")):
        keys = {"files.view", "files.upload", "files.delete"}
        if role.name == "Institute Admin":
            keys.add("files.publish")
        RolePermission.objects.bulk_create(
            [RolePermission(role=role, permission=permissions[key]) for key in keys],
            ignore_conflicts=True,
        )


class Migration(migrations.Migration):
    dependencies = [("access_control", "0004_repair_role_creator_foreign_key")]

    operations = [
        migrations.RunPython(seed_file_permissions, migrations.RunPython.noop),
    ]
