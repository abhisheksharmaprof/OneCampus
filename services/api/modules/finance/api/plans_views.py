from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import Grade
from modules.finance.models import FeePlan
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


class PlanItemSerializer(serializers.Serializer):
    head = serializers.CharField(max_length=120)
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.00")
    )
    period = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")


class FeePlanSerializer(serializers.ModelSerializer):
    academicYear = serializers.CharField(source="academic_year", read_only=True)
    appliesTo = serializers.JSONField(source="applies_to", read_only=True)
    isActive = serializers.BooleanField(source="is_active", read_only=True)
    branchId = serializers.UUIDField(source="branch_id", read_only=True)

    class Meta:
        model = FeePlan
        fields = ("id", "name", "academicYear", "appliesTo", "items", "isActive", "branchId")


class FeePlanWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    academicYear = serializers.CharField(
        max_length=16, required=False, allow_blank=True, default=""
    )
    branchId = serializers.UUIDField(required=False, allow_null=True, default=None)
    appliesTo = serializers.ListField(child=serializers.UUIDField(), default=list)
    items = PlanItemSerializer(many=True, allow_empty=False)
    isActive = serializers.BooleanField(default=True)


class FeePlanPatchSerializer(FeePlanWriteSerializer):
    name = serializers.CharField(max_length=120, required=False)
    items = PlanItemSerializer(many=True, allow_empty=False, required=False)
    isActive = serializers.BooleanField(required=False)


def serialize_items(validated_items):
    return [
        {
            "head": item["head"],
            "amount": str(item["amount"]),
            "period": item.get("period", ""),
        }
        for item in validated_items
    ]


def validate_applies_to(request, grade_ids):
    grade_ids = [str(grade_id) for grade_id in grade_ids]
    if not grade_ids:
        return []
    found = Grade.objects.filter(institute=request.institute, id__in=grade_ids).count()
    if found != len(set(grade_ids)):
        raise serializers.ValidationError(
            {"appliesTo": ["One or more classes do not belong to this institute."]}
        )
    return list(dict.fromkeys(grade_ids))


class FeePlanListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: FeePlanSerializer(many=True)})
    def get(self, request):
        plans = FeePlan.objects.filter(institute=request.institute)
        if request.query_params.get("includeInactive") != "true":
            plans = plans.filter(is_active=True)
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=plans, serializer_class=FeePlanSerializer
                ),
            }
        )

    @extend_schema(request=FeePlanWriteSerializer, responses={status.HTTP_201_CREATED: FeePlanSerializer})
    def post(self, request):
        serializer = FeePlanWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        branch = None
        if values["branchId"]:
            branch = get_object_or_404(
                Branch, id=values["branchId"], institute=request.institute, is_active=True
            )
        plan = FeePlan.objects.create(
            institute=request.institute,
            branch=branch,
            name=values["name"],
            academic_year=values["academicYear"],
            applies_to=validate_applies_to(request, values["appliesTo"]),
            items=serialize_items(values["items"]),
            is_active=values["isActive"],
        )
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"fee plan '{plan.name}'",
            target_type="fee_plan",
            target_id=plan.id,
            extra_meta={"itemCount": len(plan.items), "academicYear": plan.academic_year},
        )
        return Response(
            {"success": True, "data": FeePlanSerializer(plan).data},
            status=status.HTTP_201_CREATED,
        )


class FeePlanDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: FeePlanSerializer})
    def get(self, request, plan_id):
        plan = get_object_or_404(FeePlan, id=plan_id, institute=request.institute)
        return Response({"success": True, "data": FeePlanSerializer(plan).data})

    @extend_schema(request=FeePlanPatchSerializer, responses={status.HTTP_200_OK: FeePlanSerializer})
    def patch(self, request, plan_id):
        serializer = FeePlanPatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        plan = get_object_or_404(FeePlan, id=plan_id, institute=request.institute)
        plan.name = values.get("name", plan.name)
        if "academicYear" in values:
            plan.academic_year = values["academicYear"]
        if "branchId" in values:
            plan.branch = (
                get_object_or_404(
                    Branch, id=values["branchId"], institute=request.institute, is_active=True
                )
                if values["branchId"]
                else None
            )
        if "appliesTo" in values:
            plan.applies_to = validate_applies_to(request, values["appliesTo"])
        if "items" in values:
            plan.items = serialize_items(values["items"])
        if "isActive" in values:
            plan.is_active = values["isActive"]
        plan.save()
        audit_mutation(
            request=request,
            verb="Updated",
            target_label=f"fee plan '{plan.name}'",
            target_type="fee_plan",
            target_id=plan.id,
            extra_meta={"itemCount": len(plan.items), "isActive": plan.is_active},
        )
        return Response({"success": True, "data": FeePlanSerializer(plan).data})

    def delete(self, request, plan_id):
        with transaction.atomic():
            plan = get_object_or_404(
                FeePlan.objects.select_for_update(), id=plan_id, institute=request.institute
            )
            if plan.invoices.exists():
                plan.is_active = False
                plan.save(update_fields=("is_active", "updated_at"))
                action = "deactivated (referenced by invoices)"
            else:
                plan.delete()
                action = "deleted"
        audit_mutation(
            request=request,
            verb="Deleted",
            target_label=f"fee plan '{plan.name}'",
            target_type="fee_plan",
            target_id=plan_id,
            extra_meta={"action": action},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
