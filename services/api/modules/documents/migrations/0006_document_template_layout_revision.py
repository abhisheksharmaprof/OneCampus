from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("documents", "0005_letterhead_template_category")]

    operations = [
        migrations.AddField(
            model_name="documenttemplate",
            name="layout_revision",
            field=models.PositiveIntegerField(default=1),
        ),
    ]
