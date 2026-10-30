from django.db import migrations


def backfill_admin_staff_profiles(apps, schema_editor):
    InstituteMembership = apps.get_model("institutes", "InstituteMembership")
    StaffProfile = apps.get_model("people", "StaffProfile")
    existing = set(StaffProfile.objects.values_list("institute_id", "user_id"))
    profiles = [
        StaffProfile(
            institute_id=membership.institute_id,
            user_id=membership.user_id,
            department="Administration",
            invite_pending=False,
        )
        for membership in InstituteMembership.objects.filter(
            is_active=True, role__in={"INSTITUTE_ADMIN", "BRANCH_ADMIN"}
        )
        if (membership.institute_id, membership.user_id) not in existing
    ]
    StaffProfile.objects.bulk_create(profiles)


class Migration(migrations.Migration):
    dependencies = [("people", "0029_repair_missing_staff_invitation_table")]
    operations = [migrations.RunPython(backfill_admin_staff_profiles, migrations.RunPython.noop)]
