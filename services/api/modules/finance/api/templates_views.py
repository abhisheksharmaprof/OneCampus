import json

from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.finance.models import InvoiceTemplate
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


def preset_layout(*, title, primary, accent, font, density, columns, note, show_signature):
    return {
        "branding": {
            "mode": "institute",
            "name": "",
            "address": "",
            "phone": "",
            "email": "",
            "logoUrl": "",
            "primary": primary,
            "accent": accent,
        },
        "font": font,
        "density": density,
        "header": {
            "title": title,
            "fields": ["{{invoice_no}}", "{{issue_date}}", "{{due_date}}"],
        },
        "columns": columns,
        "computed": {
            "showSubtotal": True,
            "showDiscount": True,
            "showTax": True,
            "showGrandTotal": True,
        },
        "footer": {"note": note, "showSignature": show_signature},
        "showStudentDetails": True,
    }


PRESETS = [
    {
        "name": "Classic letterhead",
        "kind": InvoiceTemplate.Kind.INVOICE,
        "is_default": True,
        "layout": preset_layout(
            title="FEE INVOICE", primary="#143f5c", accent="#16a085",
            font="Inter", density="comfortable",
            columns=[
                {"id": "description", "label": "Fee description", "width": 44, "align": "left", "enabled": True},
                {"id": "period", "label": "Period", "width": 18, "align": "left", "enabled": True},
                {"id": "qty", "label": "Qty", "width": 10, "align": "center", "enabled": True},
                {"id": "amount", "label": "Amount", "width": 28, "align": "right", "enabled": True},
            ],
            note="This is a computer-generated invoice. Thank you for your prompt payment.",
            show_signature=True,
        ),
    },
    {
        "name": "Modern colour band",
        "kind": InvoiceTemplate.Kind.INVOICE,
        "is_default": False,
        "layout": preset_layout(
            title="FEE INVOICE", primary="#234e52", accent="#d69e2e",
            font="Arial", density="comfortable",
            columns=[
                {"id": "description", "label": "Particulars", "width": 52, "align": "left", "enabled": True},
                {"id": "qty", "label": "Qty", "width": 12, "align": "center", "enabled": True},
                {"id": "amount", "label": "Amount", "width": 36, "align": "right", "enabled": True},
            ],
            note="Please retain this document for your records.",
            show_signature=False,
        ),
    },
    {
        "name": "Compact counter receipt",
        "kind": InvoiceTemplate.Kind.RECEIPT,
        "is_default": True,
        "layout": preset_layout(
            title="FEE RECEIPT", primary="#2d3748", accent="#3182ce",
            font="Arial", density="compact",
            columns=[
                {"id": "description", "label": "Description", "width": 60, "align": "left", "enabled": True},
                {"id": "amount", "label": "Paid amount", "width": 40, "align": "right", "enabled": True},
            ],
            note="Payment received with thanks.",
            show_signature=True,
        ),
    },
]


def seed_presets(request):
    if InvoiceTemplate.objects.filter(institute=request.institute).exists():
        return
    try:
        with transaction.atomic():
            for preset in PRESETS:
                InvoiceTemplate.objects.create(
                    institute=request.institute,
                    name=preset["name"],
                    kind=preset["kind"],
                    layout=preset["layout"],
                    is_default=preset["is_default"],
                    created_by=request.user,
                )
    except IntegrityError:
        # A concurrent request seeded first; the constraint on default
        # templates rejects the duplicate seed — nothing to do.
        pass


class TemplateSerializer(serializers.ModelSerializer):
    isDefault = serializers.BooleanField(source="is_default", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = InvoiceTemplate
        fields = ("id", "name", "kind", "layout", "isDefault", "createdAt")


class TemplateWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    kind = serializers.ChoiceField(choices=InvoiceTemplate.Kind.choices)
    layout = serializers.JSONField(default=dict)
    isDefault = serializers.BooleanField(default=False)

    def validate_layout(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Layout must be an object.")
        if len(json.dumps(value)) > 65536:
            raise serializers.ValidationError("Layout is too large (max 64 KB).")
        return value


class TemplatePatchSerializer(TemplateWriteSerializer):
    name = serializers.CharField(max_length=120, required=False)
    kind = serializers.ChoiceField(choices=InvoiceTemplate.Kind.choices, required=False)
    layout = serializers.JSONField(required=False)
    isDefault = serializers.BooleanField(required=False)


def make_default(template):
    InvoiceTemplate.objects.filter(
        institute=template.institute, kind=template.kind, is_default=True
    ).exclude(id=template.id).update(is_default=False)
    template.is_default = True


class InvoiceTemplateListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: TemplateSerializer(many=True)})
    def get(self, request):
        seed_presets(request)
        templates = InvoiceTemplate.objects.filter(institute=request.institute)
        kind = request.query_params.get("kind", "").strip().upper()
        if kind in InvoiceTemplate.Kind.values:
            templates = templates.filter(kind=kind)
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=templates, serializer_class=TemplateSerializer
                ),
            }
        )

    @extend_schema(request=TemplateWriteSerializer, responses={status.HTTP_201_CREATED: TemplateSerializer})
    def post(self, request):
        serializer = TemplateWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            template = InvoiceTemplate(
                institute=request.institute,
                name=values["name"],
                kind=values["kind"],
                layout=values["layout"],
                created_by=request.user,
            )
            if values["isDefault"]:
                make_default(template)
            template.save()
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"invoice template '{template.name}'",
            target_type="invoice_template",
            target_id=template.id,
            extra_meta={"kind": template.kind, "isDefault": template.is_default},
        )
        return Response(
            {"success": True, "data": TemplateSerializer(template).data},
            status=status.HTTP_201_CREATED,
        )


class InvoiceTemplateDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: TemplateSerializer})
    def get(self, request, template_id):
        template = get_object_or_404(
            InvoiceTemplate, id=template_id, institute=request.institute
        )
        return Response({"success": True, "data": TemplateSerializer(template).data})

    @extend_schema(request=TemplatePatchSerializer, responses={status.HTTP_200_OK: TemplateSerializer})
    def patch(self, request, template_id):
        serializer = TemplatePatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            template = get_object_or_404(
                InvoiceTemplate.objects.select_for_update(),
                id=template_id,
                institute=request.institute,
            )
            new_kind = values.get("kind", template.kind)
            if new_kind != template.kind and template.is_default:
                raise serializers.ValidationError(
                    {
                        "kind": [
                            "The default template's kind cannot be changed. "
                            "Set another default for its kind first."
                        ]
                    }
                )
            template.name = values.get("name", template.name)
            template.kind = values.get("kind", template.kind)
            template.layout = values.get("layout", template.layout)
            if values.get("isDefault"):
                make_default(template)
            template.save()
        audit_mutation(
            request=request,
            verb="Updated",
            target_label=f"invoice template '{template.name}'",
            target_type="invoice_template",
            target_id=template.id,
            extra_meta={"kind": template.kind, "isDefault": template.is_default},
        )
        return Response({"success": True, "data": TemplateSerializer(template).data})

    def delete(self, request, template_id):
        with transaction.atomic():
            template = get_object_or_404(
                InvoiceTemplate.objects.select_for_update(),
                id=template_id,
                institute=request.institute,
            )
            if template.is_default:
                raise serializers.ValidationError(
                    {"id": ["The default template cannot be deleted. Set another default first."]}
                )
            name = template.name
            template.delete()
        audit_mutation(
            request=request,
            verb="Deleted",
            target_label=f"invoice template '{name}'",
            target_type="invoice_template",
            target_id=template_id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
