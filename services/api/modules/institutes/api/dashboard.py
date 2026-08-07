from calendar import monthrange
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import Subject
from modules.admin_console.models import AdminRecord
from modules.admissions.models import Enquiry
from modules.attendance.models import LeaveApplication, StaffAttendance, StudentAttendance
from modules.finance.models import FeeInvoice, FeePayment, FinanceRecord
from modules.institutes.models import Branch, InstituteMembership
from modules.people.models import Student
from modules.school_calendar.models import AcademicCalendarEvent
from platform_core.models import AuditEvent

from .permissions import IsCurrentInstituteAdmin


class DashboardSuccessSerializer(serializers.Serializer):
    success = serializers.BooleanField()
    data = serializers.JSONField()


def _month_bounds(today):
    start = today.replace(day=1)
    end = today.replace(day=monthrange(today.year, today.month)[1])
    return start, end


def _percentage(numerator, denominator):
    if not denominator:
        return None
    return round(float(numerator) * 100 / float(denominator), 1)


def _change(current, previous):
    """Return a percentage change, or null when there is no valid baseline."""
    if not previous:
        return None
    return round((float(current) - float(previous)) * 100 / float(previous), 1)


def _percentage_point_change(current, previous):
    if current is None or previous is None:
        return None
    return round(float(current) - float(previous), 1)


def _money(value):
    return f"{value or Decimal('0.00'):.2f}"


def _scope(queryset, branch):
    return queryset.filter(branch=branch) if branch else queryset


def _attendance_summary(queryset):
    total = queryset.count()
    present = queryset.filter(
        status__in=(StudentAttendance.Status.PRESENT, StudentAttendance.Status.LATE)
    ).count()
    return {"percentage": _percentage(present, total), "present": present, "total": total}


def _fee_summary(invoices, payments):
    expected = invoices.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    collected = payments.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
    return {
        "collected": _money(collected),
        "expected": _money(expected),
        "percentage": _percentage(collected, expected),
    }


class AdminDashboardView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: DashboardSuccessSerializer})
    def get(self, request):
        branch = None
        branch_id = request.query_params.get("branchId")
        if request.institute_membership.role == InstituteMembership.Role.BRANCH_ADMIN:
            branch_id = str(request.institute_membership.branch_id)
        if branch_id:
            branch = get_object_or_404(
                Branch,
                id=branch_id,
                institute=request.institute,
                is_active=True,
            )

        today = timezone.localdate()
        month_start, month_end = _month_bounds(today)
        previous_month_end = month_start - timedelta(days=1)
        previous_month_start = previous_month_end.replace(day=1)
        yesterday = today - timedelta(days=1)
        students = _scope(
            Student.objects.filter(institute=request.institute, is_active=True), branch
        )
        students_before_month = _scope(
            Student.objects.filter(
                institute=request.institute,
                is_active=True,
                created_at__lt=month_start,
            ),
            branch,
        )
        staff_memberships = InstituteMembership.objects.filter(
            institute=request.institute,
            is_active=True,
            role__in=(InstituteMembership.Role.TEACHER, InstituteMembership.Role.STAFF),
        )
        if branch:
            staff_memberships = staff_memberships.filter(branch=branch)
        staff_before_month = staff_memberships.filter(created_at__lt=month_start)
        teacher_memberships = staff_memberships.filter(role=InstituteMembership.Role.TEACHER)

        today_attendance = _scope(
            StudentAttendance.objects.filter(institute=request.institute, date=today), branch
        )
        yesterday_attendance = _scope(
            StudentAttendance.objects.filter(institute=request.institute, date=yesterday), branch
        )
        today_staff_attendance = _scope(
            StaffAttendance.objects.filter(institute=request.institute, date=today), branch
        )

        month_invoices = _scope(
            FeeInvoice.objects.filter(
                institute=request.institute,
                due_date__range=(month_start, month_end),
            ),
            branch,
        )
        month_payments = FeePayment.objects.filter(
            invoice__institute=request.institute,
            paid_at__date__range=(month_start, month_end),
        )
        if branch:
            month_payments = month_payments.filter(invoice__branch=branch)
        previous_month_payments = FeePayment.objects.filter(
            invoice__institute=request.institute,
            paid_at__date__range=(previous_month_start, previous_month_end),
        )
        if branch:
            previous_month_payments = previous_month_payments.filter(invoice__branch=branch)

        enquiries = _scope(Enquiry.objects.filter(institute=request.institute), branch)
        open_statuses = (
            Enquiry.Status.ENQUIRY,
            Enquiry.Status.VISIT_SCHEDULED,
            Enquiry.Status.APPLIED,
        )

        attendance_totals = students.annotate(
            attendance_total=Count(
                "attendance_records",
                filter=Q(attendance_records__date__range=(month_start, month_end)),
            ),
            attendance_present=Count(
                "attendance_records",
                filter=Q(
                    attendance_records__date__range=(month_start, month_end),
                    attendance_records__status__in=(
                        StudentAttendance.Status.PRESENT,
                        StudentAttendance.Status.LATE,
                    ),
                ),
            ),
        ).values("attendance_total", "attendance_present")
        low_attendance_count = sum(
            1
            for row in attendance_totals
            if row["attendance_total"]
            and row["attendance_present"] * 100 < row["attendance_total"] * 75
        )
        pending_leaves = _scope(
            LeaveApplication.objects.filter(
                institute=request.institute,
                status=LeaveApplication.Status.PENDING,
            ),
            branch,
        ).select_related("student", "staff_user", "leave_type")
        attention = []
        if low_attendance_count:
            attention.append(
                {
                    "id": "attendance",
                    "label": "Students below 75% attendance this month",
                    "count": low_attendance_count,
                    "tone": "danger",
                    "destination": "attendance/low-attendance",
                }
            )

        visible_branches = request.institute.branches.filter(is_active=True).order_by("name")
        if request.institute_membership.role == InstituteMembership.Role.BRANCH_ADMIN:
            visible_branches = visible_branches.filter(id=request.institute_membership.branch_id)
        branch_comparison = []
        for item in visible_branches:
            attendance = StudentAttendance.objects.filter(
                institute=request.institute,
                branch=item,
                date__range=(month_start, month_end),
            )
            invoices = FeeInvoice.objects.filter(
                institute=request.institute,
                branch=item,
                due_date__range=(month_start, month_end),
            )
            payments = FeePayment.objects.filter(
                invoice__institute=request.institute,
                invoice__branch=item,
                paid_at__date__range=(month_start, month_end),
            )
            fee_summary = _fee_summary(invoices, payments)
            branch_comparison.append(
                {
                    "branchId": str(item.id),
                    "name": item.name,
                    "attendancePercentage": _attendance_summary(attendance)["percentage"],
                    "feeCollectionPercentage": fee_summary["percentage"],
                    "averageLeaderboardPoints": None,
                }
            )

        audit_events = AuditEvent.objects.filter(institute=request.institute)
        if branch:
            audit_events = audit_events.filter(Q(branch=branch) | Q(branch__isnull=True))
        recent_activity = [
            {
                "id": str(event.id),
                "message": event.message,
                "actorName": (
                    event.actor.get_full_name().strip() or event.actor.email
                    if event.actor
                    else "System"
                ),
                "createdAt": event.created_at.isoformat(),
            }
            for event in audit_events.select_related("actor")[:10]
        ]

        upcoming_events = AcademicCalendarEvent.objects.filter(
            institute=request.institute,
            starts_on__gte=today,
        )
        if branch:
            upcoming_events = upcoming_events.filter(Q(branch=branch) | Q(branch__isnull=True))
        upcoming = [
            {
                "id": str(event.id),
                "title": event.title,
                "type": event.event_type,
                "startsOn": event.starts_on.isoformat(),
            }
            for event in upcoming_events[:5]
        ]

        month_enquiries = enquiries.filter(created_at__date__range=(month_start, month_end))
        funnel = {
            "enquiry": month_enquiries.filter(status=Enquiry.Status.ENQUIRY).count(),
            "visitScheduled": month_enquiries.filter(status=Enquiry.Status.VISIT_SCHEDULED).count(),
            "applied": month_enquiries.filter(status=Enquiry.Status.APPLIED).count(),
            "enrolled": month_enquiries.filter(status=Enquiry.Status.ENROLLED).count(),
        }
        branches = [
            {"id": str(item.id), "name": item.name, "isHeadOffice": item.is_head_office}
            for item in visible_branches
        ]

        enrollment_by_branch = [
            {
                "branchId": str(item.id),
                "name": item.name,
                "code": item.code,
                "students": Student.objects.filter(
                    institute=request.institute, branch=item, is_active=True
                ).count(),
            }
            for item in visible_branches
        ]

        fee_last_seven_days = []
        for offset in range(6, -1, -1):
            day = today - timedelta(days=offset)
            day_payments = FeePayment.objects.filter(
                invoice__institute=request.institute, paid_at__date=day
            )
            if branch:
                day_payments = day_payments.filter(invoice__branch=branch)
            total = day_payments.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
            fee_last_seven_days.append({"date": day.isoformat(), "amount": _money(total)})

        student_status_counts = {
            status: today_attendance.filter(status=status).count()
            for status in (
                StudentAttendance.Status.PRESENT,
                StudentAttendance.Status.ABSENT,
                StudentAttendance.Status.LATE,
                StudentAttendance.Status.EXCUSED,
            )
        }
        teacher_ids = set(teacher_memberships.values_list("user_id", flat=True))

        def staff_breakdown(queryset):
            return {
                "present": queryset.filter(status=StaffAttendance.Status.PRESENT).count(),
                "absent": queryset.filter(status=StaffAttendance.Status.ABSENT).count(),
                "late": queryset.filter(status=StaffAttendance.Status.LATE).count(),
                "total": queryset.count(),
            }

        attendance_breakdown = {
            "students": {
                "present": student_status_counts[StudentAttendance.Status.PRESENT],
                "absent": student_status_counts[StudentAttendance.Status.ABSENT],
                "late": student_status_counts[StudentAttendance.Status.LATE],
                "excused": student_status_counts[StudentAttendance.Status.EXCUSED],
                "total": today_attendance.count(),
            },
            "teachers": staff_breakdown(today_staff_attendance.filter(user_id__in=teacher_ids)),
            "staff": staff_breakdown(today_staff_attendance.exclude(user_id__in=teacher_ids)),
        }

        leave_requests = []
        for leave in pending_leaves[:3]:
            applicant = (
                leave.student.full_name
                if leave.student
                else (
                    leave.staff_user.get_full_name().strip() or leave.staff_user.email
                    if leave.staff_user
                    else "Unknown applicant"
                )
            )
            leave_requests.append(
                {
                    "id": str(leave.id),
                    "applicantName": applicant,
                    "applicantType": leave.applicant_type,
                    "leaveType": leave.leave_type.name,
                    "startsOn": leave.start_date.isoformat(),
                    "endsOn": leave.end_date.isoformat(),
                }
            )

        month_expenses = _scope(
            FinanceRecord.objects.filter(
                institute=request.institute,
                kind=FinanceRecord.Kind.EXPENSE,
                entry_date__range=(month_start, month_end),
            ),
            branch,
        ).aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))["total"]
        collected_month = month_payments.aggregate(total=Coalesce(Sum("amount"), Decimal("0.00")))[
            "total"
        ]
        invoice_rows = list(month_invoices.prefetch_related("payments"))
        outstanding = sum(
            (
                max(
                    invoice.amount
                    - sum((payment.amount for payment in invoice.payments.all()), Decimal("0.00")),
                    Decimal("0.00"),
                )
                for invoice in invoice_rows
            ),
            Decimal("0.00"),
        )
        defaulters = sum(
            1
            for invoice in invoice_rows
            if invoice.amount
            > sum((payment.amount for payment in invoice.payments.all()), Decimal("0.00"))
        )

        notices = AdminRecord.objects.filter(
            institute=request.institute,
            screen_id="CM1",
            is_active=True,
        )
        if branch:
            notices = notices.filter(Q(branch=branch) | Q(branch__isnull=True))
        notice_board = [
            {
                "id": str(notice.id),
                "title": notice.title,
                "status": notice.status,
                "updatedAt": notice.updated_at.isoformat(),
            }
            for notice in notices[:3]
        ]

        return Response(
            {
                "success": True,
                "data": {
                    "context": {
                        "instituteId": str(request.institute.id),
                        "branchId": str(branch.id) if branch else None,
                        "branches": branches,
                    },
                    "kpis": {
                        "activeStudents": students.count(),
                        "activeStudentsChange": _change(
                            students.count(), students_before_month.count()
                        ),
                        "totalStaff": staff_memberships.values("user_id").distinct().count(),
                        "totalStaffChange": _change(
                            staff_memberships.values("user_id").distinct().count(),
                            staff_before_month.values("user_id").distinct().count(),
                        ),
                        "todayAttendance": {
                            **_attendance_summary(today_attendance),
                            "change": _percentage_point_change(
                                _attendance_summary(today_attendance)["percentage"],
                                _attendance_summary(yesterday_attendance)["percentage"],
                            ),
                        },
                        "feeCollection": _fee_summary(month_invoices, month_payments),
                        "feeCollectionChange": _change(
                            month_payments.aggregate(
                                total=Coalesce(Sum("amount"), Decimal("0.00"))
                            )["total"],
                            previous_month_payments.aggregate(
                                total=Coalesce(Sum("amount"), Decimal("0.00"))
                            )["total"],
                        ),
                        "openEnquiries": enquiries.filter(status__in=open_statuses).count(),
                        "newEnquiriesToday": enquiries.filter(created_at__date=today).count(),
                        "totalTeachers": teacher_memberships.values("user_id").distinct().count(),
                        "totalSubjects": Subject.objects.filter(
                            institute=request.institute
                        ).count(),
                        "pendingLeaves": pending_leaves.count(),
                        "atRiskStudents": low_attendance_count,
                    },
                    "attentionItems": attention,
                    "branchComparison": branch_comparison,
                    "recentActivity": recent_activity,
                    "upcoming": upcoming,
                    "admissionsFunnel": funnel,
                    "enrollmentByBranch": enrollment_by_branch,
                    "feeLastSevenDays": fee_last_seven_days,
                    "attendanceBreakdown": attendance_breakdown,
                    "leaveRequests": leave_requests,
                    "financeSnapshot": {
                        "feesCollected": _money(collected_month),
                        "expenses": _money(month_expenses),
                        "outstanding": _money(outstanding),
                        "defaulters": defaulters,
                        "net": _money(collected_month - month_expenses),
                    },
                    "noticeBoard": notice_board,
                },
            }
        )
