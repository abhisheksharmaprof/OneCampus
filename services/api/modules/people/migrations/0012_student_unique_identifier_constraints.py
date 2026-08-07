from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("people", "0011_staffprofile_department")]

    operations = [
        migrations.AddConstraint(
            model_name="student",
            constraint=models.UniqueConstraint(
                fields=("institute", "sr_number"),
                condition=~Q(sr_number=""),
                name="uq_student_sr_number_per_institute",
            ),
        ),
        migrations.AddConstraint(
            model_name="student",
            constraint=models.UniqueConstraint(
                fields=("institute", "student_nic_id"),
                condition=~Q(student_nic_id=""),
                name="uq_student_nic_id_per_institute",
            ),
        ),
    ]
