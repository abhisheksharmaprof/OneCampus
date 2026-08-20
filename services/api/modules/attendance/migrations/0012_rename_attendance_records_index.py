from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("attendance", "0011_use_generic_attendance_tables")]

    operations = [
        migrations.RenameIndex(
            model_name="studentattendance",
            new_name="attendance__institu_b84f8b_idx",
            old_name="attendance__institu_3bb326_idx",
        ),
    ]
