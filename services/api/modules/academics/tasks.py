from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import ResultBatch, ResultDocument


@shared_task(acks_late=True, reject_on_worker_lost=True)
def render_result_batch(batch_id):
    from .results.pdf import render_marksheet

    with transaction.atomic():
        batch = ResultBatch.objects.select_for_update().get(pk=batch_id)
        if batch.state == "COMPLETED":
            return
        if batch.state == "RUNNING" and batch.updated_at > timezone.now() - timedelta(minutes=10):
            return
        batch.state = "RUNNING"
        batch.errors = []
        batch.save()
    for document_id in batch.documents.filter(pdf__isnull=True).values_list("id", flat=True):
        document = ResultDocument.objects.get(pk=document_id)
        try:
            document.pdf = render_marksheet(document.snapshot)
            document.error = ""
        except Exception:
            document.error = "This marksheet could not be rendered. Check its template and retry."
        document.save(update_fields=["pdf", "error", "updated_at"])
        ResultBatch.objects.filter(pk=batch_id).update(
            completed=batch.documents.filter(pdf__isnull=False).count(), updated_at=timezone.now()
        )
    errors = list(batch.documents.exclude(error="").values_list("error", flat=True))
    ResultBatch.objects.filter(pk=batch_id).update(
        state="FAILED" if errors else "COMPLETED", errors=errors, updated_at=timezone.now()
    )
