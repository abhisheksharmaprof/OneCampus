from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [("school_calendar", "0001_initial")]
    operations = [
        migrations.AddField(model_name="academiccalendarevent", name="source_provider", field=models.CharField(blank=True, max_length=24)),
        migrations.AddField(model_name="academiccalendarevent", name="source_event_id", field=models.CharField(blank=True, max_length=512)),
        migrations.AddConstraint(model_name="academiccalendarevent", constraint=models.UniqueConstraint(condition=~models.Q(source_event_id=""), fields=("institute", "source_provider", "source_event_id"), name="uq_calendar_external_event")),
        migrations.CreateModel(name="CalendarIntegrationConnection", fields=[
            ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)), ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
            ("provider", models.CharField(choices=[("google", "Google Calendar"), ("microsoft", "Outlook / Microsoft 365"), ("ics", "ICS subscription")], max_length=24)), ("account_email", models.EmailField(blank=True, max_length=254)), ("calendar_id", models.CharField(blank=True, max_length=512)), ("calendar_name", models.CharField(blank=True, max_length=250)), ("encrypted_access_token", models.TextField(blank=True)), ("encrypted_refresh_token", models.TextField(blank=True)), ("token_expires_at", models.DateTimeField(blank=True, null=True)), ("subscription_url", models.URLField(blank=True)), ("is_active", models.BooleanField(default=True)), ("last_synced_at", models.DateTimeField(blank=True, null=True)), ("last_error", models.TextField(blank=True)),
            ("institute", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="calendar_connections", to="institutes.institute")),
        ], options={"constraints": [models.UniqueConstraint(fields=("institute", "provider"), name="uq_calendar_connection_provider")]}),
        migrations.CreateModel(name="CalendarOAuthState", fields=[
            ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)), ("state", models.CharField(max_length=128, unique=True)), ("expires_at", models.DateTimeField()), ("used_at", models.DateTimeField(blank=True, null=True)), ("provider", models.CharField(choices=[("google", "Google Calendar"), ("microsoft", "Outlook / Microsoft 365"), ("ics", "ICS subscription")], max_length=24)),
            ("institute", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="institutes.institute")), ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="identity.user")),
        ]),
    ]
