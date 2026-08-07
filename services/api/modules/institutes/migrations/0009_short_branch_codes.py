import re

from django.db import migrations


def short_code(name, used):
    words = re.findall(r"[A-Za-z0-9]+", (name or "Branch").upper())
    initials = "".join(word[0] for word in words)
    compact = "".join(words)
    base = (initials if len(initials) >= 3 else compact)[:4]
    base = (base + "XXX")[:4]
    if len(base) < 3:
        base = (base + "XXX")[:3]
    if base == "MAIN":
        base = "MCA"
    code = base
    suffix = 0
    while code in used:
        suffix += 1
        code = f"{base[:3]}{suffix % 10}"
    used.add(code)
    return code


def replace_branch_codes(apps, schema_editor):
    Institute = apps.get_model("institutes", "Institute")
    Branch = apps.get_model("institutes", "Branch")
    for institute in Institute.objects.all().iterator():
        used = set()
        branches = list(Branch.objects.filter(institute_id=institute.id).order_by("is_head_office", "created_at", "id"))
        for branch in branches:
            branch.code = short_code(branch.name, used)
            branch.save(update_fields=["code"])


class Migration(migrations.Migration):
    dependencies = [("institutes", "0008_backfill_head_office")]
    operations = [migrations.RunPython(replace_branch_codes, migrations.RunPython.noop)]
