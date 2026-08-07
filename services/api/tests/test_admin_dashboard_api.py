from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from modules.admissions.models import Enquiry
from modules.attendance.models import StudentAttendance
from modules.finance.models import FeeInvoice, FeePayment
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student
from modules.school_calendar.models import AcademicCalendarEvent
from platform_core.models import AuditEvent


@pytest.mark.django_db
def test_dashboard_returns_live_tenant_scoped_aggregates(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute,
        name="Main Campus",
        code="MAIN",
        is_head_office=True,
    )
    other = Institute.objects.create(name="Other School", code="OTHER")
    other_branch = Branch.objects.create(
        institute=other,
        name="Other Campus",
        code="OTHER-MAIN",
        is_head_office=True,
    )
    admin = User.objects.create_user(
        email="admin@northstar.test",
        password="StrongPass123!",
        first_name="Aarav",
        last_name="Sharma",
    )
    teacher = User.objects.create_user(email="teacher@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    InstituteMembership.objects.create(
        user=teacher,
        institute=institute,
        branch=branch,
        role=InstituteMembership.Role.TEACHER,
    )
    student_present = Student.objects.create(
        institute=institute,
        branch=branch,
        admission_number="NSA-001",
        first_name="Diya",
        last_name="Patel",
    )
    student_absent = Student.objects.create(
        institute=institute,
        branch=branch,
        admission_number="NSA-002",
        first_name="Kabir",
        last_name="Singh",
    )
    Student.objects.create(
        institute=other,
        branch=other_branch,
        admission_number="OTHER-001",
        first_name="Hidden",
        last_name="Student",
    )
    today = timezone.localdate()
    StudentAttendance.objects.create(
        institute=institute,
        branch=branch,
        student=student_present,
        date=today,
        status=StudentAttendance.Status.PRESENT,
    )
    StudentAttendance.objects.create(
        institute=institute,
        branch=branch,
        student=student_absent,
        date=today,
        status=StudentAttendance.Status.ABSENT,
    )
    StudentAttendance.objects.create(
        institute=institute,
        branch=branch,
        student=student_present,
        date=today - timedelta(days=1),
        status=StudentAttendance.Status.PRESENT,
    )
    StudentAttendance.objects.create(
        institute=institute,
        branch=branch,
        student=student_absent,
        date=today - timedelta(days=1),
        status=StudentAttendance.Status.PRESENT,
    )
    Enquiry.objects.create(
        institute=institute,
        branch=branch,
        guardian_name="Meera Shah",
        contact_email="meera@example.test",
        status=Enquiry.Status.ENQUIRY,
    )
    Enquiry.objects.create(
        institute=other,
        branch=other_branch,
        guardian_name="Hidden Lead",
        contact_email="hidden@example.test",
    )
    invoice = FeeInvoice.objects.create(
        institute=institute,
        branch=branch,
        student=student_present,
        amount=Decimal("1000.00"),
        due_date=today,
    )
    FeePayment.objects.create(invoice=invoice, amount=Decimal("600.00"))
    AuditEvent.objects.create(
        institute=institute,
        branch=branch,
        actor=admin,
        message="Aarav Sharma created a branch",
    )
    AcademicCalendarEvent.objects.create(
        institute=institute,
        title="Parent-Teacher Meeting",
        event_type=AcademicCalendarEvent.EventType.PTM,
        starts_on=today + timedelta(days=3),
        ends_on=today + timedelta(days=3),
    )

    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")

    response = api_client.get("/api/v1/admin/dashboard")

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["context"]["instituteId"] == str(institute.id)
    assert data["kpis"]["activeStudents"] == 2
    assert data["kpis"]["activeStudentsChange"] is None
    assert data["kpis"]["totalStaff"] == 1
    assert data["kpis"]["totalStaffChange"] is None
    assert data["kpis"]["todayAttendance"]["percentage"] == 50.0
    assert data["kpis"]["todayAttendance"]["change"] == -50.0
    assert data["kpis"]["feeCollection"]["collected"] == "600.00"
    assert data["kpis"]["feeCollection"]["expected"] == "1000.00"
    assert data["kpis"]["feeCollectionChange"] is None
    assert data["kpis"]["openEnquiries"] == 1
    assert data["kpis"]["newEnquiriesToday"] == 1
    assert data["recentActivity"][0]["message"] == "Aarav Sharma created a branch"
    assert data["upcoming"][0]["title"] == "Parent-Teacher Meeting"
    assert data["admissionsFunnel"] == {
        "enquiry": 1,
        "visitScheduled": 0,
        "applied": 0,
        "enrolled": 0,
    }
    assert data["kpis"]["totalTeachers"] == 1
    assert data["kpis"]["pendingLeaves"] == 0
    assert data["enrollmentByBranch"][0]["students"] == 2
    assert len(data["feeLastSevenDays"]) == 7
    assert data["attendanceBreakdown"]["students"] == {
        "present": 1,
        "absent": 1,
        "late": 0,
        "excused": 0,
        "total": 2,
    }
    assert data["financeSnapshot"]["feesCollected"] == "600.00"
    assert data["financeSnapshot"]["outstanding"] == "400.00"
    assert len(data["branchComparison"]) == 1
    assert data["branchComparison"][0]["branchId"] == str(branch.id)


@pytest.mark.django_db
def test_dashboard_rejects_branch_from_another_institute(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    Branch.objects.create(institute=institute, name="Main", code="MAIN", is_head_office=True)
    other = Institute.objects.create(name="Other School", code="OTHER")
    foreign_branch = Branch.objects.create(
        institute=other,
        name="Other Campus",
        code="OTHER-MAIN",
        is_head_office=True,
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")

    response = api_client.get(
        "/api/v1/admin/dashboard",
        {"branchId": str(foreign_branch.id)},
    )

    assert response.status_code == 404
