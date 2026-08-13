from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("attendance", "0006_attendancesettings_period_wise_enabled"),
    ]

    operations = [
        migrations.AddField(
            model_name="attendancesettings",
            name="capture_mode_config",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
