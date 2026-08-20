from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("people", "0027_use_generic_students_table")]

    operations = [
        migrations.RenameIndex(
            model_name="student",
            new_name="students_institu_ed0130_idx",
            old_name="people_stud_institu_51d408_idx",
        ),
    ]
