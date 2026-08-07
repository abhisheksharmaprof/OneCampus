from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("people", "0010_staffprofile_salary_details"),
    ]

    operations = [
        migrations.AddField(
            model_name="staffprofile",
            name="department",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
