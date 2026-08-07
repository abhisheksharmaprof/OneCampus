import uuid

from django.db import migrations


PERMISSIONS = (
    ("institute.manage_settings", "institute", "Edit institute profile, branding, and academic configuration"),
    ("institute.manage_branches", "institute", "Create, edit, or deactivate branches"),
    ("institute.view_all_branches", "institute", "View data across every branch of the institute"),
    ("staff.invite", "staff", "Invite new staff members"),
    ("staff.manage", "staff", "Edit or deactivate staff accounts"),
    ("role.create", "roles", "Create custom roles"),
    ("role.assign", "roles", "Assign roles to users"),
    ("role.manage_permissions", "roles", "Edit which permissions a role grants"),
    ("student.create", "students", "Add new students"),
    ("student.edit", "students", "Edit student profiles"),
    ("student.delete", "students", "Deactivate/withdraw a student"),
    ("student.view", "students", "View student profiles"),
    ("attendance.mark", "attendance", "Mark daily attendance"),
    ("attendance.edit", "attendance", "Edit previously marked attendance"),
    ("attendance.view_own_class", "attendance", "View attendance for own assigned class(es)"),
    ("attendance.view_branch", "attendance", "View attendance across a branch"),
    ("attendance.view_institute", "attendance", "View attendance across all branches"),
    ("assessment.create", "academics", "Create assessments/exams"),
    ("marks.enter", "academics", "Enter marks for own subject/class"),
    ("marks.publish", "academics", "Publish marks so parents can see them"),
    ("marks.view_own_class", "academics", "View marks for own assigned class(es)"),
    ("marks.view_branch", "academics", "View marks across a branch"),
    ("marks.view_institute", "academics", "View marks across all branches"),
    ("circular.post_class", "communication", "Post a circular to a specific class"),
    ("circular.post_branch", "communication", "Post a circular to a whole branch"),
    ("circular.post_institute", "communication", "Post a circular institute-wide"),
    ("leaderboard.view", "leaderboard", "View leaderboards"),
    ("leaderboard.configure", "leaderboard", "Configure leaderboard visibility and scope"),
    ("points.award_manual", "leaderboard", "Manually award points or batches to a student"),
    ("reports.view_branch", "reports", "View analytics/reports for a branch"),
    ("reports.view_institute", "reports", "View analytics/reports across all branches"),
)

ROLES = (
    ("00000000-0000-0000-0000-000000000001", "Institute Admin", "Full control within one institute, across all its branches"),
    ("00000000-0000-0000-0000-000000000002", "Branch Admin", "Full control within one branch only"),
    ("00000000-0000-0000-0000-000000000003", "Teacher", "Manages attendance, marks, and remarks for assigned classes"),
    ("00000000-0000-0000-0000-000000000004", "Parent", "Views their own child/children only"),
)

BRANCH_ADMIN_EXCLUSIONS = {
    "institute.manage_branches",
    "institute.view_all_branches",
    "attendance.view_institute",
    "marks.view_institute",
    "reports.view_institute",
    "circular.post_institute",
}
TEACHER_PERMISSIONS = {
    "attendance.mark",
    "attendance.view_own_class",
    "marks.enter",
    "marks.view_own_class",
    "circular.post_class",
    "student.view",
    "points.award_manual",
    "leaderboard.view",
}
PARENT_PERMISSIONS = {
    "attendance.view_own_class",
    "marks.view_own_class",
    "leaderboard.view",
}


def seed_access_control(apps, schema_editor):
    Permission = apps.get_model("access_control", "Permission")
    Role = apps.get_model("access_control", "Role")
    RolePermission = apps.get_model("access_control", "RolePermission")

    permission_by_key = {}
    for key, module, description in PERMISSIONS:
        item, _ = Permission.objects.update_or_create(
            permission_key=key,
            defaults={"module": module, "description": description, "is_active": True},
        )
        permission_by_key[key] = item

    role_by_name = {}
    for role_id, name, description in ROLES:
        role, _ = Role.objects.update_or_create(
            id=uuid.UUID(role_id),
            defaults={
                "name": name,
                "description": description,
                "is_system_role": True,
                "is_active": True,
                "institute_id": None,
                "branch_id": None,
            },
        )
        role_by_name[name] = role

    grants = {
        "Institute Admin": set(permission_by_key),
        "Branch Admin": set(permission_by_key) - BRANCH_ADMIN_EXCLUSIONS,
        "Teacher": TEACHER_PERMISSIONS,
        "Parent": PARENT_PERMISSIONS,
    }
    for role_name, keys in grants.items():
        role = role_by_name[role_name]
        RolePermission.objects.filter(role=role).exclude(
            permission__permission_key__in=keys
        ).delete()
        RolePermission.objects.bulk_create(
            [
                RolePermission(role=role, permission=permission_by_key[key])
                for key in keys
            ],
            ignore_conflicts=True,
        )


class Migration(migrations.Migration):
    dependencies = [("access_control", "0001_initial")]

    operations = [migrations.RunPython(seed_access_control, migrations.RunPython.noop)]
