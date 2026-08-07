from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.finance.models import FeeInvoice, FeePayment, FinanceRecord
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from modules.people.models import Student
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


class InvoiceSerializer(serializers.ModelSerializer):
    studentId = serializers.UUIDField(source="student_id", read_only=True)
    studentName = serializers.SerializerMethodField()
    totalPaid = serializers.SerializerMethodField()

    class Meta:
        model = FeeInvoice
        fields = ("id", "studentId", "studentName", "amount", "due_date", "totalPaid")

    def get_studentName(self, value) -> str:
        return value.student.full_name

    def get_totalPaid(self, value) -> str:
        return str(sum((payment.amount for payment in value.payments.all()), Decimal("0.00")))


class InvoiceWriteSerializer(serializers.Serializer):
    studentId = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    dueDate = serializers.DateField()


class PaymentWriteSerializer(serializers.Serializer):
    invoiceId = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))


class FeeInvoiceListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: InvoiceSerializer(many=True)})
    def get(self, request):
        invoices = (
            FeeInvoice.objects.filter(institute=request.institute)
            .select_related("student")
            .prefetch_related("payments")
        )
        branch_id = request.query_params.get("branchId")
        if branch_id:
            get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
            invoices = invoices.filter(branch_id=branch_id)
        student_id = request.query_params.get("studentId")
        if student_id:
            invoices = invoices.filter(student_id=student_id)
        search = request.query_params.get("search", "").strip()
        if search:
            invoices = invoices.filter(
                Q(student__first_name__icontains=search)
                | Q(student__last_name__icontains=search)
                | Q(student__admission_number__icontains=search)
            )
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=invoices, serializer_class=InvoiceSerializer
                ),
            }
        )

    @extend_schema(
        request=InvoiceWriteSerializer,
        responses={status.HTTP_201_CREATED: InvoiceSerializer},
    )
    def post(self, request):
        serializer = InvoiceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        student = get_object_or_404(
            Student,
            id=serializer.validated_data["studentId"],
            institute=request.institute,
            is_active=True,
        )
        invoice = FeeInvoice.objects.create(
            institute=request.institute,
            branch=student.branch,
            student=student,
            amount=serializer.validated_data["amount"],
            due_date=serializer.validated_data["dueDate"],
        )
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"fee invoice for {student.full_name}",
            target_type="fee_invoice",
            target_id=invoice.id,
            extra_meta={"amount": str(invoice.amount), "studentId": str(student.id)},
        )
        return Response(
            {"success": True, "data": InvoiceSerializer(invoice).data},
            status=status.HTTP_201_CREATED,
        )


class FeePaymentCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(request=PaymentWriteSerializer, responses={status.HTTP_201_CREATED: dict})
    def post(self, request):
        serializer = PaymentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            invoice = get_object_or_404(
                FeeInvoice.objects.select_for_update(),
                id=serializer.validated_data["invoiceId"],
                institute=request.institute,
            )
            amount_paid = invoice.payments.aggregate(total=Sum("amount"))["total"] or Decimal(
                "0.00"
            )
            amount = serializer.validated_data["amount"]
            if amount > invoice.amount - amount_paid:
                raise serializers.ValidationError(
                    {"amount": ["Payment exceeds the outstanding balance."]}
                )
            payment = FeePayment.objects.create(invoice=invoice, amount=amount)
        audit_mutation(
            request=request,
            verb="PAYMENT",
            target_label=f"fee payment of {amount} for invoice {invoice.id}",
            target_type="fee_payment",
            target_id=payment.id,
            extra_meta={"amount": str(amount), "invoiceId": str(invoice.id)},
        )
        return Response(
            {
                "success": True,
                "data": {
                    "id": str(payment.id),
                    "amount": str(payment.amount),
                    "invoiceId": str(invoice.id),
                },
            },
            status=status.HTTP_201_CREATED,
        )


class FinanceRecordListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        records = FinanceRecord.objects.filter(institute=request.institute)
        kind = request.query_params.get("kind")
        if kind:
            records = records.filter(kind=kind.upper())
        branch_id = request.query_params.get("branchId")
        if branch_id:
            get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
            records = records.filter(branch_id=branch_id)
        search = request.query_params.get("search", "").strip()
        if search:
            records = records.filter(Q(title__icontains=search) | Q(category__icontains=search))
        return Response({"success": True, "data": paginate_admin_queryset(request=request, queryset=records, serializer_class=FinanceRecordSerializer)})

    def post(self, request):
        serializer = FinanceRecordWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        branch = get_object_or_404(Branch, id=values.pop("branch_id"), institute=request.institute, is_active=True)
        record = FinanceRecord.objects.create(institute=request.institute, branch=branch, **values)
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"finance record '{record.title}'",
            target_type="finance_record",
            target_id=record.id,
            extra_meta={"kind": record.kind, "amount": str(record.amount)},
        )
        return Response({"success": True, "data": FinanceRecordSerializer(record).data}, status=status.HTTP_201_CREATED)


class FinanceRecordSerializer(serializers.ModelSerializer):
    entryDate = serializers.DateField(source="entry_date")
    branchId = serializers.UUIDField(source="branch_id")

    class Meta:
        model = FinanceRecord
        fields = ("id", "kind", "title", "category", "amount", "entryDate", "status", "metadata", "branchId")


class FinanceRecordWriteSerializer(serializers.Serializer):
    branchId = serializers.UUIDField(source="branch_id")
    kind = serializers.ChoiceField(choices=FinanceRecord.Kind.values)
    title = serializers.CharField(max_length=200)
    category = serializers.CharField(max_length=80, required=False, allow_blank=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.00"))
    entryDate = serializers.DateField(source="entry_date")
    status = serializers.CharField(max_length=24, required=False, default="Draft")
    metadata = serializers.JSONField(required=False, default=dict)
