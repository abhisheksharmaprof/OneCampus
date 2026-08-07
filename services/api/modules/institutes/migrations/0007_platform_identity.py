from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("institutes", "0006_instituteassociation")]
    operations = [
        migrations.AddField(model_name="institute", name="slug", field=models.SlugField(blank=True, max_length=80, null=True, unique=True)),
        migrations.AddField(model_name="institute", name="approved_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="institute", name="logo_url", field=models.URLField(blank=True)),
        migrations.AddField(model_name="institute", name="brand_color", field=models.CharField(default="#2457D6", max_length=7)),
        migrations.AddField(model_name="institute", name="approved_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="approved_institutes", to=settings.AUTH_USER_MODEL)),
    ]
