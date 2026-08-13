from datetime import timedelta
from decimal import Decimal

from django.db.models import DecimalField, F, Min, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import StudentEnrollment
from modules.finance.models import FeeInvoice, FeePayment
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset

OPEN_STATUSES = (FeeInvoice.Status.ISSUED, FeeInvoice.Status.PARTIALLY_PAID)
BILLABLE_STATUSES = (*OPEN_STATUSES, FeeInvoice.Status.PAID)
MONEY = DecimalField(max_digits=12, decimal_places=2)


def _money(value):
    """Quantize to 2 decimal places before stringifying.

    Sum() aggregates over SQLite don't preserve the source DecimalField's
    decimal_places, so str(Decimal) can drop trailing zeros (e.g. "30"
    instead of "30.00"). Quantizing keeps the value identical while
    matching the formatting DRF's DecimalField already applies elsewhere.
    """
    return str(Decimal(value).quantize(Decimal("0.01")))


class BranchFilterSerializer(serializers.Serializer):
    branchId = serializers.UUIDField(required=False)


class DuesFilterSerializer(serializers.Serializer):
    branchId = serializers.UUIDField(required=False)
    classId = serializers.UUIDField(required=False)
    minDaysOverdue = serializers.IntegerField(required=False, min_value=0)


def validated_branch_id(request, branch_id):
    if branch_id:
        get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
    return branch_id


class FeeSummaryView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        filters = BranchFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        today = timezone.localdate()
        month_start = today.replace(day=1)
        branch_id = validated_branch_id(request, filters.validated_data.get("branchId"))

        payments = FeePayment.objects.filter(institute=request.institute)
        open_invoices = FeeInvoice.objects.filter(
            institute=request.institute, status__in=OPEN_STATUSES
        )
        open_payments = payments.filter(invoice__status__in=OPEN_STATUSES)
        if branch_id:
            payments = payments.filter(invoice__branch_id=branch_id)
            open_invoices = open_invoices.filter(branch_id=branch_id)
            open_payments = open_payments.filter(invoice__branch_id=branch_id)

        collected_this_month = payments.filter(paid_at__date__gte=month_start).aggregate(
            total=Sum("amount")
        )["total"] or Decimal("0.00")
        billed_open = open_invoices.aggregate(total=Sum("total"))["total"] or Decimal("0.00")
        paid_open = open_payments.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        overdue_count = open_invoices.filter(due_date__lt=today).count()
        receipts_today = payments.filter(paid_at__date=today).count()

        # Walk back 11 calendar months so the 12-bucket series ends on the current month.
        series_start = month_start
        for _ in range(11):
            series_start = (series_start - timedelta(days=1)).replace(day=1)
        collected_by_month = {
            row["month"].strftime("%Y-%m"): row["total"]
            for row in (
                payments.filter(paid_at__date__gte=series_start)
                .annotate(month=TruncMonth("paid_at"))
                .values("month")
                .annotate(total=Sum("amount"))
            )
        }
        monthly_series = []
        cursor = series_start
        for _ in range(12):
            key = cursor.strftime("%Y-%m")
            monthly_series.append(
                {"month": key, "collected": _money(collected_by_month.get(key, Decimal("0.00")))}
            )
            cursor = (cursor + timedelta(days=32)).replace(day=1)

        return Response(
            {
                "success": True,
                "data": {
                    "collectedThisMonth": _money(collected_this_month),
                    "outstandingTotal": _money(billed_open - paid_open),
                    "overdueCount": overdue_count,
                    "receiptsToday": receipts_today,
                    "monthlySeries": monthly_series,
                },
            }
        )


class DueRowSerializer(serializers.Serializer):
    studentId = serializers.UUIDField(source="student_id")
    studentName = serializers.SerializerMethodField()
    admissionNumber = serializers.CharField(source="student__admission_number")
    billed = serializers.DecimalField(max_digits=12, decimal_places=2)
    paid = serializers.DecimalField(max_digits=12, decimal_places=2)
    outstanding = serializers.DecimalField(max_digits=12, decimal_places=2)
    daysOverdue = serializers.SerializerMethodField()

    def get_studentName(self, row) -> str:
        return f"{row['student__first_name']} {row['student__last_name']}".strip()

    def get_daysOverdue(self, row) -> int:
        earliest = row["earliest_due"]
        if earliest is None:
            return 0
        return max((timezone.localdate() - earliest).days, 0)


class FeeDuesView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        filters_serializer = DuesFilterSerializer(data=request.query_params)
        filters_serializer.is_valid(raise_exception=True)
        filters = filters_serializer.validated_data

        today = timezone.localdate()
        invoices = FeeInvoice.objects.filter(
            institute=request.institute, status__in=OPEN_STATUSES
        )
        branch_id = validated_branch_id(request, filters.get("branchId"))
        if branch_id:
            invoices = invoices.filter(branch_id=branch_id)
        class_id = filters.get("classId")
        if class_id:
            enrolled = StudentEnrollment.objects.filter(
                class_section__grade_id=class_id, left_at__isnull=True
            ).values("student_id")
            invoices = invoices.filter(student_id__in=enrolled)

        paid_filters = {
            "institute": request.institute,
            "invoice__student_id": OuterRef("student_id"),
            "invoice__status__in": OPEN_STATUSES,
        }
        if branch_id:
            paid_filters["invoice__branch_id"] = branch_id
        paid_per_student = (
            FeePayment.objects.filter(**paid_filters)
            .values("invoice__student_id")
            .annotate(total=Sum("amount"))
            .values("total")[:1]
        )
        rows = (
            invoices.values(
                "student_id",
                "student__first_name",
                "student__last_name",
                "student__admission_number",
            )
            .annotate(
                billed=Sum("total"),
                paid=Coalesce(
                    Subquery(paid_per_student, output_field=MONEY), Value(Decimal("0.00"), MONEY)
                ),
                earliest_due=Min("due_date", filter=Q(due_date__lt=today)),
            )
            .annotate(outstanding=F("billed") - F("paid"))
            .filter(outstanding__gt=0)
            .order_by("-outstanding", "student_id")
        )
        min_days = filters.get("minDaysOverdue")
        if min_days is not None:
            rows = rows.filter(earliest_due__lte=today - timedelta(days=min_days))
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=rows, serializer_class=DueRowSerializer
                ),
            }
        )


class FeeDuesExportView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request):
        filter_serializer = DuesFilterSerializer(data=request.data)
        filter_serializer.is_valid(raise_exception=True)
        filters = filter_serializer.validated_data
        branch_id = validated_branch_id(request, filters.get("branchId"))
        class_id = filters.get("classId")
        audit_mutation(
            request=request,
            verb="Updated",
            target_label="dues list export",
            target_type="fee_dues_export",
            extra_meta={
                "branchId": str(branch_id) if branch_id else None,
                "classId": str(class_id) if class_id else None,
                "minDaysOverdue": filters.get("minDaysOverdue"),
            },
        )
        return Response({"success": True, "data": {"logged": True}}, status=201)
