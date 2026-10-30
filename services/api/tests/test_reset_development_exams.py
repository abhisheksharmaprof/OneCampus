from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.test import override_settings

from modules.academics.management.commands.reset_development_exams import database_identity
from modules.academics.models import AcademicOperation
from modules.institutes.models import Institute


@pytest.mark.django_db
def test_reset_defaults_to_dry_run_and_only_counts_selected_exam_rows():
    target = Institute.objects.create(name="Target Academy", code="TARGET")
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    exam = AcademicOperation.objects.create(
        institute=target, kind=AcademicOperation.Kind.EXAM, title="Old exam"
    )
    unrelated = AcademicOperation.objects.create(
        institute=target, kind=AcademicOperation.Kind.HOMEWORK, title="Homework"
    )
    AcademicOperation.objects.create(
        institute=other, kind=AcademicOperation.Kind.EXAM, title="Other exam"
    )

    output = StringIO()
    call_command(
        "reset_development_exams",
        institute_id=[str(target.id)],
        stdout=output,
    )

    assert "DRY RUN" in output.getvalue()
    assert "1 generic EXAM rows" in output.getvalue()
    assert AcademicOperation.objects.filter(id=exam.id).exists()
    assert AcademicOperation.objects.filter(id=unrelated.id).exists()


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_reset_apply_requires_matching_database_identity_and_preserves_other_rows(monkeypatch):
    monkeypatch.setenv("DJANGO_ENV", "development")
    target = Institute.objects.create(name="Target Academy", code="TARGET")
    exam = AcademicOperation.objects.create(
        institute=target, kind=AcademicOperation.Kind.EXAM, title="Old exam"
    )
    unrelated = AcademicOperation.objects.create(
        institute=target, kind=AcademicOperation.Kind.HOMEWORK, title="Homework"
    )

    with pytest.raises(CommandError, match="confirm-target"):
        call_command(
            "reset_development_exams",
            institute_id=[str(target.id)],
            apply=True,
            confirm_target="wrong-target",
        )
    assert AcademicOperation.objects.filter(id=exam.id).exists()

    call_command(
        "reset_development_exams",
        institute_id=[str(target.id)],
        apply=True,
        confirm_target=database_identity(connection),
        stdout=StringIO(),
    )

    assert not AcademicOperation.objects.filter(id=exam.id).exists()
    assert AcademicOperation.objects.filter(id=unrelated.id).exists()


@pytest.mark.django_db
@override_settings(DEBUG=True)
def test_reset_refuses_related_non_exam_deletion_and_rolls_back(monkeypatch):
    monkeypatch.setenv("DJANGO_ENV", "development")
    institute = Institute.objects.create(name="Target Academy", code="TARGET")
    exam = AcademicOperation.objects.create(
        institute=institute, kind=AcademicOperation.Kind.EXAM, title="Old exam"
    )

    with patch(
        "modules.academics.management.commands.reset_development_exams.dependent_deletion_counts",
        return_value={"academics.OtherRecord": 1},
    ):
        with pytest.raises(CommandError, match="non-EXAM data"):
            call_command(
                "reset_development_exams",
                institute_id=[str(institute.id)],
                apply=True,
                confirm_target=database_identity(connection),
            )

    assert AcademicOperation.objects.filter(id=exam.id).exists()
