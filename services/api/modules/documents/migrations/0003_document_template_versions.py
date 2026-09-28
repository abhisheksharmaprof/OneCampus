import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0002_repair_missing_document_template"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="DocumentTemplateVersion",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("version", models.PositiveIntegerField()),
                ("name", models.CharField(max_length=120)),
                ("layout", models.JSONField()),
                (
                    "institute",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="document_template_versions",
                        to="institutes.institute",
                    ),
                ),
                (
                    "published_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "template",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="versions",
                        to="documents.documenttemplate",
                    ),
                ),
            ],
            options={
                "ordering": ("-version",),
                "constraints": [
                    models.UniqueConstraint(
                        fields=("template", "version"), name="uq_document_template_version"
                    )
                ],
            },
        ),
        migrations.AddField(
            model_name="documenttemplate",
            name="published_version",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="+",
                to="documents.documenttemplateversion",
            ),
        ),
    ]
