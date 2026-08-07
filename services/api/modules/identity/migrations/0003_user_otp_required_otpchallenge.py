import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("identity", "0002_user_uq_user_email_ci"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="otp_required",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="OtpChallenge",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("code_hash", models.CharField(max_length=64)),
                ("client", models.CharField(max_length=20)),
                ("institute_id", models.UUIDField(blank=True, null=True)),
                ("expires_at", models.DateTimeField()),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("max_attempts", models.PositiveSmallIntegerField(default=5)),
                ("consumed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="otp_challenges",
                        to="identity.user",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
                "indexes": [
                    models.Index(
                        fields=["user", "created_at"],
                        name="identity_ot_user_id_786868_idx",
                    )
                ],
            },
        ),
    ]
