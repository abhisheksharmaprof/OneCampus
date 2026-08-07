from django.db import migrations


def create_missing_head_offices(apps, schema_editor):
    Institute = apps.get_model("institutes", "Institute")
    Branch = apps.get_model("institutes", "Branch")
    for institute in Institute.objects.all().iterator():
        if Branch.objects.filter(institute_id=institute.id, is_head_office=True).exists():
            continue
        code = "MAIN"
        if Branch.objects.filter(institute_id=institute.id, code=code).exists():
            code = "HQ"
        Branch.objects.create(
            institute_id=institute.id,
            name=institute.display_name or institute.name,
            code=code,
            is_head_office=True,
            city=institute.city,
            state=institute.state,
        )


class Migration(migrations.Migration):
    dependencies = [("institutes", "0007_platform_identity")]

    operations = [migrations.RunPython(create_missing_head_offices, migrations.RunPython.noop)]
