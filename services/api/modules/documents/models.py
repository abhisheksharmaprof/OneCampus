import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel


class DocumentTemplate(TimeStampedModel):
    """A canvas document template (layout JSON v2) for any printable school document."""

    class Category(models.TextChoices):
        FEE_INVOICE = "FEE_INVOICE", "Fee invoice"
        FEE_RECEIPT = "FEE_RECEIPT", "Fee receipt"
        MARKSHEET = "MARKSHEET", "Mark sheet"
        ID_CARD = "ID_CARD", "ID card"
        CERTIFICATE = "CERTIFICATE", "Certificate"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="document_templates"
    )
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=Category.choices)
    layout = models.JSONField(default=dict, blank=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "category"),
                condition=Q(is_default=True),
                name="uq_default_document_template_per_category",
            )
        ]
        indexes = [models.Index(fields=("institute", "category"))]
