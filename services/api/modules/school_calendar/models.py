import uuid

from django.db import models

from platform_core.models import TimeStampedModel


class AcademicCalendarEvent(TimeStampedModel):
    class EventType(models.TextChoices):
        EXAM = "EXAM", "Exam"
        HOLIDAY = "HOLIDAY", "Holiday"
        PTM = "PTM", "Parent-teacher meeting"
        EVENT = "EVENT", "Event"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="calendar_events"
    )
    branch = models.ForeignKey(
        "institutes.Branch",
        on_delete=models.CASCADE,
        related_name="calendar_events",
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=250)
    event_type = models.CharField(max_length=16, choices=EventType.choices)
    starts_on = models.DateField()
    ends_on = models.DateField()

    class Meta:
        ordering = ("starts_on", "title")
        indexes = [models.Index(fields=("institute", "starts_on"))]
