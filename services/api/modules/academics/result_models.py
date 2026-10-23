"""Structured assessment data, isolated from legacy academic operations."""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel


def default_result_rules():
    return {
        "grades": [
            {"label": "A+", "minimum": 90},
            {"label": "A", "minimum": 80},
            {"label": "B", "minimum": 70},
            {"label": "C", "minimum": 60},
            {"label": "D", "minimum": 40},
            {"label": "E", "minimum": 0},
        ],
        "decimals": 2,
    }


class ResultExam(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("institutes.Institute", on_delete=models.PROTECT)
    section = models.ForeignKey("academics.ClassSection", on_delete=models.PROTECT)
    term = models.ForeignKey(
        "academics.AcademicTerm", null=True, blank=True, on_delete=models.PROTECT
    )
    name = models.CharField(max_length=120)
    exam_type = models.CharField(
        max_length=20, choices=[(x, x) for x in ("UNIT_TEST", "HALF_YEARLY", "ANNUAL", "OTHER")]
    )
    exam_date = models.DateField(null=True, blank=True)
    rules = models.JSONField(default=default_result_rules)
    archived = models.BooleanField(default=False)
    legacy_operation = models.OneToOneField(
        "academics.AcademicOperation", null=True, blank=True, on_delete=models.PROTECT
    )

    class Meta:
        db_table = "result_exams"
        constraints = [
            models.UniqueConstraint(fields=("section", "name"), name="uq_result_exam_section_name")
        ]
        indexes = [models.Index(fields=("institute", "section"))]
        ordering = ("-created_at",)


class ResultExamSubject(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(ResultExam, on_delete=models.PROTECT, related_name="subjects")
    subject = models.ForeignKey("academics.Subject", on_delete=models.PROTECT)
    order = models.PositiveIntegerField(default=0)
    state = models.CharField(
        max_length=20, choices=[(x, x) for x in ("DRAFT", "SUBMITTED", "APPROVED")], default="DRAFT"
    )
    revision = models.PositiveIntegerField(default=0)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    review_note = models.TextField(blank=True)

    class Meta:
        db_table = "result_exam_subjects"
        ordering = ("order", "subject__name")
        constraints = [
            models.UniqueConstraint(fields=("exam", "subject"), name="uq_result_exam_subject")
        ]


class ResultComponent(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam_subject = models.ForeignKey(
        ResultExamSubject, on_delete=models.PROTECT, related_name="components"
    )
    name = models.CharField(max_length=60, default="Total")
    maximum = models.DecimalField(max_digits=8, decimal_places=2)
    pass_marks = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "result_components"
        ordering = ("order", "name")
        constraints = [
            models.UniqueConstraint(
                fields=("exam_subject", "name"), name="uq_result_component_name"
            ),
            models.CheckConstraint(condition=Q(maximum__gt=0), name="ck_result_max_positive"),
            models.CheckConstraint(
                condition=Q(pass_marks__gte=0) & Q(pass_marks__lte=models.F("maximum")),
                name="ck_result_pass_range",
            ),
        ]


class ResultCandidate(TimeStampedModel):
    profile = models.JSONField(default=dict, blank=True)
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(ResultExam, on_delete=models.PROTECT, related_name="candidates")
    enrollment = models.ForeignKey("academics.StudentEnrollment", on_delete=models.PROTECT)
    excluded_subject_ids = models.JSONField(default=list)
    remark = models.TextField(blank=True)

    class Meta:
        db_table = "result_candidates"
        constraints = [
            models.UniqueConstraint(fields=("exam", "enrollment"), name="uq_result_candidate")
        ]


class ResultMark(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    candidate = models.ForeignKey(ResultCandidate, on_delete=models.PROTECT, related_name="marks")
    component = models.ForeignKey(ResultComponent, on_delete=models.PROTECT, related_name="marks")
    score = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=[(x, x) for x in ("PRESENT", "ABSENT", "EXEMPT", "NOT_APPLICABLE")]
    )
    note = models.CharField(max_length=500, blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = "result_marks"
        constraints = [
            models.UniqueConstraint(fields=("candidate", "component"), name="uq_result_mark"),
            models.CheckConstraint(
                condition=(
                    Q(status="PRESENT", score__gte=0)
                    | (Q(status__in=["ABSENT", "EXEMPT", "NOT_APPLICABLE"]) & Q(score__isnull=True))
                ),
                name="ck_result_score_status",
            ),
        ]


class ResultChange(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(ResultExam, on_delete=models.PROTECT, related_name="changes")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=30)
    detail = models.JSONField(default=dict)

    class Meta:
        db_table = "result_changes"
        ordering = ("-created_at",)


class ResultImport(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    exam = models.ForeignKey(ResultExam, on_delete=models.PROTECT, related_name="imports")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    key = models.UUIDField(default=uuid.uuid4)
    filename = models.CharField(max_length=200)
    mapping = models.JSONField(default=dict)
    rows = models.JSONField(default=list)
    errors = models.JSONField(default=list)
    revisions = models.JSONField(default=dict)
    state = models.CharField(max_length=20, default="VALIDATED")
    imported_count = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "result_imports"
        constraints = [models.UniqueConstraint(fields=("exam", "key"), name="uq_result_import_key")]


class ResultReport(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("institutes.Institute", on_delete=models.PROTECT)
    section = models.ForeignKey("academics.ClassSection", on_delete=models.PROTECT)
    name = models.CharField(max_length=120)
    config = models.JSONField(default=dict)
    template = models.ForeignKey("documents.DocumentTemplate", on_delete=models.PROTECT)

    class Meta:
        db_table = "result_reports"


class ResultBatch(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("institutes.Institute", on_delete=models.PROTECT)
    section = models.ForeignKey("academics.ClassSection", on_delete=models.PROTECT)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    request_key = models.UUIDField(default=uuid.uuid4)
    config = models.JSONField(default=dict)
    template_version = models.ForeignKey(
        "documents.DocumentTemplateVersion", on_delete=models.PROTECT
    )
    state = models.CharField(max_length=20, default="QUEUED")
    issue = models.BooleanField(default=False)
    errors = models.JSONField(default=list)
    total = models.PositiveIntegerField(default=0)
    completed = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "result_batches"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(fields=("institute", "request_key"), name="uq_result_batch_key")
        ]


class ResultDocument(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    batch = models.ForeignKey(ResultBatch, on_delete=models.PROTECT, related_name="documents")
    enrollment = models.ForeignKey("academics.StudentEnrollment", on_delete=models.PROTECT)
    snapshot = models.JSONField(default=dict)
    predecessor = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True)
    # Documents are private database blobs; downloads always pass the results permission scope.
    pdf = models.BinaryField(null=True)
    error = models.TextField(blank=True)

    class Meta:
        db_table = "result_documents"
        constraints = [
            models.UniqueConstraint(fields=("batch", "enrollment"), name="uq_result_batch_student")
        ]
