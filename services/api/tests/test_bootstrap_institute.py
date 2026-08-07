from io import StringIO

import pytest
from django.core.management import call_command

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


@pytest.mark.django_db
def test_bootstrap_institute_creates_email_password_admin_idempotently(monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "StrongPass123!")
    stdout = StringIO()
    options = {
        "institute_name": "CampusOne Academy",
        "institute_code": "COA",
        "branch_name": "Central Campus",
        "branch_code": "CENTRAL",
        "admin_email": "owner@campusone.test",
        "stdout": stdout,
    }

    call_command("bootstrap_institute", **options)
    call_command("bootstrap_institute", **options)

    user = User.objects.get(email="owner@campusone.test")
    institute = Institute.objects.get(code="COA")
    branch = Branch.objects.get(institute=institute, code="CENTRAL")
    membership = InstituteMembership.objects.get(
        user=user,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )

    assert user.check_password("StrongPass123!")
    assert user.is_staff is False
    assert branch.is_head_office is True
    assert membership.branch_id is None
    assert Institute.objects.count() == 1
    assert Branch.objects.count() == 1
    assert User.objects.count() == 1
    assert InstituteMembership.objects.count() == 1
    assert "password" not in stdout.getvalue().lower()
