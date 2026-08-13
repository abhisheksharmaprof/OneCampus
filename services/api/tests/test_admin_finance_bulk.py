from datetime import date, timedelta
from decimal import Decimal

import pytest

from modules.academics.models import AcademicYear, ClassSection, Grade, StudentEnrollment
from modules.finance.models import FeeInvoice, FeePlan
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student


@pytest.fixture
def context(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code="NSA-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@nsa.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    grade = Grade.objects.create(institute=institute, name="Class 8")
    year = AcademicYear.objects.create(
        institute=institute,
        name="2026-27",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_current=True,
    )
    section = ClassSection.objects.create(
        branch=branch, grade=grade, academic_year=year, section_name="A"
    )
    students = []
    for index in range(3):
        student = Student.objects.create(
            institute=institute,
            branch=branch,
            admission_number=f"NSA-000{index + 1}",
            first_name=f"Student{index + 1}",
        )
        StudentEnrollment.objects.create(
            student=student,
            class_section=section,
            academic_year=year,
            roll_number=str(index + 1),
        )
        students.append(student)
    plan = FeePlan.objects.create(
        institute=institute,
        name="Term 1 fees",
        academic_year="2026-27",
        applies_to=[str(grade.id)],
        items=[
            {"head": "Tuition fee", "amount": "5000.00", "period": "Term 1"},
            {"head": "Library fee", "amount": "300.00", "period": "Term 1"},
        ],
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")
    return {
        "institute": institute, "branch": branch, "grade": grade,
        "plan": plan, "students": students,
    }


def body(ctx):
    return {
        "feePlanId": str(ctx["plan"].id),
        "classIds": [str(ctx["grade"].id)],
        "issueDate": str(date.today()),
        "dueDate": str(date.today() + timedelta(days=15)),
    }


@pytest.mark.django_db
def test_bulk_generate_creates_invoices_for_enrolled_students(api_client, context):
    response = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate", body(context), format="json"
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["created"] == 3
    assert data["skipped"] == 0
    invoices = FeeInvoice.objects.filter(institute=context["institute"], plan=context["plan"])
    assert invoices.count() == 3
    sample = invoices.first()
    assert sample.total == Decimal("5300.00")
    assert sample.status == "ISSUED"
    assert sample.invoice_number.startswith("INV-")
    numbers = set(invoices.values_list("invoice_number", flat=True))
    assert len(numbers) == 3


@pytest.mark.django_db
def test_bulk_generate_is_idempotent(api_client, context):
    first = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate", body(context), format="json"
    )
    second = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate", body(context), format="json"
    )

    assert first.json()["data"]["created"] == 3
    assert second.json()["data"]["created"] == 0
    assert second.json()["data"]["skipped"] == 3
    assert FeeInvoice.objects.filter(plan=context["plan"]).count() == 3


@pytest.mark.django_db
def test_bulk_generate_rejects_foreign_or_inactive_plan(api_client, context):
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_plan = FeePlan.objects.create(
        institute=other, name="Foreign plan", items=[{"head": "Fee", "amount": "10.00"}]
    )
    context["plan"].is_active = False
    context["plan"].save(update_fields=("is_active",))

    foreign = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate",
        {**body(context), "feePlanId": str(foreign_plan.id)},
        format="json",
    )
    inactive = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate", body(context), format="json"
    )

    assert foreign.status_code == 404
    assert inactive.status_code == 404


@pytest.mark.django_db
def test_bulk_generate_rejects_foreign_class_ids(api_client, context):
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_grade = Grade.objects.create(institute=other, name="Class 9")

    response = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate",
        {**body(context), "classIds": [str(foreign_grade.id)]},
        format="json",
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_bulk_generate_excludes_left_students(api_client, context):
    from django.utils import timezone
    enrollment = StudentEnrollment.objects.get(student=context["students"][0])
    enrollment.left_at = timezone.now()
    enrollment.save(update_fields=("left_at",))

    response = api_client.post(
        "/api/v1/admin/fees/invoices/bulk-generate", body(context), format="json"
    )

    assert response.json()["data"]["created"] == 2
