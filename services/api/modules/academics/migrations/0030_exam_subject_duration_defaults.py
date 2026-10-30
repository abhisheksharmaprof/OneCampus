from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0029_exam_paper_resources"),
    ]

    operations = [
        migrations.AlterField(
            model_name="examsubjectselection",
            name="theory_max",
            field=models.DecimalField(blank=True, decimal_places=2, default=100, max_digits=6, null=True),
        ),
        migrations.AlterField(
            model_name="examsubjectselection",
            name="pass_marks",
            field=models.DecimalField(blank=True, decimal_places=2, default=33, max_digits=6, null=True),
        ),
        migrations.AddField(
            model_name="examsubjectselection",
            name="duration_minutes",
            field=models.PositiveSmallIntegerField(default=180),
        ),
    ]
