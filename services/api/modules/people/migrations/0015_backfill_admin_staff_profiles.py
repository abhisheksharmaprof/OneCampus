from django.db import migrations


def create_admin_staff_profiles(apps, schema_editor):
    InstituteMembership = apps.get_model("institutes", "InstituteMembership")
    StaffProfile = apps.get_model("people", "StaffProfile")
    memberships = InstituteMembership.objects.filter(
        is_active=True, role__in={"INSTITUTE_ADMIN", "BRANCH_ADMIN"}
    )
    existing = set(StaffProfile.objects.values_list("institute_id", "user_id"))
    StaffProfile.objects.bulk_create([
        StaffProfile(
            institute_id=membership.institute_id,
            user_id=membership.user_id,
            department="Administration",
            invite_pending=False,
        )
        for membership in memberships
        if (membership.institute_id, membership.user_id) not in existing
    ])


class Migration(migrations.Migration):
    dependencies = [("people", "0014_remove_inactive_student_guardian_links")]
    operations = [migrations.RunPython(create_admin_staff_profiles, migrations.RunPython.noop)]
