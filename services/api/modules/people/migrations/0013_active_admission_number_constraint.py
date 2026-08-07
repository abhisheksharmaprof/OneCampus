from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("people", "0012_student_unique_identifier_constraints")]

    operations = [
        migrations.RemoveConstraint(
            model_name="student",
            name="uq_student_admission_number_per_institute",
        ),
        migrations.AddConstraint(
            model_name="student",
            constraint=models.UniqueConstraint(
                condition=Q(is_active=True),
                fields=("institute", "admission_number"),
                name="uq_student_admission_number_per_institute",
            ),
        ),
    ]
