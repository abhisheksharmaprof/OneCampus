from decimal import Decimal

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.finance.models import FinanceSettings
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from platform_core.api.audit import audit_mutation

PREFIX_PATTERN = r"^[A-Z0-9]{1,10}$"


class FinanceSettingsSerializer(serializers.ModelSerializer):
    invoicePrefix = serializers.CharField(source="invoice_prefix", read_only=True)
    receiptPrefix = serializers.CharField(source="receipt_prefix", read_only=True)
    taxLabel = serializers.CharField(source="tax_label", read_only=True)
    taxPercent = serializers.DecimalField(
        source="tax_percent", max_digits=5, decimal_places=2, read_only=True
    )
    invoiceFooter = serializers.CharField(source="invoice_footer", read_only=True)
    receiptFooter = serializers.CharField(source="receipt_footer", read_only=True)

    class Meta:
        model = FinanceSettings
        fields = (
            "invoicePrefix", "receiptPrefix", "taxLabel", "taxPercent",
            "invoiceFooter", "receiptFooter",
        )


class FinanceSettingsWriteSerializer(serializers.Serializer):
    invoicePrefix = serializers.RegexField(PREFIX_PATTERN, required=False)
    receiptPrefix = serializers.RegexField(PREFIX_PATTERN, required=False)
    taxLabel = serializers.CharField(max_length=40, required=False, allow_blank=True)
    taxPercent = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0.00"),
        max_value=Decimal("100.00"), required=False,
    )
    invoiceFooter = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    receiptFooter = serializers.CharField(required=False, allow_blank=True, max_length=2000)


FIELD_MAP = {
    "invoicePrefix": "invoice_prefix",
    "receiptPrefix": "receipt_prefix",
    "taxLabel": "tax_label",
    "taxPercent": "tax_percent",
    "invoiceFooter": "invoice_footer",
    "receiptFooter": "receipt_footer",
}


class FinanceSettingsView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: FinanceSettingsSerializer})
    def get(self, request):
        settings, _ = FinanceSettings.objects.get_or_create(institute=request.institute)
        return Response({"success": True, "data": FinanceSettingsSerializer(settings).data})

    @extend_schema(
        request=FinanceSettingsWriteSerializer,
        responses={status.HTTP_200_OK: FinanceSettingsSerializer},
    )
    def patch(self, request):
        serializer = FinanceSettingsWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        settings, _ = FinanceSettings.objects.get_or_create(institute=request.institute)
        changed, changed_camel = [], []
        for camel, snake in FIELD_MAP.items():
            if camel in serializer.validated_data:
                setattr(settings, snake, serializer.validated_data[camel])
                changed.append(snake)
                changed_camel.append(camel)
        if changed:
            settings.save(update_fields=(*changed, "updated_at"))
            audit_mutation(
                request=request,
                verb="Updated",
                target_label="finance settings",
                target_type="finance_settings",
                target_id=settings.id,
                extra_meta={"changedFields": changed_camel},
            )
        return Response({"success": True, "data": FinanceSettingsSerializer(settings).data})
