# Generated for the draft exam paper schedule slice.

import uuid

import django.db.models.deletion
from django.db import migrations, models


def backfill_draft_schedules(apps, schema_editor):
    Selection = apps.get_model("academics", "ExamSubjectSelection")
    Schedule = apps.get_model("academics", "ExamPaperSchedule")
    Schedule.objects.bulk_create(
        [
            Schedule(selection_id=selection_id)
            for selection_id in Selection.objects.values_list("id", flat=True)
        ],
        batch_size=500,
        ignore_conflicts=True,
    )


def delete_draft_schedules(apps, schema_editor):
    apps.get_model("academics", "ExamPaperSchedule").objects.all().delete()


def enable_schedule_rls(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        with schema_editor.connection.cursor() as cursor:
            cursor.execute("ALTER TABLE exam_paper_schedules ENABLE ROW LEVEL SECURITY")


def disable_schedule_rls(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        with schema_editor.connection.cursor() as cursor:
            cursor.execute("ALTER TABLE exam_paper_schedules DISABLE ROW LEVEL SECURITY")


class Migration(migrations.Migration):

    dependencies = [("academics", "0025_exam_subject_selection")]

    operations = [
        migrations.CreateModel(
            name="ExamPaperSchedule",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("scheduled_on", models.DateField(blank=True, null=True)),
                ("start_time", models.TimeField(blank=True, null=True)),
                ("end_time", models.TimeField(blank=True, null=True)),
                (
                    "selection",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="schedule",
                        to="academics.examsubjectselection",
                    ),
                ),
            ],
            options={
                "db_table": "exam_paper_schedules",
                "constraints": [
                    models.CheckConstraint(
                        condition=models.Q(
                            models.Q(
                                ("end_time__isnull", True),
                                ("scheduled_on__isnull", True),
                                ("start_time__isnull", True),
                            ),
                            models.Q(
                                ("end_time__isnull", False),
                                ("scheduled_on__isnull", False),
                                ("start_time__isnull", False),
                            ),
                            _connector="OR",
                        ),
                        name="ck_exam_paper_schedule_complete",
                    ),
                    models.CheckConstraint(
                        condition=(
                            models.Q(("end_time__gt", models.F("start_time")))
                            | models.Q(("end_time__isnull", True))
                        ),
                        name="ck_exam_paper_schedule_time_order",
                    ),
                ],
            },
        ),
        migrations.RunPython(backfill_draft_schedules, delete_draft_schedules),
        migrations.RunPython(enable_schedule_rls, disable_schedule_rls),
    ]
