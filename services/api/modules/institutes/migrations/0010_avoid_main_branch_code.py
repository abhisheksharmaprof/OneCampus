from django.db import migrations


def rename_main_codes(apps, schema_editor):
    Branch = apps.get_model("institutes", "Branch")
    for branch in Branch.objects.filter(code="MAIN").iterator():
        candidate = "MCA"
        suffix = 0
        while Branch.objects.filter(institute_id=branch.institute_id, code=candidate).exclude(id=branch.id).exists():
            suffix += 1
            candidate = f"MC{suffix}"
        branch.code = candidate
        branch.save(update_fields=["code"])


class Migration(migrations.Migration):
    dependencies = [("institutes", "0009_short_branch_codes")]
    operations = [migrations.RunPython(rename_main_codes, migrations.RunPython.noop)]
