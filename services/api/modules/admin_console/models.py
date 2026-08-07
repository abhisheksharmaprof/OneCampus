import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel

from .registry import SCREEN_ID_CHOICES, SCREEN_IDS


class AdminRecord(TimeStampedModel):
    """Tenant-owned structured data for an admin specification screen."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute",
        on_delete=models.CASCADE,
        related_name="admin_records",
    )
    branch = models.ForeignKey(
        "institutes.Branch",
        on_delete=models.CASCADE,
        related_name="admin_records",
        null=True,
        blank=True,
    )
    screen_id = models.CharField(max_length=4, choices=SCREEN_ID_CHOICES)
    record_type = models.CharField(max_length=64)
    title = models.CharField(max_length=240)
    status = models.CharField(max_length=64)
    data = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_admin_records",
        null=True,
        blank=True,
    )
    version = models.PositiveBigIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        app_label = "admin_console"
        db_table = "admin_records"
        ordering = ("-updated_at", "-created_at", "id")
        indexes = [
            models.Index(
                fields=("institute", "screen_id", "is_active", "-updated_at"),
                name="admrec_tenant_screen_idx",
            ),
            models.Index(
                fields=("institute", "branch", "screen_id", "is_active"),
                name="admrec_branch_screen_idx",
            ),
            models.Index(
                fields=("institute", "screen_id", "status", "is_active"),
                name="admrec_screen_status_idx",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(screen_id__in=SCREEN_IDS), name="ck_admrec_valid_screen"
            ),
            models.CheckConstraint(condition=Q(version__gte=1), name="ck_admrec_version_gte_1"),
            models.CheckConstraint(condition=~Q(record_type=""), name="ck_admrec_type_not_empty"),
            models.CheckConstraint(condition=~Q(title=""), name="ck_admrec_title_not_empty"),
            models.CheckConstraint(condition=~Q(status=""), name="ck_admrec_status_not_empty"),
        ]

    def clean(self):
        errors = {}
        if self.branch_id and self.institute_id:
            branch_institute_id = self.branch.institute_id
            if branch_institute_id != self.institute_id:
                errors["branch"] = "Branch must belong to the selected institute."
        if not isinstance(self.data, dict):
            errors["data"] = "Data must be a JSON object."
        if errors:
            raise ValidationError(errors)
