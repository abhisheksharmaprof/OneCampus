from django.db import migrations, models
import modules.people.models


class Migration(migrations.Migration):
    dependencies = [("people", "0006_staffprofile_availability_times")]

    operations = [migrations.AddField(model_name="staffprofile", name="available_periods", field=models.JSONField(default=modules.people.models.default_teacher_available_periods))]
