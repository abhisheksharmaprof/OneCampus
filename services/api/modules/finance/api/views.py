from decimal import Decimal

from django.db import transaction
from django.db.models import Prefetch, Q, Sum
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import Grade, StudentEnrollment
from modules.documents.models import DocumentTemplate
from modules.finance.models import FeeInvoice, FeePayment, FeePlan, FinanceRecord
from modules.finance.services import compute_totals, next_document_number, resolve_status
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from modules.people.models import Student
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset

ACTIVE_ENROLLMENTS = Prefetch(
    "student__academic_enrollments",
    queryset=StudentEnrollment.objects.filter(left_at__isnull=True).select_related(
        "class_section__grade"
    ),
    to_attr="active_enrollments",
)


def invoice_queryset(institute):
    return (
        FeeInvoice.objects.filter(institute=institute)
        .select_related("student")
        .prefetch_related("payments", ACTIVE_ENROLLMENTS)
    )


class InvoiceFilterSerializer(serializers.Serializer):
    studentId = serializers.UUIDField(required=False)
    classId = serializers.UUIDField(required=False)
    dateFrom = serializers.DateField(required=False)
    dateTo = serializers.DateField(required=False)


class LineItemSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=200)
    period = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    qty = serializers.IntegerField(min_value=1, max_value=999, default=1)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00")
    )


class InvoiceSerializer(serializers.ModelSerializer):
    invoiceNumber = serializers.CharField(source="invoice_number", read_only=True)
    studentId = serializers.UUIDField(source="student_id", read_only=True)
    studentName = serializers.SerializerMethodField()
    admissionNumber = serializers.CharField(source="student.admission_number", read_only=True)
    className = serializers.SerializerMethodField()
    issueDate = serializers.DateField(source="issue_date", read_only=True)
    dueDate = serializers.DateField(source="due_date", read_only=True)
    lineItems = serializers.JSONField(source="line_items", read_only=True)
    discountAmount = serializers.DecimalField(
        source="discount_amount", max_digits=12, decimal_places=2, read_only=True
    )
    taxAmount = serializers.DecimalField(
        source="tax_amount", max_digits=12, decimal_places=2, read_only=True
    )
    templateId = serializers.UUIDField(source="template_id", read_only=True)
    totalPaid = serializers.SerializerMethodField()

    class Meta:
        model = FeeInvoice
        fields = (
            "id", "invoiceNumber", "studentId", "studentName", "admissionNumber",
            "className", "status", "issueDate", "dueDate", "lineItems", "subtotal",
            "discountAmount", "taxAmount", "total", "notes", "templateId", "totalPaid",
            # Legacy fields kept for the student-profile fees tab:
            "amount", "due_date",
        )

    def get_studentName(self, invoice) -> str:
        return invoice.student.full_name

    def get_className(self, invoice) -> str:
        enrollments = getattr(invoice.student, "active_enrollments", None)
        if enrollments is None:
            enrollment = invoice.student.academic_enrollments.filter(
                left_at__isnull=True
            ).select_related("class_section__grade").first()
        else:
            enrollment = enrollments[0] if enrollments else None
        if enrollment is None:
            return ""
        section = enrollment.class_section
        return f"{section.grade.name} {section.section_name}".strip()

    def get_totalPaid(self, invoice) -> str:
        return str(sum((payment.amount for payment in invoice.payments.all()), Decimal("0.00")))


class InvoiceWriteSerializer(serializers.Serializer):
    studentId = serializers.UUIDField()
    issueDate = serializers.DateField()
    dueDate = serializers.DateField()
    lineItems = LineItemSerializer(many=True, allow_empty=False)
    discountAmount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), default=Decimal("0.00")
    )
    taxAmount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), default=Decimal("0.00")
    )
    notes = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )
    templateId = serializers.UUIDField(required=False, allow_null=True, default=None)
    status = serializers.ChoiceField(
        choices=(FeeInvoice.Status.DRAFT, FeeInvoice.Status.ISSUED),
        default=FeeInvoice.Status.ISSUED,
    )

    def validate(self, attrs):
        if attrs["dueDate"] < attrs["issueDate"]:
            raise serializers.ValidationError(
                {"dueDate": ["Due date cannot be before the issue date."]}
            )
        return attrs


class InvoicePatchSerializer(serializers.Serializer):
    issueDate = serializers.DateField(required=False)
    dueDate = serializers.DateField(required=False)
    lineItems = LineItemSerializer(many=True, allow_empty=False, required=False)
    discountAmount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), required=False
    )
    taxAmount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00"), required=False
    )
    notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    templateId = serializers.UUIDField(required=False, allow_null=True)
    status = serializers.ChoiceField(
        choices=(FeeInvoice.Status.DRAFT, FeeInvoice.Status.ISSUED, FeeInvoice.Status.CANCELLED),
        required=False,
    )


def serialize_line_items(validated_items):
    return [
        {
            "description": item["description"],
            "period": item.get("period", ""),
            "qty": item.get("qty", 1),
            "amount": str(item["amount"]),
        }
        for item in validated_items
    ]


def apply_invoice_totals(invoice, *, line_items, discount_amount, tax_amount):
    subtotal, total = compute_totals(
        line_items=line_items, discount_amount=discount_amount, tax_amount=tax_amount
    )
    if discount_amount > subtotal:
        raise serializers.ValidationError(
            {"discountAmount": ["Discount cannot exceed the subtotal."]}
        )
    if total <= 0:
        raise serializers.ValidationError(
            {"lineItems": ["Invoice total must be greater than zero."]}
        )
    invoice.line_items = line_items
    invoice.subtotal = subtotal
    invoice.discount_amount = discount_amount
    invoice.tax_amount = tax_amount
    invoice.total = total
    invoice.amount = total


class FeeInvoiceListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: InvoiceSerializer(many=True)})
    def get(self, request):
        invoices = invoice_queryset(request.institute)
        filter_serializer = InvoiceFilterSerializer(data=request.query_params)
        filter_serializer.is_valid(raise_exception=True)
        filters = filter_serializer.validated_data
        branch_id = request.query_params.get("branchId")
        if branch_id:
            get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
            invoices = invoices.filter(branch_id=branch_id)
        student_id = filters.get("studentId")
        if student_id:
            invoices = invoices.filter(student_id=student_id)
        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter in FeeInvoice.Status.values:
            invoices = invoices.filter(status=status_filter)
        class_id = filters.get("classId")
        if class_id:
            enrolled = StudentEnrollment.objects.filter(
                class_section__grade_id=class_id, left_at__isnull=True
            ).values("student_id")
            invoices = invoices.filter(student_id__in=enrolled)
        date_from = filters.get("dateFrom")
        if date_from:
            invoices = invoices.filter(due_date__gte=date_from)
        date_to = filters.get("dateTo")
        if date_to:
            invoices = invoices.filter(due_date__lte=date_to)
        search = request.query_params.get("search", "").strip()
        if search:
            invoices = invoices.filter(
                Q(student__first_name__icontains=search)
                | Q(student__last_name__icontains=search)
                | Q(student__admission_number__icontains=search)
                | Q(invoice_number__icontains=search)
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
        values = serializer.validated_data
        with transaction.atomic():
            student = get_object_or_404(
                Student, id=values["studentId"], institute=request.institute, is_active=True
            )
            template = None
            if values["templateId"]:
                template = get_object_or_404(
                    DocumentTemplate,
                    id=values["templateId"],
                    institute=request.institute,
                    category=DocumentTemplate.Category.FEE_INVOICE,
                )
            invoice = FeeInvoice(
                institute=request.institute,
                branch=student.branch,
                student=student,
                invoice_number=next_document_number(institute=request.institute, kind="invoice"),
                status=values["status"],
                issue_date=values["issueDate"],
                due_date=values["dueDate"],
                notes=values["notes"],
                template=template,
            )
            apply_invoice_totals(
                invoice,
                line_items=serialize_line_items(values["lineItems"]),
                discount_amount=values["discountAmount"],
                tax_amount=values["taxAmount"],
            )
            invoice.save()
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"fee invoice {invoice.invoice_number} for {student.full_name}",
            target_type="fee_invoice",
            target_id=invoice.id,
            extra_meta={
                "invoiceNumber": invoice.invoice_number,
                "total": str(invoice.total),
                "status": invoice.status,
                "studentId": str(student.id),
            },
        )
        fresh = invoice_queryset(request.institute).get(id=invoice.id)
        return Response(
            {"success": True, "data": InvoiceSerializer(fresh).data},
            status=status.HTTP_201_CREATED,
        )


class FeeInvoiceDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: InvoiceSerializer})
    def get(self, request, invoice_id):
        invoice = get_object_or_404(invoice_queryset(request.institute), id=invoice_id)
        return Response({"success": True, "data": InvoiceSerializer(invoice).data})

    @extend_schema(request=InvoicePatchSerializer, responses={status.HTTP_200_OK: InvoiceSerializer})
    def patch(self, request, invoice_id):
        serializer = InvoicePatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            invoice = get_object_or_404(
                FeeInvoice.objects.select_for_update(),
                id=invoice_id,
                institute=request.institute,
            )
            if values.get("status") == FeeInvoice.Status.CANCELLED:
                if invoice.payments.exists():
                    raise serializers.ValidationError(
                        {"status": ["Cannot cancel an invoice that has payments."]}
                    )
                invoice.status = FeeInvoice.Status.CANCELLED
                invoice.save(update_fields=("status", "updated_at"))
                verb, meta = "Updated", {"action": "cancelled"}
            else:
                if invoice.status != FeeInvoice.Status.DRAFT:
                    raise serializers.ValidationError(
                        {"status": ["Only draft invoices can be edited."]}
                    )
                issue_date = values.get("issueDate", invoice.issue_date)
                due_date = values.get("dueDate", invoice.due_date)
                if issue_date and due_date < issue_date:
                    raise serializers.ValidationError(
                        {"dueDate": ["Due date cannot be before the issue date."]}
                    )
                invoice.issue_date = issue_date
                invoice.due_date = due_date
                invoice.notes = values.get("notes", invoice.notes)
                if "templateId" in values:
                    invoice.template = (
                        get_object_or_404(
                            DocumentTemplate,
                            id=values["templateId"],
                            institute=request.institute,
                            category=DocumentTemplate.Category.FEE_INVOICE,
                        )
                        if values["templateId"]
                        else None
                    )
                line_items = (
                    serialize_line_items(values["lineItems"])
                    if "lineItems" in values
                    else invoice.line_items
                )
                apply_invoice_totals(
                    invoice,
                    line_items=line_items,
                    discount_amount=values.get("discountAmount", invoice.discount_amount),
                    tax_amount=values.get("taxAmount", invoice.tax_amount),
                )
                if values.get("status") == FeeInvoice.Status.ISSUED:
                    invoice.status = FeeInvoice.Status.ISSUED
                invoice.save()
                verb, meta = "Updated", {"action": "edited", "total": str(invoice.total)}
        audit_mutation(
            request=request,
            verb=verb,
            target_label=f"fee invoice {invoice.invoice_number}",
            target_type="fee_invoice",
            target_id=invoice.id,
            extra_meta={"invoiceNumber": invoice.invoice_number, **meta},
        )
        fresh = invoice_queryset(request.institute).get(id=invoice.id)
        return Response({"success": True, "data": InvoiceSerializer(fresh).data})


class BulkGenerateSerializer(serializers.Serializer):
    feePlanId = serializers.UUIDField()
    classIds = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    issueDate = serializers.DateField()
    dueDate = serializers.DateField()
    templateId = serializers.UUIDField(required=False, allow_null=True, default=None)

    def validate(self, attrs):
        if attrs["dueDate"] < attrs["issueDate"]:
            raise serializers.ValidationError(
                {"dueDate": ["Due date cannot be before the issue date."]}
            )
        return attrs


class FeeInvoiceBulkGenerateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(request=BulkGenerateSerializer, responses={status.HTTP_201_CREATED: dict})
    def post(self, request):
        serializer = BulkGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            plan = get_object_or_404(
                FeePlan.objects.select_for_update(),
                id=values["feePlanId"],
                institute=request.institute,
                is_active=True,
            )
            valid_grades = Grade.objects.filter(
                institute=request.institute, id__in=values["classIds"]
            ).count()
            if valid_grades != len(set(values["classIds"])):
                raise serializers.ValidationError(
                    {"classIds": ["One or more classes do not belong to this institute."]}
                )
            template = None
            if values["templateId"]:
                template = get_object_or_404(
                    DocumentTemplate,
                    id=values["templateId"],
                    institute=request.institute,
                    category=DocumentTemplate.Category.FEE_INVOICE,
                )
            line_items = [
                {
                    "description": item.get("head", ""),
                    "period": item.get("period", ""),
                    "qty": 1,
                    "amount": str(item.get("amount", "0")),
                }
                for item in plan.items
            ]
            subtotal, total = compute_totals(
                line_items=line_items,
                discount_amount=Decimal("0.00"),
                tax_amount=Decimal("0.00"),
            )
            if total <= 0:
                raise serializers.ValidationError(
                    {"feePlanId": ["The fee plan has no billable items."]}
                )
            enrollments = (
                StudentEnrollment.objects.filter(
                    class_section__grade_id__in=values["classIds"],
                    class_section__academic_year__is_current=True,
                    left_at__isnull=True,
                    student__institute=request.institute,
                    student__is_active=True,
                )
                .select_related("student")
            )
            students = {enrollment.student_id: enrollment.student for enrollment in enrollments}
            already_invoiced = set(
                FeeInvoice.objects.filter(
                    institute=request.institute, plan=plan, student_id__in=students.keys()
                )
                .exclude(status=FeeInvoice.Status.CANCELLED)
                .values_list("student_id", flat=True)
            )
            created = []
            for student_id, student in students.items():
                if student_id in already_invoiced:
                    continue
                invoice = FeeInvoice(
                    institute=request.institute,
                    branch=student.branch,
                    student=student,
                    plan=plan,
                    template=template,
                    invoice_number=next_document_number(
                        institute=request.institute, kind="invoice"
                    ),
                    status=FeeInvoice.Status.ISSUED,
                    issue_date=values["issueDate"],
                    due_date=values["dueDate"],
                    line_items=line_items,
                    subtotal=subtotal,
                    total=total,
                    amount=total,
                )
                invoice.save()
                created.append(invoice)
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"{len(created)} fee invoices from plan '{plan.name}'",
            target_type="fee_plan",
            target_id=plan.id,
            extra_meta={
                "feePlanId": str(plan.id),
                "createdCount": len(created),
                "skippedCount": len(students) - len(created),
                "total": str(total),
            },
        )
        return Response(
            {
                "success": True,
                "data": {"created": len(created), "skipped": len(students) - len(created)},
            },
            status=status.HTTP_201_CREATED,
        )


class PaymentSerializer(serializers.ModelSerializer):
    receiptNumber = serializers.CharField(source="receipt_number", read_only=True)
    invoiceId = serializers.UUIDField(source="invoice_id", read_only=True)
    invoiceNumber = serializers.CharField(source="invoice.invoice_number", read_only=True)
    studentId = serializers.UUIDField(source="invoice.student_id", read_only=True)
    studentName = serializers.SerializerMethodField()
    admissionNumber = serializers.CharField(
        source="invoice.student.admission_number", read_only=True
    )
    paidAt = serializers.DateTimeField(source="paid_at", read_only=True)

    class Meta:
        model = FeePayment
        fields = (
            "id", "receiptNumber", "invoiceId", "invoiceNumber", "studentId",
            "studentName", "admissionNumber", "amount", "method", "reference",
            "remarks", "paidAt",
        )

    def get_studentName(self, payment) -> str:
        return payment.invoice.student.full_name


class PaymentWriteSerializer(serializers.Serializer):
    invoiceId = serializers.UUIDField()
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    method = serializers.ChoiceField(
        choices=FeePayment.Method.choices, default=FeePayment.Method.CASH
    )
    reference = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=120
    )
    remarks = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=2000
    )


class PaymentFilterSerializer(serializers.Serializer):
    invoiceId = serializers.UUIDField(required=False)
    studentId = serializers.UUIDField(required=False)
    branchId = serializers.UUIDField(required=False)
    method = serializers.ChoiceField(choices=FeePayment.Method.choices, required=False)
    dateFrom = serializers.DateField(required=False)
    dateTo = serializers.DateField(required=False)


class FeePaymentListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: PaymentSerializer(many=True)})
    def get(self, request):
        filter_serializer = PaymentFilterSerializer(data=request.query_params)
        filter_serializer.is_valid(raise_exception=True)
        filters = filter_serializer.validated_data
        payments = FeePayment.objects.filter(institute=request.institute).select_related(
            "invoice__student"
        )
        branch_id = filters.get("branchId")
        if branch_id:
            get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
            payments = payments.filter(invoice__branch_id=branch_id)
        if filters.get("invoiceId"):
            payments = payments.filter(invoice_id=filters["invoiceId"])
        if filters.get("studentId"):
            payments = payments.filter(invoice__student_id=filters["studentId"])
        if filters.get("method"):
            payments = payments.filter(method=filters["method"])
        if filters.get("dateFrom"):
            payments = payments.filter(paid_at__date__gte=filters["dateFrom"])
        if filters.get("dateTo"):
            payments = payments.filter(paid_at__date__lte=filters["dateTo"])
        search = request.query_params.get("search", "").strip()
        if search:
            payments = payments.filter(
                Q(invoice__student__first_name__icontains=search)
                | Q(invoice__student__last_name__icontains=search)
                | Q(receipt_number__icontains=search)
                | Q(invoice__invoice_number__icontains=search)
            )
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=payments, serializer_class=PaymentSerializer
                ),
            }
        )

    @extend_schema(request=PaymentWriteSerializer, responses={status.HTTP_201_CREATED: PaymentSerializer})
    def post(self, request):
        serializer = PaymentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            invoice = get_object_or_404(
                FeeInvoice.objects.select_for_update(),
                id=values["invoiceId"],
                institute=request.institute,
            )
            if invoice.status in (FeeInvoice.Status.DRAFT, FeeInvoice.Status.CANCELLED):
                raise serializers.ValidationError(
                    {"invoiceId": ["Payments can only be recorded against issued invoices."]}
                )
            amount_paid = invoice.payments.aggregate(total=Sum("amount"))["total"] or Decimal(
                "0.00"
            )
            amount = values["amount"]
            if amount > invoice.total - amount_paid:
                raise serializers.ValidationError(
                    {"amount": ["Payment exceeds the outstanding balance."]}
                )
            payment = FeePayment.objects.create(
                institute=request.institute,
                invoice=invoice,
                amount=amount,
                receipt_number=next_document_number(institute=request.institute, kind="receipt"),
                method=values["method"],
                reference=values["reference"],
                remarks=values["remarks"],
            )
            invoice.status = resolve_status(invoice=invoice, paid_total=amount_paid + amount)
            invoice.save(update_fields=("status", "updated_at"))
        audit_mutation(
            request=request,
            verb="PAYMENT",
            target_label=(
                f"fee payment {payment.receipt_number} of {amount} "
                f"for invoice {invoice.invoice_number}"
            ),
            target_type="fee_payment",
            target_id=payment.id,
            extra_meta={
                "receiptNumber": payment.receipt_number,
                "amount": str(amount),
                "method": payment.method,
                "invoiceId": str(invoice.id),
                "invoiceNumber": invoice.invoice_number,
                "invoiceStatus": invoice.status,
            },
        )
        return Response(
            {"success": True, "data": PaymentSerializer(payment).data},
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
