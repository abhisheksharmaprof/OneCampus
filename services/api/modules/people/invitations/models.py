import hmac
import uuid

from django.db import models
from django.utils import timezone
from django.utils.crypto import salted_hmac


class StaffInvitation(models.Model):
    class DeliveryStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        FAILED = "FAILED", "Failed"

    DEFAULT_MAX_ATTEMPTS = 5

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    staff_profile = models.ForeignKey(
        "people.StaffProfile",
        on_delete=models.CASCADE,
        related_name="staff_invitations",
    )
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=DEFAULT_MAX_ATTEMPTS)
    consumed_at = models.DateTimeField(null=True, blank=True)
    invalidated_at = models.DateTimeField(null=True, blank=True)
    delivery_status = models.CharField(
        max_length=16,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.PENDING,
    )
    delivery_attempted_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "people"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=("staff_profile", "created_at"),
                name="people_inv_staff_created_idx",
            ),
            models.Index(fields=("expires_at",), name="people_inv_expires_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(max_attempts__gte=1),
                name="ck_staff_invitation_max_attempts",
            ),
            models.UniqueConstraint(
                fields=("staff_profile",),
                condition=models.Q(consumed_at__isnull=True, invalidated_at__isnull=True),
                name="uq_active_staff_invitation",
            ),
        ]

    def hash_secret(self, secret):
        return salted_hmac(
            "people.staff-invitation",
            f"{self.id}:{secret}",
            algorithm="sha256",
        ).hexdigest()

    def secret_matches(self, secret):
        return hmac.compare_digest(self.token_hash, self.hash_secret(secret))

    def is_available(self, at=None):
        now = at or timezone.now()
        return (
            self.consumed_at is None
            and self.invalidated_at is None
            and self.attempts < self.max_attempts
            and self.expires_at > now
        )
