from django.db import migrations


def assign_admin_employee_codes(apps, schema_editor):
    StaffProfile = apps.get_model("people", "StaffProfile")
    InstituteMembership = apps.get_model("institutes", "InstituteMembership")
    admin_memberships = InstituteMembership.objects.filter(
        role__in={"INSTITUTE_ADMIN", "BRANCH_ADMIN"},
        is_active=True,
    ).values("institute_id", "user_id")
    pairs = {(row["institute_id"], row["user_id"]) for row in admin_memberships}
    for profile in StaffProfile.objects.filter(employee_code=""):
        if (profile.institute_id, profile.user_id) in pairs:
            profile.employee_code = f"ADM-{str(profile.user_id).replace('-', '')[:8].upper()}"
            profile.save(update_fields=["employee_code"])


class Migration(migrations.Migration):
    dependencies = [("people", "0015_backfill_admin_staff_profiles")]
    operations = [migrations.RunPython(assign_admin_employee_codes, migrations.RunPython.noop)]
