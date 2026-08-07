from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("people", "0005_staffprofile_available_days_and_more")]

    operations = [
        migrations.AddField(
            model_name="staffprofile",
            name="availability_start_time",
            field=models.TimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="staffprofile",
            name="availability_end_time",
            field=models.TimeField(blank=True, null=True),
        ),
    ]
