from django.db import migrations


def remove_inactive_student_links(apps, schema_editor):
    StudentGuardian = apps.get_model("people", "StudentGuardian")
    StudentGuardian.objects.filter(student__is_active=False).delete()


class Migration(migrations.Migration):
    dependencies = [("people", "0013_active_admission_number_constraint")]

    operations = [
        migrations.RunPython(remove_inactive_student_links, migrations.RunPython.noop),
    ]
