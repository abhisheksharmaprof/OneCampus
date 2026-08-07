from django.db.models import Case, Count, F, Q, UUIDField, When
from django.db import transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.access_control.exceptions import AccessDenied
from modules.access_control.policies import require_any_permission, require_permission
from modules.access_control.selectors import effective_permission_keys
from modules.institutes.models import Branch, Institute, InstituteAssociation, InstituteMembership
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset

from .admin_serializers import (
    BranchCreateSerializer,
    BranchListSuccessSerializer,
    BranchSerializer,
    BranchSuccessSerializer,
    BranchUpdateSerializer,
    InstituteSerializer,
    InstituteSuccessSerializer,
    InstituteUpdateSerializer,
    CreatePeerInstituteSerializer,
    LinkPeerInstituteSerializer,
    PeerInstituteListSuccessSerializer,
    PeerInstituteSerializer,
)
from .permissions import IsCurrentInstituteAdmin


def _require(request, permission_key):
    try:
        require_permission(
            actor=request.user,
            institute=request.institute,
            permission_key=permission_key,
            branch=(
                request.institute_membership.branch
                if request.institute_membership.role == InstituteMembership.Role.BRANCH_ADMIN
                else None
            ),
        )
    except AccessDenied as exc:
        raise PermissionDenied(str(exc)) from exc


class CurrentInstituteView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: InstituteSuccessSerializer})
    def get(self, request):
        return Response({"success": True, "data": InstituteSerializer(request.institute).data})

    @extend_schema(
        request=InstituteUpdateSerializer,
        responses={status.HTTP_200_OK: InstituteSuccessSerializer},
    )
    def patch(self, request):
        _require(request, "institute.manage_settings")
        serializer = InstituteUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(request.institute, field, value)
        request.institute.save(update_fields=(*serializer.validated_data.keys(), "updated_at"))
        audit_mutation(
            request=request,
            verb="Updated",
            target_label=f"institute {request.institute.name}",
            target_type="institute",
            target_id=request.institute.id,
            extra_meta={"changedFields": list(serializer.validated_data.keys())},
        )
        return Response({"success": True, "data": InstituteSerializer(request.institute).data})


class BranchListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: BranchListSuccessSerializer})
    def get(self, request):
        # Branch admins may see their own current branch.  The complete branch
        # list is reserved for institute admins or an explicit institute-wide
        # view permission.
        can_view_all = "institute.view_all_branches" in effective_permission_keys(
            user=request.user, institute=request.institute, branch=None
        )
        if request.institute_membership.role == InstituteMembership.Role.BRANCH_ADMIN and not can_view_all:
            branches = _branch_queryset(request.institute).filter(
                id=request.institute_membership.branch_id
            )
        else:
            require_any_permission(
                actor=request.user,
                institute=request.institute,
                permission_keys=("institute.manage_branches", "institute.view_all_branches"),
            )
            branches = _branch_queryset(request.institute)
        branches = branches.order_by("name")
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=branches, serializer_class=BranchSerializer
                ),
            }
        )

    @extend_schema(
        request=BranchCreateSerializer,
        responses={status.HTTP_201_CREATED: BranchSuccessSerializer},
    )
    def post(self, request):
        _require(request, "institute.manage_branches")
        serializer = BranchCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch = serializer.save(institute=request.institute)
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"branch {branch.name}",
            target_type="branch",
            target_id=branch.id,
        )
        return Response(
            {"success": True, "data": BranchSerializer(branch).data},
            status=status.HTTP_201_CREATED,
        )


class BranchDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: BranchSuccessSerializer})
    def get(self, request, branch_id):
        _require(request, "institute.manage_branches")
        branch = get_object_or_404(_branch_queryset(request.institute), id=branch_id)
        return Response({"success": True, "data": BranchSerializer(branch).data})

    @extend_schema(
        request=BranchUpdateSerializer,
        responses={status.HTTP_200_OK: BranchSuccessSerializer},
    )
    def patch(self, request, branch_id):
        _require(request, "institute.manage_branches")
        branch = get_object_or_404(Branch, id=branch_id, institute=request.institute)
        serializer = BranchUpdateSerializer(branch, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        branch = serializer.save()
        audit_mutation(
            request=request,
            verb="Updated",
            target_label=f"branch {branch.name}",
            target_type="branch",
            target_id=branch.id,
        )
        return Response({"success": True, "data": BranchSerializer(branch).data})


class PeerInstituteListView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: PeerInstituteListSuccessSerializer})
    def get(self, request):
        _require(request, "institute.manage_branches")
        peers = InstituteAssociation.objects.filter(
            Q(institute_one=request.institute) | Q(institute_two=request.institute)
        )
        peer_ids = peers.values("institute_one_id", "institute_two_id")
        institute_ids = []
        for row in peer_ids:
            institute_ids.append(
                row["institute_two_id"]
                if row["institute_one_id"] == request.institute.id
                else row["institute_one_id"]
            )
        peers = Institute.objects.filter(id__in=institute_ids).annotate(
            association_id=Case(
                When(
                    peer_associations_as_one__institute_two=request.institute,
                    then=F("peer_associations_as_one__id"),
                ),
                When(
                    peer_associations_as_two__institute_one=request.institute,
                    then=F("peer_associations_as_two__id"),
                ),
                output_field=UUIDField(),
            )
        )
        # Peer associations are metadata only; this list intentionally has no
        # membership, student, staff, or finance data from the other tenant.
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=peers, serializer_class=PeerInstituteSerializer
                ),
            }
        )


class CreatePeerInstituteView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(request=CreatePeerInstituteSerializer, responses={status.HTTP_201_CREATED: PeerInstituteSerializer})
    @transaction.atomic
    def post(self, request):
        _require(request, "institute.manage_branches")
        serializer = CreatePeerInstituteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        peer = serializer.save(actor=request.user, source_institute=request.institute)
        return Response({"success": True, "data": PeerInstituteSerializer(peer).data}, status=status.HTTP_201_CREATED)


class LinkPeerInstituteView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(request=LinkPeerInstituteSerializer, responses={status.HTTP_201_CREATED: PeerInstituteSerializer})
    @transaction.atomic
    def post(self, request):
        _require(request, "institute.manage_branches")
        serializer = LinkPeerInstituteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        peer = serializer.validated_data["instituteId"]
        if peer.id == request.institute.id:
            return Response(
                {"success": False, "error": {"code": "VALIDATION_ERROR", "message": "An institute cannot be linked to itself."}},
                status=status.HTTP_400_BAD_REQUEST,
            )
        association, created = InstituteAssociation.link(request.institute, peer)
        peer.association_id = association.id
        return Response(
            {"success": True, "data": PeerInstituteSerializer(peer).data},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class InstituteAssociationListCreateView(APIView):
    """UI-facing peer association endpoint with explicit create/link actions."""

    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        return PeerInstituteListView().get(request)

    @transaction.atomic
    def post(self, request):
        _require(request, "institute.manage_branches")
        action = request.data.get("action")
        payload = request.data.copy()
        payload.pop("action", None)
        if action == "create":
            serializer = CreatePeerInstituteSerializer(data=payload)
            serializer.is_valid(raise_exception=True)
            peer = serializer.save(actor=request.user, source_institute=request.institute)
            return Response(
                {"success": True, "data": PeerInstituteSerializer(peer).data},
                status=status.HTTP_201_CREATED,
            )
        if action == "link":
            serializer = LinkPeerInstituteSerializer(data=payload)
            serializer.is_valid(raise_exception=True)
            peer = serializer.validated_data["instituteId"]
            if peer.id == request.institute.id:
                return Response(
                    {
                        "success": False,
                        "error": {
                            "code": "VALIDATION_ERROR",
                            "message": "An institute cannot be linked to itself.",
                        },
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            association, created = InstituteAssociation.link(request.institute, peer)
            peer.association_id = association.id
            return Response(
                {"success": True, "data": PeerInstituteSerializer(peer).data},
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )
        return Response(
            {
                "success": False,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "action must be either 'create' or 'link'.",
                },
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

def _branch_queryset(institute):
    return institute.branches.annotate(
        student_count=Count("students", filter=Q(students__is_active=True), distinct=True),
        staff_count=Count(
            "memberships__user__staff_profiles",
            filter=Q(memberships__is_active=True),
            distinct=True,
        ),
        section_count=Count("class_sections", distinct=True),
    )
