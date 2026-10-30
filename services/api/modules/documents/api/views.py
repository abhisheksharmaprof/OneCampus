import uuid

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
        fields = (
            "id",
            "name",
            "category",
            "layout",
            "layout_revision",
            "isDefault",
            "createdAt",
            "publishedVersion",
        )
        read_only_fields = ("layout_revision",)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["revision"] = data.pop("layout_revision")
        return data


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
    expectedRevision = serializers.IntegerField(required=False, min_value=1)


def validate_letterhead_asset(layout, institute):
    if layout.get("version") == 3:
        binding = layout.get("masterLetterhead")
        if binding is None:
            return
        if not isinstance(binding, dict) or not isinstance(binding.get("templateId"), str):
            raise serializers.ValidationError({"layout": ["Choose a valid master letterhead."]})
        try:
            master_id = uuid.UUID(binding["templateId"])
        except (TypeError, ValueError, AttributeError):
            raise serializers.ValidationError(
                {"layout": ["Choose a valid master letterhead."]}
            ) from None
        master = DocumentTemplate.objects.filter(
            id=master_id,
            institute=institute,
            category=DocumentTemplate.Category.LETTERHEAD,
        ).first()
        if not master or not master.published_version_id:
            raise serializers.ValidationError(
                {"layout": ["Choose a published letterhead from this institute."]}
            )
        mode = binding.get("mode")
        if mode == "pinned":
            version_id = binding.get("publishedVersionId")
            try:
                version_id = uuid.UUID(version_id)
            except (TypeError, ValueError, AttributeError):
                version_id = None
            if (
                not version_id
                or not DocumentTemplateVersion.objects.filter(
                    id=version_id, template=master, institute=institute
                ).exists()
            ):
                raise serializers.ValidationError(
                    {"layout": ["Choose a published version of this institute letterhead."]}
                )
        elif mode != "followDraft":
            raise serializers.ValidationError(
                {"layout": ["Letterhead mode must be followDraft or pinned."]}
            )
        return
    letterhead = layout.get("letterhead")
    if not letterhead:
        return
    template_id = letterhead.get("templateId") if isinstance(letterhead, dict) else None
    valid = DocumentTemplate.objects.filter(
        id=template_id, institute=institute, category=DocumentTemplate.Category.LETTERHEAD
    ).exists()
    if not valid:
        raise serializers.ValidationError(
            {"layout": ["Choose a saved institute letterhead design."]}
        )


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
        validate_letterhead_asset(values["layout"], request.institute)
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
            incoming_layout = values.get("layout")
            is_v3_save = (incoming_layout or template.layout).get("version") == 3
            if is_v3_save:
                expected_revision = values.get("expectedRevision")
                if expected_revision != template.layout_revision:
                    return Response(
                        {
                            "success": False,
                            "data": {"revision": template.layout_revision},
                            "error": {
                                "code": "STALE_TEMPLATE_REVISION",
                                "message": "Reload this template before saving your changes.",
                            },
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
            new_category = values.get("category", template.category)
            if new_category != template.category and template.is_default:
                raise serializers.ValidationError(
                    {"category": ["Set another default before changing this template's category."]}
                )
            if "layout" in values:
                validate_layout(values["layout"], category=new_category)
                validate_letterhead_asset(values["layout"], request.institute)
                template.layout = values["layout"]
                if is_v3_save:
                    template.layout_revision += 1
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
            if (
                template.category == DocumentTemplate.Category.LETTERHEAD
                and DocumentTemplate.objects.filter(
                    institute=request.institute, layout__letterhead__templateId=str(template.id)
                ).exists()
            ):
                raise serializers.ValidationError(
                    {
                        "template": [
                            (
                                "This letterhead is in use by a document template. "
                                "Choose another letterhead before deleting it."
                            )
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
            if template.category not in (
                DocumentTemplate.Category.ID_CARD,
                DocumentTemplate.Category.ADMIT_CARD,
                DocumentTemplate.Category.MARKSHEET,
                DocumentTemplate.Category.LETTERHEAD,
            ) or (
                template.category == DocumentTemplate.Category.LETTERHEAD
                and template.layout.get("version") != 3
            ):
                raise serializers.ValidationError(
                    {"category": ["This template type cannot be published yet."]}
                )
            validate_layout(template.layout, category=template.category)
            validate_letterhead_asset(template.layout, request.institute)
            issues = (
                layout_issues(template.layout)
                if template.category == DocumentTemplate.Category.ID_CARD
                and template.layout.get("version") != 3
                else []
            )
            if template.category == DocumentTemplate.Category.ADMIT_CARD and not any(
                page.get("elements") for page in template.layout.get("pages", [])
            ):
                issues.append("Add at least one element to the admit-card design.")
            if template.category == DocumentTemplate.Category.MARKSHEET and not any(
                element.get("type") == "table"
                and element.get("datasetId") == "marks"
                and element.get("visible") is not False
                for page in template.layout.get("pages", [])
                for element in page.get("elements", [])
            ):
                issues.append("Add a visible marks table to the marksheet design.")
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


class DocumentTemplateConvertCopyView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request, template_id):
        template = get_object_or_404(
            DocumentTemplate,
            id=template_id,
            institute=request.institute,
        )
        if template.layout.get("version") != 2:
            raise serializers.ValidationError(
                {"layout": ["Only version 2 templates can be converted."]}
            )

        from modules.documents.layout_v3 import convert_legacy_layout

        converted_layout, diagnostics = convert_legacy_layout(template.layout)

        is_preview = bool(request.data.get("preview"))
        if is_preview:
            return Response(
                {
                    "success": True,
                    "data": {
                        "layout": converted_layout,
                        "diagnostics": diagnostics,
                    },
                }
            )

        copy_name = request.data.get("name") or f"{template.name} (v3)"
        with transaction.atomic():
            new_template = DocumentTemplate.objects.create(
                institute=request.institute,
                name=copy_name,
                category=template.category,
                layout=converted_layout,
                is_default=False,
            )
        audit_mutation(
            request=request,
            verb="Created converted copy",
            target_label=f"document template '{new_template.name}'",
            target_type="document_template",
            target_id=new_template.id,
            extra_meta={"category": new_template.category, "source_template_id": str(template.id)},
        )
        return Response(
            {
                "success": True,
                "data": {
                    "template": DocumentTemplateSerializer(new_template).data,
                    "diagnostics": diagnostics,
                },
            },
            status=status.HTTP_201_CREATED,
        )


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
