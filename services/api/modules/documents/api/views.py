from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.documents.id_cards import batch_fingerprint, layout_issues, resolve_id_cards
from modules.documents.models import DocumentTemplate, DocumentTemplateVersion
from modules.documents.presets import PRESETS
from modules.documents.validators import validate_layout
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


class DocumentTemplateSerializer(serializers.ModelSerializer):
    isDefault = serializers.BooleanField(source="is_default", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    publishedVersion = serializers.SerializerMethodField()

    def get_publishedVersion(self, template):
        version = template.published_version
        if version:
            return {
                "id": str(version.id),
                "version": version.version,
                "name": version.name,
                "layout": version.layout,
            }
        return None

    class Meta:
        model = DocumentTemplate
        fields = ("id", "name", "category", "layout", "isDefault", "createdAt", "publishedVersion")


class DocumentTemplateWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    category = serializers.ChoiceField(choices=DocumentTemplate.Category.choices)
    layout = serializers.JSONField(default=dict)
    isDefault = serializers.BooleanField(default=False)


class DocumentTemplatePatchSerializer(DocumentTemplateWriteSerializer):
    name = serializers.CharField(max_length=120, required=False)
    category = serializers.ChoiceField(choices=DocumentTemplate.Category.choices, required=False)
    layout = serializers.JSONField(required=False)
    isDefault = serializers.BooleanField(required=False)


def make_default(template):
    DocumentTemplate.objects.filter(
        institute=template.institute, category=template.category, is_default=True
    ).exclude(id=template.id).update(is_default=False)
    template.is_default = True


def seed_presets(request, category=None):
    categories = [category] if category else list(PRESETS.keys())
    for cat in categories:
        presets = PRESETS.get(cat) or []
        if not presets:
            continue
        if DocumentTemplate.objects.filter(institute=request.institute, category=cat).exists():
            continue
        try:
            with transaction.atomic():
                for preset in presets:
                    DocumentTemplate.objects.create(
                        institute=request.institute,
                        name=preset["name"],
                        category=cat,
                        layout=preset["layout"],
                        is_default=preset["is_default"],
                        created_by=request.user,
                    )
        except IntegrityError:
            # A concurrent request seeded first; the default-per-category constraint
            # rejects the duplicate seed — nothing to do.
            pass


class DocumentTemplateListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: DocumentTemplateSerializer(many=True)})
    def get(self, request):
        category = request.query_params.get("category", "").strip().upper()
        if category and category not in DocumentTemplate.Category.values:
            raise serializers.ValidationError({"category": ["Unknown category."]})
        seed_presets(request, category or None)
        templates = DocumentTemplate.objects.filter(institute=request.institute)
        if category:
            templates = templates.filter(category=category)
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=templates, serializer_class=DocumentTemplateSerializer
                ),
            }
        )

    @extend_schema(
        request=DocumentTemplateWriteSerializer,
        responses={status.HTTP_201_CREATED: DocumentTemplateSerializer},
    )
    def post(self, request):
        serializer = DocumentTemplateWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        validate_layout(values["layout"], category=values["category"])
        with transaction.atomic():
            template = DocumentTemplate(
                institute=request.institute,
                name=values["name"],
                category=values["category"],
                layout=values["layout"],
                created_by=request.user,
            )
            if values["isDefault"]:
                make_default(template)
            template.save()
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"document template '{template.name}'",
            target_type="document_template",
            target_id=template.id,
            extra_meta={"category": template.category, "isDefault": template.is_default},
        )
        return Response(
            {"success": True, "data": DocumentTemplateSerializer(template).data},
            status=status.HTTP_201_CREATED,
        )


class DocumentTemplateDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: DocumentTemplateSerializer})
    def get(self, request, template_id):
        template = get_object_or_404(DocumentTemplate, id=template_id, institute=request.institute)
        return Response({"success": True, "data": DocumentTemplateSerializer(template).data})

    @extend_schema(
        request=DocumentTemplatePatchSerializer,
        responses={status.HTTP_200_OK: DocumentTemplateSerializer},
    )
    def patch(self, request, template_id):
        serializer = DocumentTemplatePatchSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            template = get_object_or_404(
                DocumentTemplate.objects.select_for_update(),
                id=template_id,
                institute=request.institute,
            )
            new_category = values.get("category", template.category)
            if new_category != template.category and template.is_default:
                raise serializers.ValidationError(
                    {"category": ["Set another default before changing this template's category."]}
                )
            if "layout" in values:
                validate_layout(values["layout"], category=new_category)
                template.layout = values["layout"]
            elif new_category != template.category:
                validate_layout(template.layout, category=new_category)
            template.name = values.get("name", template.name)
            template.category = new_category
            if values.get("isDefault"):
                make_default(template)
            template.save()
        audit_mutation(
            request=request,
            verb="Updated",
            target_label=f"document template '{template.name}'",
            target_type="document_template",
            target_id=template.id,
            extra_meta={"category": template.category, "isDefault": template.is_default},
        )
        return Response({"success": True, "data": DocumentTemplateSerializer(template).data})

    def delete(self, request, template_id):
        with transaction.atomic():
            template = get_object_or_404(
                DocumentTemplate.objects.select_for_update(),
                id=template_id,
                institute=request.institute,
            )
            if template.is_default:
                raise serializers.ValidationError(
                    {
                        "isDefault": [
                            "The default template cannot be deleted. Set another default first."
                        ]
                    }
                )
            if template.published_version_id:
                raise serializers.ValidationError(
                    {"publishedVersion": ["Published templates cannot be deleted."]}
                )
            name = template.name
            category = template.category
            template.delete()
        audit_mutation(
            request=request,
            verb="Deleted",
            target_label=f"document template '{name}'",
            target_type="document_template",
            target_id=template_id,
            extra_meta={"category": category},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentTemplatePublishView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request, template_id):
        with transaction.atomic():
            template = get_object_or_404(
                DocumentTemplate.objects.select_for_update(),
                id=template_id,
                institute=request.institute,
            )
            if template.category != DocumentTemplate.Category.ID_CARD:
                raise serializers.ValidationError(
                    {"category": ["Only ID cards can be published yet."]}
                )
            validate_layout(template.layout, category=template.category)
            issues = layout_issues(template.layout)
            if issues:
                raise serializers.ValidationError({"layout": issues})
            last_version = template.versions.order_by("-version").first()
            version = DocumentTemplateVersion.objects.create(
                template=template,
                institute=request.institute,
                version=(last_version.version + 1 if last_version else 1),
                name=template.name,
                layout=template.layout,
                published_by=request.user,
            )
            template.published_version = version
            template.save(update_fields=["published_version", "updated_at"])
        audit_mutation(
            request=request,
            verb="Published",
            target_label=f"document template '{template.name}'",
            target_type="document_template",
            target_id=template.id,
            extra_meta={"category": template.category, "version": version.version},
        )
        return Response({"success": True, "data": DocumentTemplateSerializer(template).data})


class IdCardPreflightSerializer(serializers.Serializer):
    templateVersionId = serializers.UUIDField()
    studentIds = serializers.ListField(child=serializers.UUIDField(), min_length=1, max_length=80)
    acceptMissingPhotos = serializers.BooleanField(default=False)

    def validate_studentIds(self, ids):
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Select each student only once.")
        return ids


class IdCardPreflightView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request):
        serializer = IdCardPreflightSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        version = get_object_or_404(
            DocumentTemplateVersion.objects.select_related("template"),
            id=values["templateVersionId"],
            institute=request.institute,
            template__category=DocumentTemplate.Category.ID_CARD,
        )
        if version.template.published_version_id != version.id:
            raise serializers.ValidationError(
                {"templateVersionId": ["Choose the current published version."]}
            )
        rows = resolve_id_cards(request, version, values["studentIds"])
        if not values["acceptMissingPhotos"]:
            for row in rows:
                if row["missingPhoto"]:
                    row["issues"].append("Confirm initials in place of the missing student photo.")
        ready = all(not row["issues"] for row in rows)
        audit_mutation(
            request=request,
            verb="Checked",
            target_label="student ID-card batch",
            target_type="document_template",
            target_id=version.template_id,
            extra_meta={"category": "ID_CARD", "count": len(rows), "ready": ready},
        )
        return Response(
            {
                "success": True,
                "data": {
                    "ready": ready,
                    "fingerprint": batch_fingerprint(version, rows),
                    "templateVersionId": str(version.id),
                    "templateName": version.name,
                    "version": version.version,
                    "layout": version.layout if ready else None,
                    "students": rows
                    if ready
                    else [
                        {
                            key: row[key]
                            for key in ("studentId", "name", "issues", "missingPhoto")
                            if key in row
                        }
                        for row in rows
                    ],
                },
            }
        )
