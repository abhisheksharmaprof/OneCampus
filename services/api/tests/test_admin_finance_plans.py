from datetime import date
from decimal import Decimal

import pytest

from modules.academics.models import Grade
from modules.finance.models import FeeInvoice, FeePlan
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student


def make_admin(api_client, *, code="NSA"):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    branch = Branch.objects.create(
        institute=institute, name="Main Campus", code=f"{code}-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email=f"admin@{code.lower()}.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    return institute, branch, login.json()["data"]["accessToken"]


@pytest.mark.django_db
def test_plan_crud_and_validation(api_client):
    institute, branch, token = make_admin(api_client)
    grade = Grade.objects.create(institute=institute, name="Class 8")
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_grade = Grade.objects.create(institute=other, name="Class 9")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    created = api_client.post(
        "/api/v1/admin/fees/plans",
        {
            "name": "Term 1 fees",
            "academicYear": "2026-27",
            "appliesTo": [str(grade.id)],
            "items": [{"head": "Tuition fee", "amount": "5000.00", "period": "Term 1"}],
        },
        format="json",
    )
    plan_id = created.json()["data"]["id"]
    listed = api_client.get("/api/v1/admin/fees/plans")
    updated = api_client.patch(
        f"/api/v1/admin/fees/plans/{plan_id}",
        {"items": [{"head": "Tuition fee", "amount": "5500.00", "period": "Term 1"}]},
        format="json",
    )
    foreign_class = api_client.post(
        "/api/v1/admin/fees/plans",
        {
            "name": "Bad plan",
            "appliesTo": [str(foreign_grade.id)],
            "items": [{"head": "Fee", "amount": "10.00"}],
        },
        format="json",
    )
    empty_items = api_client.post(
        "/api/v1/admin/fees/plans",
        {"name": "Empty plan", "appliesTo": [], "items": []},
        format="json",
    )

    assert created.status_code == 201
    assert listed.json()["data"]["items"][0]["name"] == "Term 1 fees"
    assert updated.json()["data"]["items"][0]["amount"] == "5500.00"
    assert foreign_class.status_code == 400
    assert empty_items.status_code == 400


@pytest.mark.django_db
def test_plan_delete_is_soft_when_referenced(api_client):
    institute, branch, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    referenced = FeePlan.objects.create(
        institute=institute, name="Used plan", items=[{"head": "Fee", "amount": "10.00"}]
    )
    unreferenced = FeePlan.objects.create(
        institute=institute, name="Unused plan", items=[{"head": "Fee", "amount": "10.00"}]
    )
    student = Student.objects.create(
        institute=institute, branch=branch, admission_number="NSA-0001", first_name="Diya"
    )
    FeeInvoice.objects.create(
        institute=institute, branch=branch, student=student, plan=referenced,
        amount=Decimal("10.00"), total=Decimal("10.00"), due_date=date.today(),
    )

    soft = api_client.delete(f"/api/v1/admin/fees/plans/{referenced.id}")
    hard = api_client.delete(f"/api/v1/admin/fees/plans/{unreferenced.id}")

    assert soft.status_code == 204
    assert hard.status_code == 204
    referenced.refresh_from_db()
    assert referenced.is_active is False
    assert not FeePlan.objects.filter(id=unreferenced.id).exists()


@pytest.mark.django_db
def test_plan_rejects_negative_amounts_and_foreign_detail_access(api_client):
    institute, branch, token = make_admin(api_client)
    other_institute, other_branch, _ = make_admin(api_client, code="OTHER")
    foreign_plan = FeePlan.objects.create(
        institute=other_institute, name="Foreign plan", items=[{"head": "Fee", "amount": "10.00"}]
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    negative = api_client.post(
        "/api/v1/admin/fees/plans",
        {"name": "Bad plan", "items": [{"head": "Tuition", "amount": "-5.00"}]},
        format="json",
    )
    foreign_get = api_client.get(f"/api/v1/admin/fees/plans/{foreign_plan.id}")
    foreign_patch = api_client.patch(
        f"/api/v1/admin/fees/plans/{foreign_plan.id}", {"name": "Hacked"}, format="json"
    )
    foreign_delete = api_client.delete(f"/api/v1/admin/fees/plans/{foreign_plan.id}")

    assert negative.status_code == 400
    assert foreign_get.status_code == 404
    assert foreign_patch.status_code == 404
    assert foreign_delete.status_code == 404
    assert FeePlan.objects.filter(id=foreign_plan.id).exists()
