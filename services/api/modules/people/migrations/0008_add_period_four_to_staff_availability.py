from django.db import migrations


def add_period_four(apps, schema_editor):
    StaffProfile = apps.get_model("people", "StaffProfile")
    for profile in StaffProfile.objects.all().iterator():
        periods = list(profile.available_periods or [])
        if 4 not in periods:
            profile.available_periods = sorted([*periods, 4])
            profile.save(update_fields=["available_periods", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [("people", "0007_staffprofile_available_periods")]
    operations = [migrations.RunPython(add_period_four, migrations.RunPython.noop)]
