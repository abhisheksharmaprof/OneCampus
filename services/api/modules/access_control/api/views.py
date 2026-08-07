from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.institutes.models import Branch
from platform_core.api.pagination import paginate_admin_queryset

from ..exceptions import AccessDenied, InvalidOperation
from ..models import UserRoleAssignment
from ..policies import require_any_permission, require_permission
from ..selectors import assignments_for_institute, role_for_institute, roles_for_institute
from ..services import assign_role, clone_role, create_role, delete_role, revoke_assignment, update_role
from .permissions import HasAccessControlSession
from .serializers import (
    AssignmentCreateSerializer,
    AssignmentSerializer,
    RoleCloneSerializer,
    RoleSerializer,
    RoleUpdateSerializer,
    RoleWriteSerializer,
)

ROLE_READ_PERMISSIONS = {"role.create", "role.assign", "role.manage_permissions"}


def _translate_domain_error(exc):
    if isinstance(exc, AccessDenied):
        raise PermissionDenied(str(exc)) from exc
    if isinstance(exc, InvalidOperation):
        raise ValidationError({exc.field: [str(exc)]}) from exc
    raise exc


def _branch(request, value, *, required=False):
    if value is None:
        if required:
            raise ValidationError({"branchId": ["This field is required."]})
        return None
    return get_object_or_404(
        Branch, id=value, institute=request.institute, is_active=True
    )


def _authorize_read(request, branch):
    try:
        require_any_permission(
            actor=request.user,
            institute=request.institute,
            permission_keys=ROLE_READ_PERMISSIONS,
            branch=branch,
        )
    except AccessDenied as exc:
        _translate_domain_error(exc)


def _authorize_assign(request, branch):
    try:
        require_permission(
            actor=request.user,
            institute=request.institute,
            permission_key="role.assign",
            branch=branch,
        )
    except AccessDenied as exc:
        _translate_domain_error(exc)


class RoleListCreateView(APIView):
    permission_classes = (HasAccessControlSession,)

    def get(self, request):
        branch = _branch(request, request.query_params.get("branchId"))
        _authorize_read(request, branch)
        queryset = roles_for_institute(institute=request.institute, branch=branch)
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(name__icontains=search)
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=queryset, serializer_class=RoleSerializer
                ),
            }
        )

    def post(self, request):
        serializer = RoleWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = _branch(request, data.get("branchId"))
        try:
            role = create_role(
                actor=request.user,
                institute=request.institute,
                name=data["name"],
                description=data.get("description", ""),
                branch=branch,
                permission_keys=data["permissionKeys"],
                configurations=data.get("permissionOptions", {}),
            )
        except (AccessDenied, InvalidOperation) as exc:
            _translate_domain_error(exc)
        role = role_for_institute(institute=request.institute, role_id=role.id)
        return Response(
            {"success": True, "data": RoleSerializer(role).data},
            status=status.HTTP_201_CREATED,
        )


class RoleDetailView(APIView):
    permission_classes = (HasAccessControlSession,)

    def get(self, request, role_id):
        branch = _branch(request, request.query_params.get("branchId"))
        _authorize_read(request, branch)
        role = get_object_or_404(
            roles_for_institute(institute=request.institute, branch=branch), id=role_id
        )
        return Response({"success": True, "data": RoleSerializer(role).data})

    def patch(self, request, role_id):
        role = get_object_or_404(
            roles_for_institute(institute=request.institute), id=role_id
        )
        serializer = RoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch_marker = "branchId" in data
        branch = _branch(request, data.get("branchId")) if branch_marker else None
        try:
            role = update_role(
                actor=request.user,
                role=role,
                name=data.get("name"),
                description=data.get("description"),
                branch_marker=branch_marker,
                branch=branch,
                permission_keys=data.get("permissionKeys"),
                configurations=data.get("permissionOptions"),
            )
        except (AccessDenied, InvalidOperation) as exc:
            _translate_domain_error(exc)
        role = role_for_institute(institute=request.institute, role_id=role.id)
        return Response({"success": True, "data": RoleSerializer(role).data})

    def delete(self, request, role_id):
        role = get_object_or_404(roles_for_institute(institute=request.institute), id=role_id)
        try:
            delete_role(actor=request.user, role=role)
        except (AccessDenied, InvalidOperation) as exc:
            _translate_domain_error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoleCloneView(APIView):
    permission_classes = (HasAccessControlSession,)

    def post(self, request, role_id):
        serializer = RoleCloneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = _branch(request, data.get("branchId"))
        source = get_object_or_404(
            roles_for_institute(institute=request.institute, branch=branch), id=role_id
        )
        try:
            role = clone_role(
                actor=request.user,
                institute=request.institute,
                source=source,
                name=data["name"],
                description=data.get("description"),
                branch=branch,
            )
        except (AccessDenied, InvalidOperation) as exc:
            _translate_domain_error(exc)
        role = role_for_institute(institute=request.institute, role_id=role.id)
        return Response(
            {"success": True, "data": RoleSerializer(role).data},
            status=status.HTTP_201_CREATED,
        )


class AssignmentListCreateView(APIView):
    permission_classes = (HasAccessControlSession,)

    def get(self, request):
        branch = _branch(request, request.query_params.get("branchId"))
        _authorize_assign(request, branch)
        queryset = assignments_for_institute(institute=request.institute, branch=branch)
        if request.query_params.get("userId"):
            queryset = queryset.filter(user_id=request.query_params["userId"])
        if request.query_params.get("roleId"):
            queryset = queryset.filter(role_id=request.query_params["roleId"])
        if request.query_params.get("isActive") in {"true", "false"}:
            queryset = queryset.filter(is_active=request.query_params["isActive"] == "true")
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request,
                    queryset=queryset,
                    serializer_class=AssignmentSerializer,
                ),
            }
        )

    def post(self, request):
        serializer = AssignmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = _branch(request, data.get("branchId"))
        role = get_object_or_404(
            roles_for_institute(institute=request.institute), id=data["roleId"]
        )
        try:
            assignment = assign_role(
                actor=request.user,
                institute=request.institute,
                user=data["user"],
                role=role,
                branch=branch,
                valid_from=data.get("validFrom"),
                valid_until=data.get("validUntil"),
            )
        except (AccessDenied, InvalidOperation) as exc:
            _translate_domain_error(exc)
        assignment = assignments_for_institute(institute=request.institute).get(id=assignment.id)
        return Response(
            {"success": True, "data": AssignmentSerializer(assignment).data},
            status=status.HTTP_201_CREATED,
        )


class AssignmentRevokeView(APIView):
    permission_classes = (HasAccessControlSession,)

    def post(self, request, assignment_id):
        assignment = get_object_or_404(
            UserRoleAssignment, id=assignment_id, institute=request.institute
        )
        try:
            assignment = revoke_assignment(actor=request.user, assignment=assignment)
        except (AccessDenied, InvalidOperation) as exc:
            _translate_domain_error(exc)
        assignment = assignments_for_institute(institute=request.institute).get(id=assignment.id)
        return Response({"success": True, "data": AssignmentSerializer(assignment).data})
