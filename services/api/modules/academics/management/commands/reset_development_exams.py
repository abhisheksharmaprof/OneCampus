import os
import uuid

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from django.db.models.deletion import Collector

from modules.academics.models import AcademicOperation
from modules.institutes.models import Institute


def database_identity(connection):
    config = connection.settings_dict
    host = config.get("HOST") or "local-socket"
    port = config.get("PORT") or "default"
    name = config.get("NAME") or "unnamed"
    return f"{connection.vendor}:{host}:{port}/{name}"


def dependent_deletion_counts(collector, allowed_model):
    counts = {}
    for model, instances in collector.data.items():
        count = len(instances)
        if count and model is not allowed_model:
            counts[model._meta.label] = counts.get(model._meta.label, 0) + count
    for queryset in collector.fast_deletes:
        count = queryset.count()
        if count and queryset.model is not allowed_model:
            label = queryset.model._meta.label
            counts[label] = counts.get(label, 0) + count
    for (field, _value), batches in collector.field_updates.items():
        for batch in batches:
            if hasattr(batch, "model"):
                count = batch.count()
                model = batch.model
            else:
                count = len(batch)
                model = batch[0].__class__ if batch else field.model
            if count and model is not allowed_model:
                label = model._meta.label
                counts[label] = counts.get(label, 0) + count
    return counts


class Command(BaseCommand):
    help = (
        "Dry-run or delete generic development AcademicOperation EXAM rows "
        "for explicit institutes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--institute-id",
            action="append",
            type=uuid.UUID,
            required=True,
            help="Institute UUID to include; repeat for each approved institute.",
        )
        parser.add_argument("--database", default="default")
        parser.add_argument("--apply", action="store_true", help="Apply the bounded deletion.")
        parser.add_argument(
            "--confirm-target",
            help="Required with --apply; must exactly match the displayed database identity.",
        )

    def handle(self, *args, **options):
        alias = options["database"]
        if alias not in connections:
            raise CommandError(f"Unknown database alias: {alias}")
        connection = connections[alias]
        identity = database_identity(connection)
        institute_ids = list(
            dict.fromkeys(uuid.UUID(str(value)) for value in options["institute_id"])
        )
        existing = set(
            Institute.objects.using(alias)
            .filter(id__in=institute_ids)
            .values_list("id", flat=True)
        )
        missing = sorted(set(institute_ids) - existing)
        if missing:
            raise CommandError("One or more explicitly requested institute IDs do not exist.")

        self.stdout.write(f"Database: {identity}")
        self.stdout.write(f"Mode: {'APPLY' if options['apply'] else 'DRY RUN'}")
        total = 0
        for institute_id in institute_ids:
            count = AcademicOperation.objects.using(alias).filter(
                institute_id=institute_id, kind=AcademicOperation.Kind.EXAM
            ).count()
            self.stdout.write(f"Institute {institute_id}: {count} generic EXAM rows")
            total += count

        if not options["apply"]:
            self.stdout.write(f"Dry run complete; {total} generic EXAM rows are in scope.")
            return

        if os.getenv("DJANGO_ENV", "development").lower() != "development" or not settings.DEBUG:
            raise CommandError("Apply is restricted to DEBUG development settings.")
        if options["confirm_target"] != identity:
            raise CommandError(
                "--confirm-target must exactly match the displayed database identity."
            )

        with transaction.atomic(using=alias):
            rows = list(
                AcademicOperation.objects.using(alias)
                .select_for_update()
                .filter(institute_id__in=institute_ids, kind=AcademicOperation.Kind.EXAM)
                .order_by("institute_id", "id")
            )
            collector = Collector(using=alias)
            collector.collect(rows)
            unexpected = dependent_deletion_counts(collector, AcademicOperation)
            if unexpected:
                summary = ", ".join(
                    f"{model}={count}" for model, count in sorted(unexpected.items())
                )
                raise CommandError(
                    "Refusing deletion because the collector includes related non-EXAM data: "
                    + summary
                )
            collector.delete()

        self.stdout.write(
            f"Deleted {len(rows)} generic EXAM rows from {len(institute_ids)} institutes."
        )
