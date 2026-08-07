from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.admissions.models import Enquiry
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


class EnquirySerializer(serializers.ModelSerializer):
    guardianName = serializers.CharField(source="guardian_name")
    contactEmail = serializers.EmailField(source="contact_email", required=False, allow_blank=True)
    branchId = serializers.UUIDField(source="branch_id", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = Enquiry
        fields = ("id", "guardianName", "contactEmail", "status", "branchId", "createdAt")


class EnquiryWriteSerializer(serializers.Serializer):
    guardianName = serializers.CharField(max_length=200, trim_whitespace=True)
    contactEmail = serializers.EmailField(required=False, allow_blank=True)
    branchId = serializers.UUIDField(required=False, allow_null=True)
    status = serializers.ChoiceField(choices=Enquiry.Status.choices, required=False)


class EnquiryListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: EnquirySerializer(many=True)})
    def get(self, request):
        enquiries = Enquiry.objects.filter(institute=request.institute)
        branch_id = request.query_params.get("branchId")
        if branch_id:
            branch = get_object_or_404(Branch, id=branch_id, institute=request.institute)
            enquiries = enquiries.filter(branch=branch)
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=enquiries, serializer_class=EnquirySerializer
                ),
            }
        )

    @extend_schema(
        request=EnquiryWriteSerializer,
        responses={status.HTTP_201_CREATED: EnquirySerializer},
    )
    def post(self, request):
        serializer = EnquiryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch = None
        if serializer.validated_data.get("branchId"):
            branch = get_object_or_404(
                Branch,
                id=serializer.validated_data["branchId"],
                institute=request.institute,
                is_active=True,
            )
        enquiry = Enquiry.objects.create(
            institute=request.institute,
            branch=branch,
            guardian_name=serializer.validated_data["guardianName"],
            contact_email=serializer.validated_data.get("contactEmail", ""),
            status=serializer.validated_data.get("status", Enquiry.Status.ENQUIRY),
        )
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"admission enquiry from {enquiry.guardian_name}",
            target_type="enquiry",
            target_id=enquiry.id,
        )
        return Response(
            {"success": True, "data": EnquirySerializer(enquiry).data},
            status=status.HTTP_201_CREATED,
        )
