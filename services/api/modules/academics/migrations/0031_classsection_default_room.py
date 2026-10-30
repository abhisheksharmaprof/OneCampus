from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0030_exam_subject_duration_defaults"),
    ]

    operations = [
        migrations.AddField(
            model_name="classsection",
            name="default_room",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="class_sections",
                to="academics.room",
            ),
        ),
    ]
