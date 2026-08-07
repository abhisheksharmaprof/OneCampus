import uuid

from django.db import models

from platform_core.models import TimeStampedModel


class Enquiry(TimeStampedModel):
    class Status(models.TextChoices):
        ENQUIRY = "ENQUIRY", "Enquiry"
        VISIT_SCHEDULED = "VISIT_SCHEDULED", "Visit scheduled"
        APPLIED = "APPLIED", "Applied"
        ENROLLED = "ENROLLED", "Enrolled"
        LOST = "LOST", "Lost"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="enquiries"
    )
    branch = models.ForeignKey(
        "institutes.Branch",
        on_delete=models.PROTECT,
        related_name="enquiries",
        null=True,
        blank=True,
    )
    guardian_name = models.CharField(max_length=200)
    contact_email = models.EmailField(blank=True)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ENQUIRY)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=("institute", "branch", "status", "created_at"))]
