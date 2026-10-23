from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0023_resultbatch_resultdocument_resultexam_resultchange_and_more")
    ]
    operations = [
        migrations.AddField(
            model_name="resultcandidate",
            name="profile",
            field=models.JSONField(default=dict, blank=True),
        )
    ]
