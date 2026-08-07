from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.identity.models import User
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch, InstituteMembership
from modules.people.models import ParentProfile, Student, StudentGuardian
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


class ParentSerializer(serializers.ModelSerializer):
    fullName = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    children = serializers.SerializerMethodField()
    portalAccess = serializers.BooleanField(source="user.is_active", read_only=True)
    lastLogin = serializers.DateTimeField(source="user.last_login", read_only=True)

    class Meta:
        model = ParentProfile
        fields = ("id", "fullName", "email", "phone", "children", "portalAccess", "lastLogin")

    def get_fullName(self, value: ParentProfile) -> str:
        return f"{value.user.first_name} {value.user.last_name}".strip() or value.user.email

    def get_children(self, value: ParentProfile) -> list[dict[str, str]]:
        links = getattr(value, "active_student_links", None)
        if links is None:
            links = value.student_links.select_related("student").filter(
                student__is_active=True
            )
        return [
            {
                "id": str(link.student_id),
                "name": link.student.full_name,
                "relationship": link.relationship,
                "isPrimaryContact": link.is_primary_contact,
            }
            for link in links
        ]


class ParentWriteSerializer(serializers.Serializer):
    fullName = serializers.CharField(max_length=200, trim_whitespace=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, trim_whitespace=True)
    studentId = serializers.UUIDField()
    relationship = serializers.ChoiceField(choices=StudentGuardian.Relationship.choices)
    isPrimaryContact = serializers.BooleanField(required=False, default=True)


class ExistingParentLinkSerializer(serializers.Serializer):
    studentId = serializers.UUIDField()
    relationship = serializers.ChoiceField(choices=StudentGuardian.Relationship.choices)
    isPrimaryContact = serializers.BooleanField(required=False, default=True)


class ParentStudentLinkView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(
        request=ExistingParentLinkSerializer, responses={status.HTTP_201_CREATED: ParentSerializer}
    )
    def post(self, request, parent_id):
        serializer = ExistingParentLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        parent = get_object_or_404(ParentProfile, id=parent_id, institute=request.institute)
        student = get_object_or_404(
            Student,
            id=serializer.validated_data["studentId"],
            institute=request.institute,
            is_active=True,
        )
        if StudentGuardian.objects.filter(parent=parent, student=student).exists():
            raise serializers.ValidationError(
                {"studentId": ["This parent is already linked to the student."]}
            )
        StudentGuardian.objects.create(parent=parent, student=student, relationship=serializer.validated_data["relationship"], is_primary_contact=serializer.validated_data.get("isPrimaryContact", True))
        audit_mutation(
            request=request,
            verb="LINK",
            target_label=f"parent {parent.user.get_full_name()} to student {student.full_name}",
            target_type="guardian_link",
            target_id=student.id,
        )
        return Response(
            {"success": True, "data": ParentSerializer(parent).data}, status=status.HTTP_201_CREATED
        )


class ParentListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: ParentSerializer(many=True)})
    def get(self, request):
        parents = (
            ParentProfile.objects.filter(institute=request.institute)
            .select_related("user")
            .prefetch_related(
                Prefetch(
                    "student_links",
                    queryset=StudentGuardian.objects.filter(student__is_active=True).select_related(
                        "student"
                    ),
                    to_attr="active_student_links",
                )
            )
        )
        branch_id = request.query_params.get("branchId")
        if branch_id:
            get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
            parents = parents.filter(
                student_links__student__branch_id=branch_id,
                student_links__student__is_active=True,
            ).distinct()
        search = request.query_params.get("search", "").strip()
        if search:
            parents = parents.filter(user__first_name__icontains=search) | parents.filter(user__last_name__icontains=search) | parents.filter(user__phone__icontains=search) | parents.filter(user__email__icontains=search)
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=parents, serializer_class=ParentSerializer
                ),
            }
        )

    @extend_schema(
        request=ParentWriteSerializer,
        responses={status.HTTP_201_CREATED: ParentSerializer},
    )
    def post(self, request):
        serializer = ParentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not data.get("email"):
            data["email"] = f"parent+{''.join(ch for ch in data['phone'] if ch.isdigit())}@local.invalid"
        student = get_object_or_404(
            Student, id=data["studentId"], institute=request.institute, is_active=True
        )
        first_name, *rest = data["fullName"].split(maxsplit=1)
        with transaction.atomic():
            # Phone is the stable identifier used by the admin UI when
            # importing students. Reuse an existing parent account instead
            # of creating duplicate profiles when siblings are imported.
            existing_parent = (
                ParentProfile.objects.select_for_update()
                .select_related("user")
                .filter(institute=request.institute, user__phone=data["phone"])
                .first()
            )
            if existing_parent:
                if StudentGuardian.objects.filter(parent=existing_parent, student=student).exists():
                    raise serializers.ValidationError(
                        {"studentId": ["This parent is already linked to the student."]}
                    )
                StudentGuardian.objects.create(
                    parent=existing_parent,
                    student=student,
                    relationship=data["relationship"],
                    is_primary_contact=data.get("isPrimaryContact", True),
                )
                return Response(
                    {"success": True, "data": ParentSerializer(existing_parent).data},
                    status=status.HTTP_201_CREATED,
                )
            if User.objects.filter(email__iexact=data["email"]).exists():
                raise serializers.ValidationError(
                    {"email": ["An account with this email already exists."]}
                )
            user = User.objects.create_user(
                email=data["email"],
                password=None,
                first_name=first_name,
                last_name=rest[0] if rest else "",
                phone=data["phone"],
                is_active=False,
            )
            user.set_unusable_password()
            user.save(update_fields=("password",))
            InstituteMembership.objects.create(
                user=user,
                institute=request.institute,
                branch=student.branch,
                role=InstituteMembership.Role.PARENT,
            )
            parent = ParentProfile.objects.create(institute=request.institute, user=user)
            StudentGuardian.objects.create(
                parent=parent,
                student=student,
                relationship=data["relationship"],
                is_primary_contact=data.get("isPrimaryContact", True),
            )
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"parent {parent.user.get_full_name()}",
            target_type="parent",
            target_id=parent.id,
        )
        return Response(
            {"success": True, "data": ParentSerializer(parent).data}, status=status.HTTP_201_CREATED
        )
