# Template Studio (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the platform-wide Template Studio — a free-canvas drag-and-drop editor for five document categories (fee invoice, fee receipt, mark sheet, ID card, certificate) with safe spreadsheet formulas, merge fields, zones/watermarks, ~15 presets, QR self-contained documents, and migration of the finance print flows onto the new renderer.

**Architecture:** New backend `documents` module owns `DocumentTemplate` (category + layout JSON v2, validated but otherwise opaque). New frontend `features/documents/` owns the engine (safe formula parser, dataset registry, mm-accurate HTML renderer with grow-and-push pagination, QR payload codec) and the Studio UI (3-pane editor: rail | canvas stage | properties). Finance's template model/endpoints/editor are removed; invoice/receipt printing migrates to the new engine.

**Tech Stack:** Django 5 + DRF + pytest (`uv run pytest` from `services/api/`); React 19 + TS + Vitest (`npx vitest run`, `npm run typecheck` from `apps/institute-admin-web/`). New frontend deps: `qrcode`, `pako` (+ dev types). No drag library — hand-rolled pointer events.

**Spec:** `docs/superpowers/specs/2026-08-13-template-studio-design.md` (approved). The user's reference prototype (`school-erp-template-builder.html`) defines the editor's look and interactions — its CSS palette and 3-pane structure are the visual target.

**Codebase conventions (established by the finance suite, follow exactly):**
- API envelope `{"success": True, "data": ...}`; camelCase serializer fields with snake_case `source=`; `IsCurrentInstituteAdmin` sets `request.institute`; every queryset institute-scoped; `get_object_or_404(Model, id=..., institute=request.institute)`; `audit_mutation(request=..., verb=..., target_label=..., target_type=..., target_id=..., extra_meta=...)` on every mutation; `paginate_admin_queryset(request=, queryset=, serializer_class=)`. `TimeStampedModel` has `created_at`/`updated_at`.
- Frontend: `adminRequest<T>(accessToken, path, options)` + `PageData<T>` from `features/admin/admin.api`; sections use `useAbortableLoad`/`StatePanel` from `features/finance/sections/shared.tsx` (reuse, don't duplicate); single-escape-point HTML rendering; popup print via `window.open` + `document.write`.
- The repo has unrelated uncommitted changes — implementers stage ONLY the files their task lists.
- Known pre-existing test failures (NOT yours to fix): backend — 6 failures from in-progress school_calendar/identity work (`test_admin_dashboard_api`, `test_admin_institute_api`, `test_identity_sessions`, `test_institute_onboarding`, `test_seed_realistic_institutes`, `test_session_lifecycle`); frontend — flaky failures in `App.test.tsx`, `Auth.test.tsx`, `StaffPage.test.tsx`, `SettingsTab.test.tsx`.

---

## File Map

**Backend (services/api/):**
| File | Action | Responsibility |
|---|---|---|
| `modules/documents/__init__.py`, `apps.py`, `models.py`, `migrations/` | Create | App + `DocumentTemplate` model |
| `modules/documents/validators.py` | Create | Layout JSON v2 shape validator |
| `modules/documents/presets.py` | Create | 15 preset layouts (builder helpers + data) |
| `modules/documents/api/__init__.py`, `views.py`, `urls.py` | Create | Template CRUD + seeding endpoints |
| `config/settings/base.py`, `config/urls.py` | Modify | Register app, mount `api/v1/admin/documents/` |
| `modules/finance/models.py` + migration | Modify | Drop `InvoiceTemplate`; repoint `FeeInvoice.template` |
| `modules/finance/api/views.py` | Modify | Template lookup → `DocumentTemplate` |
| `modules/finance/api/templates_views.py` | Delete | Superseded |
| `modules/institutes/api/admin_urls.py` | Modify | Remove `fees/templates` routes |
| `tests/test_admin_documents_api.py`, `tests/test_documents_presets.py` | Create | Endpoint + preset tests |
| `tests/test_admin_finance_templates.py` | Delete | Superseded |

**Frontend (apps/institute-admin-web/src/):**
| File | Action | Responsibility |
|---|---|---|
| `features/documents/documents.api.ts` | Create | Types + API wrappers |
| `features/documents/engine/types.ts` | Create | Layout v2 + DocumentData TS types, page-size table |
| `features/documents/engine/formula.ts` (+`.test.ts`) | Create | Safe formula tokenizer/parser/evaluator |
| `features/documents/engine/datasets.ts` (+`.test.ts`) | Create | Token groups, datasets, samples, fee adapter |
| `features/documents/engine/renderHtml.ts` (+`.test.ts`) | Create | Per-element HTML renderers (single escape point) |
| `features/documents/engine/docRender.ts` (+`.test.ts`) | Create | Page assembly: zones, watermark, grow-and-push, print doc |
| `features/documents/engine/qrPayload.ts` (+`.test.ts`) | Create | Compressed QR payload codec |
| `features/documents/studio/useEditorState.ts` (+`.test.ts`) | Create | Editor reducer: elements, selection, history, page settings |
| `features/documents/studio/snap.ts` (+`.test.ts`) | Create | Snap/guide math (pure) |
| `features/documents/studio/CanvasStage.tsx` | Create | Page, elements, drag/resize, drops, guides, zones |
| `features/documents/studio/ComponentRail.tsx` | Create | Palette + merge fields + zone shortcuts |
| `features/documents/studio/PropertiesPanel.tsx` | Create | Element tab + Page tab |
| `features/documents/studio/StudioEditor.tsx` | Create | 3-pane shell + toolbar + save/preview |
| `features/documents/TemplateStudioPage.tsx` | Create | Category home → gallery → editor |
| `features/documents/verify/VerifyPage.tsx` | Create | Login-free fragment renderer |
| `features/documents/studio.css` | Create | Studio styles (adapted from reference) |
| `adminNavigation.ts`, `App.tsx`, `App.test.tsx` | Modify | Top-level nav entry, routes, verify bypass, smoke test |
| `features/finance/sections/{InvoiceEditor,InvoicesSection,PaymentsSection,DuesSection}.tsx` | Modify | Migrate to docRender + documents API |
| `features/finance/FinanceSuitePage.tsx` | Modify | Remove Templates section |
| `features/finance/sections/TemplatesSection.tsx`, `features/finance/invoiceRender.ts` (+test) | Delete | Superseded |
| `features/finance/finance.api.ts` | Modify | Remove template wrappers/types |

Execution order: backend (1-5) → engine (6-11) → studio UI (12-16) → pages/nav/verify (17-18) → finance migration + cleanup (19).

---

### Task 1: `documents` backend module — model + validator

**Files:**
- Create: `services/api/modules/documents/__init__.py` (empty), `services/api/modules/documents/apps.py`, `services/api/modules/documents/models.py`, `services/api/modules/documents/validators.py`, `services/api/modules/documents/migrations/__init__.py` (empty)
- Modify: `services/api/config/settings/base.py` (INSTALLED_APPS)
- Test: `services/api/tests/test_documents_validator.py`

- [ ] **Step 1: Write the failing validator tests**

Create `services/api/tests/test_documents_validator.py`:

```python
import pytest
from rest_framework import serializers

from modules.documents.validators import validate_layout


def minimal_layout(**overrides):
    layout = {
        "version": 2,
        "page": {"sizeId": "A4P", "marginMm": 10, "background": "#FFFFFF"},
        "zones": {
            "headerMm": 24, "footerMm": 18,
            "repeatHeader": True, "repeatFooter": True,
            "hideHeaderOnFirstPage": False,
        },
        "watermark": {"enabled": False, "mode": "text", "text": "SAMPLE", "imageUrl": "", "opacity": 0.07},
        "pages": [{"elements": []}],
    }
    layout.update(overrides)
    return layout


def text_el(element_id="e1", **overrides):
    element = {
        "id": element_id, "type": "text", "x": 10, "y": 10, "w": 80, "h": 10,
        "content": "Hello", "style": {"fontSize": 12, "bold": False, "italic": False, "align": "left", "color": "#16212E"},
    }
    element.update(overrides)
    return element


def table_el(element_id="t1"):
    return {
        "id": element_id, "type": "table", "x": 10, "y": 80, "w": 190, "h": 60,
        "datasetId": "fee_items",
        "columns": [{"id": "c1", "label": "Description", "type": "data", "dtype": "text", "widthPct": 100, "align": "left"}],
        "style": {"headerBg": "#173A5E", "headerColor": "#FFFFFF", "fontSize": 11},
    }


def test_valid_layout_passes():
    validate_layout(minimal_layout(pages=[{"elements": [text_el(), table_el()]}]), category="FEE_INVOICE")


def test_rejects_wrong_version_and_bad_size():
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(version=1), category="FEE_INVOICE")
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(page={"sizeId": "LETTER", "marginMm": 10, "background": "#FFF"}), category="FEE_INVOICE")


def test_two_pages_only_for_id_card():
    two_pages = minimal_layout(pages=[{"elements": []}, {"elements": []}])
    validate_layout(two_pages, category="ID_CARD")
    with pytest.raises(serializers.ValidationError):
        validate_layout(two_pages, category="FEE_INVOICE")


def test_rejects_multiple_tables_unknown_type_and_element_flood():
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(pages=[{"elements": [table_el("t1"), table_el("t2")]}]), category="FEE_INVOICE")
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(pages=[{"elements": [text_el(type="video")]}]), category="FEE_INVOICE")
    flood = [text_el(f"e{i}") for i in range(201)]
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(pages=[{"elements": flood}]), category="FEE_INVOICE")


def test_rejects_non_numeric_geometry_and_oversize():
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(pages=[{"elements": [text_el(x="left")]}]), category="FEE_INVOICE")
    huge = minimal_layout(pages=[{"elements": [text_el(content="x" * 70000)]}])
    with pytest.raises(serializers.ValidationError):
        validate_layout(huge, category="FEE_INVOICE")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_documents_validator.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'modules.documents'`.

- [ ] **Step 3: Create the app**

`services/api/modules/documents/apps.py`:

```python
from django.apps import AppConfig


class DocumentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "modules.documents"
```

`services/api/modules/documents/models.py`:

```python
import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel


class DocumentTemplate(TimeStampedModel):
    """A canvas document template (layout JSON v2) for any printable school document."""

    class Category(models.TextChoices):
        FEE_INVOICE = "FEE_INVOICE", "Fee invoice"
        FEE_RECEIPT = "FEE_RECEIPT", "Fee receipt"
        MARKSHEET = "MARKSHEET", "Mark sheet"
        ID_CARD = "ID_CARD", "ID card"
        CERTIFICATE = "CERTIFICATE", "Certificate"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="document_templates"
    )
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=Category.choices)
    layout = models.JSONField(default=dict, blank=True)
    is_default = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=("institute", "category"),
                condition=Q(is_default=True),
                name="uq_default_document_template_per_category",
            )
        ]
        indexes = [models.Index(fields=("institute", "category"))]
```

`services/api/modules/documents/validators.py`:

```python
"""Shape validation for layout JSON v2. The layout is otherwise opaque to the backend."""

import json

from rest_framework import serializers

PAGE_SIZE_IDS = {"A4P", "A4L", "CR80", "A4P_HALF_TOP", "A4P_HALF_BOTTOM"}
ELEMENT_TYPES = {"text", "image", "table", "totals", "shape", "divider", "signature", "qr"}
MAX_ELEMENTS = 200
MAX_LAYOUT_BYTES = 65536
GEOMETRY_KEYS = ("x", "y", "w", "h")
GEOMETRY_RANGE = (-500.0, 1000.0)


def _fail(message):
    raise serializers.ValidationError({"layout": [message]})


def validate_layout(layout, *, category):
    if not isinstance(layout, dict):
        _fail("Layout must be an object.")
    if layout.get("version") != 2:
        _fail("Layout version must be 2.")
    if len(json.dumps(layout)) > MAX_LAYOUT_BYTES:
        _fail("Layout is too large (max 64 KB).")

    page = layout.get("page")
    if not isinstance(page, dict) or page.get("sizeId") not in PAGE_SIZE_IDS:
        _fail("Unknown or missing page size.")

    pages = layout.get("pages")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 2:
        _fail("Layout must have 1 or 2 pages.")
    if len(pages) == 2 and category != "ID_CARD":
        _fail("Only ID card templates may have two pages.")

    table_count = 0
    element_count = 0
    for page_entry in pages:
        elements = page_entry.get("elements") if isinstance(page_entry, dict) else None
        if not isinstance(elements, list):
            _fail("Each page must have an elements list.")
        for element in elements:
            element_count += 1
            if element_count > MAX_ELEMENTS:
                _fail(f"Too many elements (max {MAX_ELEMENTS}).")
            if not isinstance(element, dict) or element.get("type") not in ELEMENT_TYPES:
                _fail("Unknown element type.")
            if not isinstance(element.get("id"), str) or not element["id"]:
                _fail("Every element needs a string id.")
            for key in GEOMETRY_KEYS:
                value = element.get(key)
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    _fail(f"Element geometry '{key}' must be a number.")
                if not GEOMETRY_RANGE[0] <= float(value) <= GEOMETRY_RANGE[1]:
                    _fail(f"Element geometry '{key}' is out of range.")
            if element["type"] == "table":
                table_count += 1
    if table_count > 1:
        _fail("A template may contain at most one table.")
```

- [ ] **Step 4: Register the app and generate the migration**

In `services/api/config/settings/base.py`, add to INSTALLED_APPS after the file_storage line (~line 51):

```python
    "modules.documents.apps.DocumentsConfig",
```

Run: `cd services/api && uv run python manage.py makemigrations documents`
Expected: creates `modules/documents/migrations/0001_initial.py`. Check its `dependencies`: they must reference only git-TRACKED migrations. The repo's working tree has untracked people migrations 0015/0016 — if any dependency references an untracked migration, pin it to the latest tracked one (people → `0014_remove_inactive_student_guardian_links`); institutes' latest tracked is `0010_avoid_main_branch_code`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_documents_validator.py -v`
Expected: 5 PASSED.

- [ ] **Step 6: Commit**

```bash
git add services/api/modules/documents/ services/api/config/settings/base.py services/api/tests/test_documents_validator.py
git commit -m "feat(documents): DocumentTemplate model and layout v2 validator"
```

---

### Task 2: Document template CRUD endpoints

**Files:**
- Create: `services/api/modules/documents/api/__init__.py` (empty), `services/api/modules/documents/api/views.py`, `services/api/modules/documents/api/urls.py`
- Modify: `services/api/config/urls.py`
- Test: `services/api/tests/test_admin_documents_api.py`

Seeding is stubbed in this task (`PRESETS = {}` — Task 3/4 fill it); the GET seeds nothing until presets exist, and one test pins the CRUD behaviour independent of presets.

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_admin_documents_api.py`:

```python
import pytest

from modules.documents.models import DocumentTemplate
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


def make_admin(api_client, *, code="NSA"):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    Branch.objects.create(
        institute=institute, name="Main Campus", code=f"{code}-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email=f"admin@{code.lower()}.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    return institute, login.json()["data"]["accessToken"]


def valid_layout(pages=1):
    return {
        "version": 2,
        "page": {"sizeId": "A4P" if pages == 1 else "CR80", "marginMm": 10, "background": "#FFFFFF"},
        "zones": {"headerMm": 24, "footerMm": 18, "repeatHeader": True, "repeatFooter": True, "hideHeaderOnFirstPage": False},
        "watermark": {"enabled": False, "mode": "text", "text": "SAMPLE", "imageUrl": "", "opacity": 0.07},
        "pages": [{"elements": []} for _ in range(pages)],
    }


@pytest.mark.django_db
def test_create_list_patch_default_switch_and_category_filter(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    created = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "My invoice", "category": "FEE_INVOICE", "layout": valid_layout(), "isDefault": True},
        format="json",
    )
    other_category = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "My card", "category": "ID_CARD", "layout": valid_layout(pages=2), "isDefault": True},
        format="json",
    )
    template_id = created.json()["data"]["id"]
    listed = api_client.get("/api/v1/admin/documents/templates?category=FEE_INVOICE")
    renamed = api_client.patch(
        f"/api/v1/admin/documents/templates/{template_id}", {"name": "Renamed"}, format="json"
    )
    second_default = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Newer invoice", "category": "FEE_INVOICE", "layout": valid_layout(), "isDefault": True},
        format="json",
    )

    assert created.status_code == 201
    assert other_category.status_code == 201
    assert [item["name"] for item in listed.json()["data"]["items"]] == ["My invoice"]
    assert renamed.json()["data"]["name"] == "Renamed"
    assert second_default.status_code == 201
    defaults = DocumentTemplate.objects.filter(
        institute=institute, category="FEE_INVOICE", is_default=True
    )
    assert defaults.count() == 1 and defaults.first().name == "Newer invoice"


@pytest.mark.django_db
def test_layout_validation_delete_rules_and_tenant_isolation(api_client):
    institute, token = make_admin(api_client)
    other_institute, _ = make_admin(api_client, code="OTHER")
    foreign = DocumentTemplate.objects.create(
        institute=other_institute, name="Foreign", category="FEE_INVOICE", layout=valid_layout()
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    bad_layout = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Bad", "category": "FEE_INVOICE", "layout": {"version": 1}},
        format="json",
    )
    two_page_invoice = api_client.post(
        "/api/v1/admin/documents/templates",
        {"name": "Bad pages", "category": "FEE_INVOICE", "layout": valid_layout(pages=2)},
        format="json",
    )
    default = DocumentTemplate.objects.create(
        institute=institute, name="Default", category="MARKSHEET",
        layout=valid_layout(), is_default=True,
    )
    extra = DocumentTemplate.objects.create(
        institute=institute, name="Extra", category="MARKSHEET", layout=valid_layout()
    )
    delete_default = api_client.delete(f"/api/v1/admin/documents/templates/{default.id}")
    delete_extra = api_client.delete(f"/api/v1/admin/documents/templates/{extra.id}")
    foreign_get = api_client.get(f"/api/v1/admin/documents/templates/{foreign.id}")
    foreign_delete = api_client.delete(f"/api/v1/admin/documents/templates/{foreign.id}")

    assert bad_layout.status_code == 400
    assert two_page_invoice.status_code == 400
    assert delete_default.status_code == 400
    assert delete_extra.status_code == 204
    assert foreign_get.status_code == 404
    assert foreign_delete.status_code == 404
    assert DocumentTemplate.objects.filter(id=foreign.id).exists()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_admin_documents_api.py -v`
Expected: FAIL with 404s (routes missing).

- [ ] **Step 3: Implement views**

Create `services/api/modules/documents/api/views.py`:

```python
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.documents.models import DocumentTemplate
from modules.documents.presets import PRESETS
from modules.documents.validators import validate_layout
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


class DocumentTemplateSerializer(serializers.ModelSerializer):
    isDefault = serializers.BooleanField(source="is_default", read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)

    class Meta:
        model = DocumentTemplate
        fields = ("id", "name", "category", "layout", "isDefault", "createdAt")


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
        template = get_object_or_404(
            DocumentTemplate, id=template_id, institute=request.institute
        )
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
                    {"category": ["The default template's category cannot be changed. Set another default first."]}
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
                    {"isDefault": ["The default template cannot be deleted. Set another default first."]}
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
```

Create `services/api/modules/documents/presets.py` (stub for now — Tasks 3/4 fill it):

```python
"""Seeded preset templates per category. Populated by the preset tasks.

Contract: each category's list must contain EXACTLY ONE preset with is_default=True —
the per-category default unique constraint is what makes concurrent seeding safe.
"""

PRESETS: dict[str, list[dict]] = {}
```

Create `services/api/modules/documents/api/urls.py`:

```python
from django.urls import path

from modules.documents.api.views import (
    DocumentTemplateDetailView,
    DocumentTemplateListCreateView,
)

urlpatterns = [
    path("templates", DocumentTemplateListCreateView.as_view(), name="admin-document-templates"),
    path(
        "templates/<uuid:template_id>",
        DocumentTemplateDetailView.as_view(),
        name="admin-document-template-detail",
    ),
]
```

In `services/api/config/urls.py`, add after the academics line:

```python
    path("api/v1/admin/documents/", include("modules.documents.api.urls")),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_admin_documents_api.py tests/test_documents_validator.py -v`
Expected: 7 PASSED.

- [ ] **Step 5: Commit**

```bash
git add services/api/modules/documents/ services/api/config/urls.py services/api/tests/test_admin_documents_api.py
git commit -m "feat(documents): template CRUD endpoints with category defaults and layout validation"
```

---

### Task 3: Preset builders + invoice/receipt presets

**Files:**
- Modify: `services/api/modules/documents/presets.py` (replace the stub)
- Test: `services/api/tests/test_documents_presets.py`

- [ ] **Step 1: Write the failing tests**

Create `services/api/tests/test_documents_presets.py`:

```python
import pytest

from modules.documents.models import DocumentTemplate
from modules.documents.presets import PRESETS
from modules.documents.validators import validate_layout
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


def make_admin(api_client, *, code="NSA"):
    institute = Institute.objects.create(name=f"{code} Academy", code=code)
    Branch.objects.create(
        institute=institute, name="Main Campus", code=f"{code}-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email=f"admin@{code.lower()}.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    return institute, login.json()["data"]["accessToken"]


def test_every_preset_layout_is_valid():
    for category, presets in PRESETS.items():
        assert len(presets) == 3, f"{category} must ship exactly 3 presets"
        assert sum(1 for preset in presets if preset["is_default"]) == 1
        for preset in presets:
            validate_layout(preset["layout"], category=category)
            ids = [
                element["id"]
                for page in preset["layout"]["pages"]
                for element in page["elements"]
            ]
            assert len(ids) == len(set(ids)), f"duplicate element ids in {preset['name']}"

            CONTENT_TYPES = {"text", "table", "totals", "signature", "qr", "image"}
            for page in preset["layout"]["pages"]:
                content = [e for e in page["elements"] if e["type"] in CONTENT_TYPES]
                for i, a in enumerate(content):
                    for b in content[i + 1:]:
                        overlap_w = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
                        overlap_h = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
                        assert overlap_w <= 0.5 or overlap_h <= 0.5, (
                            f"{preset['name']}: elements {a['id']} and {b['id']} overlap"
                        )


@pytest.mark.django_db
def test_first_list_seeds_presets_per_category(api_client):
    institute, token = make_admin(api_client)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    invoices = api_client.get("/api/v1/admin/documents/templates?category=FEE_INVOICE")
    invoices_again = api_client.get("/api/v1/admin/documents/templates?category=FEE_INVOICE")
    everything = api_client.get("/api/v1/admin/documents/templates?pageSize=100")

    assert len(invoices.json()["data"]["items"]) == 3
    assert len(invoices_again.json()["data"]["items"]) == 3  # idempotent
    assert len(everything.json()["data"]["items"]) == len(PRESETS) * 3
    for category in PRESETS:
        assert DocumentTemplate.objects.filter(
            institute=institute, category=category, is_default=True
        ).count() == 1
```

The first test runs now (Task 3 fills FEE_INVOICE + FEE_RECEIPT; Task 4 adds the other three categories — the tests iterate whatever `PRESETS` contains, so they pass at both stages).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd services/api && uv run pytest tests/test_documents_presets.py -v`
Expected: `test_every_preset_layout_is_valid` FAILS (PRESETS empty → the per-category assertions never run, but `test_first_list_seeds_presets_per_category` fails on `len(...) == 3` returning 0 items). If the first test trivially passes on an empty dict, that's acceptable — the seeding test is the red bar.

- [ ] **Step 3: Implement builders + invoice/receipt presets**

Replace `services/api/modules/documents/presets.py` with:

```python
"""Seeded preset templates. Layout JSON v2 authored via small builders.

Coordinates are millimetres on the page's physical size (A4P=210x297, A4L=297x210,
CR80=86x54, A4P_HALF_TOP/BOTTOM=210x148.5).

Builder outputs are shallow-copied per layout; treat shared blocks (FEE_COLUMNS etc.)
as immutable — never mutate a preset's nested structures after construction.
"""

INK = "#16212E"
SOFT = "#5B6675"
BRAND = "#173A5E"
ACCENT = "#16A085"


def _style(size=11, bold=False, italic=False, align="left", color=INK):
    return {"fontSize": size, "bold": bold, "italic": italic, "align": align, "color": color}


def _text(x, y, w, h, content, **style):
    return {"type": "text", "x": x, "y": y, "w": w, "h": h, "content": content, "style": _style(**style)}


def _image(x, y, w, h, src="institute-logo", initials="SC"):
    return {"type": "image", "x": x, "y": y, "w": w, "h": h, "src": src, "fallbackInitials": initials}


def _shape(x, y, w, h, fill):
    return {"type": "shape", "x": x, "y": y, "w": w, "h": h, "shape": "rect", "fill": fill}


def _divider(x, y, w, stroke=SOFT):
    return {"type": "divider", "x": x, "y": y, "w": w, "h": 0.6, "stroke": stroke}


def _col(col_id, label, ctype="data", dtype="text", formula=None, width=20, align="left"):
    column = {"id": col_id, "label": label, "type": ctype, "widthPct": width, "align": align}
    if ctype == "data":
        column["dtype"] = dtype
    if formula is not None:
        column["formula"] = formula
    return column


def _table(x, y, w, h, dataset, columns, header_bg=BRAND, font=10):
    return {
        "type": "table", "x": x, "y": y, "w": w, "h": h, "datasetId": dataset,
        "columns": columns,
        "style": {"headerBg": header_bg, "headerColor": "#FFFFFF", "fontSize": font},
    }


def _trow(row_id, label, kind, value=None, formula=None, emphasize=False):
    row = {"id": row_id, "label": label, "kind": kind, "emphasize": emphasize}
    if kind == "value":
        row["value"] = value if value is not None else 0
    else:
        row["formula"] = formula
    return row


def _totals(x, y, w, h, dataset, rows):
    return {"type": "totals", "x": x, "y": y, "w": w, "h": h, "datasetId": dataset, "rows": rows}


def _signature(x, y, w, h=12, label="Authorised signature"):
    return {"type": "signature", "x": x, "y": y, "w": w, "h": h, "label": label}


def _qr(x, y, size=22, encode="verify-url"):
    return {"type": "qr", "x": x, "y": y, "w": size, "h": size, "encode": encode}


def _layout(*pages, size="A4P", margin=10, header=0, footer=0, repeat_header=False,
            repeat_footer=False, background="#FFFFFF"):
    numbered = []
    for page_index, elements in enumerate(pages):
        numbered.append({
            "elements": [
                {**element, "id": f"p{page_index + 1}e{element_index + 1}"}
                for element_index, element in enumerate(elements)
            ]
        })
    return {
        "version": 2,
        "page": {"sizeId": size, "marginMm": margin, "background": background},
        "zones": {
            "headerMm": header, "footerMm": footer,
            "repeatHeader": repeat_header, "repeatFooter": repeat_footer,
            "hideHeaderOnFirstPage": False,
        },
        "watermark": {"enabled": False, "mode": "text", "text": "SAMPLE", "imageUrl": "", "opacity": 0.07},
        "pages": numbered,
    }


FEE_COLUMNS = [
    _col("c1", "Description", width=38),
    _col("c2", "Period", width=16),
    _col("c3", "Qty", dtype="number", width=10, align="center"),
    _col("c4", "Rate", dtype="number", width=16, align="right"),
    _col("c5", "Amount", ctype="formula", formula="=[Qty]*[Rate]", width=20, align="right"),
]

FEE_TOTALS = [
    _trow("r1", "Subtotal", "formula", formula='=SUM_TABLE("Amount")'),
    _trow("r2", "Discount", "value", value=0),
    _trow("r3", "Tax", "value", value=0),
    _trow("r4", "Grand total", "formula", formula="=[Subtotal]-[Discount]+[Tax]", emphasize=True),
]

_INVOICE_HEADER = [
    _shape(0, 0, 210, 3, BRAND),
    _image(12, 10, 22, 22),
    _text(38, 12, 90, 9, "{{school_name}}", size=16, bold=True, color=BRAND),
    _text(38, 21, 90, 6, "{{school_address}} · GSTIN {{school_gstin}}", size=8, color=SOFT),
    _text(140, 12, 58, 18, "FEE INVOICE\n#{{invoice_no}}\n{{invoice_date}}", size=11, bold=True, align="right", color=BRAND),
]

_INVOICE_BODY = [
    _text(12, 44, 90, 20, "BILL TO\n{{student_name}}\n{{student_id}} · {{class_section}}", size=10),
    _text(140, 44, 58, 14, "Due date: {{due_date}}\nStatus: {{payment_status}}", size=10, align="right"),
    _table(12, 70, 186, 45, "fee_items", FEE_COLUMNS),
    _totals(128, 122, 70, 32, "fee_items", FEE_TOTALS),
    _qr(12, 122),
    _signature(150, 252, 48),
    _text(12, 288, 186, 6, "{{school_name}} · {{school_address}}", size=8, align="center", color=SOFT),
]

PRESET_FEE_INVOICE = [
    {
        "name": "Classic letterhead", "is_default": True,
        "layout": _layout([*_INVOICE_HEADER, *_INVOICE_BODY], header=36, footer=14,
                          repeat_header=True, repeat_footer=True),
    },
    {
        "name": "Colour band", "is_default": False,
        "layout": _layout([
            _shape(0, 0, 210, 34, BRAND),
            _image(12, 6, 22, 22),
            _text(38, 8, 100, 9, "{{school_name}}", size=16, bold=True, color="#FFFFFF"),
            _text(38, 18, 100, 6, "{{school_address}}", size=8, color="#DCE6F2"),
            _text(140, 8, 58, 18, "FEE INVOICE\n#{{invoice_no}}\n{{invoice_date}}", size=12, bold=True, align="right", color="#FFFFFF"),
            *_INVOICE_BODY,
        ], header=36, footer=14, repeat_header=True, repeat_footer=True),
    },
    {
        "name": "Minimal", "is_default": False,
        "layout": _layout([
            _text(12, 12, 120, 8, "{{school_name}}", size=14, bold=True),
            _text(140, 12, 58, 12, "Invoice #{{invoice_no}}\n{{invoice_date}}", size=10, align="right", color=SOFT),
            _divider(12, 30, 186),
            *_INVOICE_BODY,
        ], header=32, footer=12, repeat_header=True),
    },
]

RECEIPT_TOTALS = [
    _trow("r1", "Amount received", "formula", formula='=SUM_TABLE("Amount")', emphasize=True),
]

_RECEIPT_CORE = [
    _text(12, 40, 100, 18, "RECEIVED FROM\n{{student_name}} · {{class_section}}", size=10),
    _text(130, 40, 68, 18, "Receipt #{{receipt_no}}\n{{invoice_date}} · {{payment_method}}", size=10, align="right"),
    _table(12, 62, 186, 30, "fee_items", [
        _col("c1", "Description", width=56),
        _col("c2", "Period", width=20),
        _col("c6", "Amount", dtype="number", width=24, align="right"),
    ]),
    _totals(128, 98, 70, 12, "fee_items", RECEIPT_TOTALS),
    _signature(150, 120, 48),
]

PRESET_FEE_RECEIPT = [
    {
        "name": "Counter receipt", "is_default": True,
        "layout": _layout([
            _shape(0, 0, 210, 3, ACCENT),
            _image(12, 8, 16, 16),
            _text(32, 9, 100, 7, "{{school_name}}", size=13, bold=True, color=BRAND),
            _text(32, 17, 100, 5, "FEE RECEIPT", size=9, bold=True, color=ACCENT),
            *_RECEIPT_CORE,
            _qr(12, 108, 18),
        ], header=28, footer=10),
    },
    {
        "name": "Half-page tear-off", "is_default": False,
        "layout": _layout([
            _text(12, 8, 120, 7, "{{school_name}} — FEE RECEIPT", size=12, bold=True, color=BRAND),
            *_RECEIPT_CORE,
        ], size="A4P_HALF_TOP", header=20, footer=8),
    },
    {
        "name": "Formal", "is_default": False,
        "layout": _layout([
            _image(94, 6, 20, 20),
            _text(12, 27, 186, 6, "{{school_name}}", size=13, bold=True, align="center", color=BRAND),
            _text(12, 33, 186, 5, "{{school_address}} · GSTIN {{school_gstin}}", size=8, align="center", color=SOFT),
            _divider(12, 37.5, 186, BRAND),
            *_RECEIPT_CORE,
            _qr(12, 108, 18),
        ], header=38, footer=12),
    },
]

PRESETS: dict[str, list[dict]] = {
    "FEE_INVOICE": PRESET_FEE_INVOICE,
    "FEE_RECEIPT": PRESET_FEE_RECEIPT,
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_documents_presets.py tests/test_admin_documents_api.py -v`
Expected: all PASS (seeding test counts `len(PRESETS) * 3 = 6` for now).

- [ ] **Step 5: Commit**

```bash
git add services/api/modules/documents/presets.py services/api/tests/test_documents_presets.py
git commit -m "feat(documents): preset builders plus invoice and receipt presets"
```

---

### Task 4: Mark sheet, ID card, certificate presets

**Files:**
- Modify: `services/api/modules/documents/presets.py` (append + register)

- [ ] **Step 1: Append the three category preset sets**

Add to `presets.py` after `PRESET_FEE_RECEIPT` (before the final `PRESETS` dict):

```python
def _grade_formula(source_label):
    return (
        f'=IF([{source_label}]>=91,"A1",IF([{source_label}]>=81,"A2",'
        f'IF([{source_label}]>=71,"B1",IF([{source_label}]>=61,"B2",'
        f'IF([{source_label}]>=51,"C1",IF([{source_label}]>=41,"C2",'
        f'IF([{source_label}]>=33,"D","E")))))))'
    )


MARKS_COLUMNS = [
    _col("c1", "Subject", width=54),
    _col("c2", "Max marks", dtype="number", width=16, align="right"),
    _col("c3", "Marks", dtype="number", width=16, align="right"),
    _col("c4", "Grade", ctype="formula", width=14, align="center",
         formula=_grade_formula("Marks")),
]

MARKS_COLUMNS_DETAILED = [
    _col("c1", "Subject", width=34),
    _col("c2", "Max marks", dtype="number", width=14, align="right"),
    _col("c3", "Marks", dtype="number", width=14, align="right"),
    _col("c4", "Grade", ctype="formula", width=14, align="center",
         formula=_grade_formula("Marks")),
    _col("c5", "Rank", ctype="formula", formula="=RANK([Marks])", width=12, align="center"),
    _col("c6", "Percentile", ctype="formula", formula="=PERCENTILE([Marks])", width=12, align="center"),
]

RESULT_TOTALS = [
    _trow("r1", "Total", "formula", formula='=SUM_TABLE("Marks")'),
    _trow("r2", "Out of", "formula", formula='=SUM_TABLE("Max marks")'),
    _trow("r3", "Percentage", "formula", formula="=ROUND([Total]/[Out of]*100,2)"),
    _trow("r4", "Overall grade", "formula", emphasize=True,
          formula=_grade_formula("Percentage")),
]

_MARKSHEET_HEADER = [
    _shape(0, 0, 210, 3, BRAND),
    _image(12, 8, 20, 20),
    _text(36, 9, 110, 8, "{{school_name}}", size=15, bold=True, color=BRAND),
    _text(36, 18, 110, 5, "{{school_address}}", size=8, color=SOFT),
    _text(150, 9, 48, 14, "REPORT CARD\n{{exam_name}} · {{academic_year}}", size=10, bold=True, align="right", color=BRAND),
]

_MARKSHEET_STUDENT = _text(
    12, 36, 186, 12,
    "Student: {{student_name}}   ·   {{class_section}}   ·   Roll no: {{roll_no}}   ·   Guardian: {{guardian_name}}",
    size=10,
)

PRESET_MARKSHEET = [
    {
        "name": "Term report", "is_default": True,
        "layout": _layout([
            *_MARKSHEET_HEADER, _MARKSHEET_STUDENT,
            _table(12, 54, 186, 70, "marks", MARKS_COLUMNS),
            _totals(128, 132, 70, 32, "marks", RESULT_TOTALS),
            _signature(24, 250, 48, label="Class teacher"),
            _signature(140, 250, 48, label="Principal"),
        ], header=32, footer=12, repeat_header=True),
    },
    {
        "name": "Compact result slip", "is_default": False,
        "layout": _layout([
            _text(12, 10, 186, 7, "{{school_name}} — {{exam_name}} result", size=12, bold=True, color=BRAND),
            _MARKSHEET_STUDENT,
            _table(12, 50, 186, 60, "marks", MARKS_COLUMNS, font=9),
            _totals(128, 118, 70, 26, "marks", RESULT_TOTALS),
        ], header=20, footer=8),
    },
    {
        "name": "Detailed with rank", "is_default": False,
        "layout": _layout([
            *_MARKSHEET_HEADER, _MARKSHEET_STUDENT,
            _table(12, 54, 186, 80, "marks", MARKS_COLUMNS_DETAILED, font=9),
            _totals(128, 142, 70, 32, "marks", RESULT_TOTALS),
            _qr(12, 142, 20),
            _signature(140, 250, 48, label="Principal"),
        ], header=32, footer=12, repeat_header=True),
    },
]

# CR80 card: 86 x 54 mm, two pages (front / back). No repeating zones on cards.
PRESET_ID_CARD = [
    {
        "name": "Student photo card", "is_default": True,
        "layout": _layout(
            [
                _shape(0, 0, 86, 12, BRAND),
                _text(14, 2, 70, 8, "{{school_name}}", size=8, bold=True, color="#FFFFFF"),
                _image(2, 2, 10, 10, initials="SC"),
                _image(4, 16, 22, 28, src="student-photo", initials="ST"),
                _text(30, 17, 54, 7, "{{student_name}}", size=10, bold=True, color=BRAND),
                _text(30, 25, 54, 14, "{{class_section}} · Roll {{roll_no}}\nID: {{student_id}}", size=7, color=SOFT),
                _shape(0, 50, 86, 4, ACCENT),
            ],
            [
                _text(4, 4, 78, 12, "If found, please return to:\n{{school_name}}, {{school_address}}", size=7, color=SOFT),
                _qr(4, 22, 20, encode="document-number"),
                _text(28, 26, 54, 8, "{{academic_year}}", size=8, align="right", color=SOFT),
                _signature(46, 42, 36, h=8, label="Principal"),
            ],
            size="CR80", margin=2,
        ),
    },
    {
        "name": "Staff card", "is_default": False,
        "layout": _layout(
            [
                _shape(0, 0, 86, 54, BRAND),
                _shape(2, 2, 82, 50, "#FFFFFF"),
                _image(4, 14, 20, 26, src="staff-photo", initials="SF"),
                _text(4, 4, 78, 7, "{{school_name}} · STAFF", size=8, bold=True, color=BRAND),
                _text(28, 16, 54, 7, "{{staff_name}}", size=10, bold=True, color=BRAND),
                _text(28, 24, 54, 12, "{{designation}}\nID: {{staff_id}}", size=7, color=SOFT),
            ],
            [
                _text(4, 4, 78, 10, "{{school_name}}\n{{school_address}}", size=7, color=SOFT),
                _qr(4, 20, 20, encode="document-number"),
                _signature(46, 42, 36, h=8, label="Authorised signatory"),
            ],
            size="CR80", margin=2,
        ),
    },
    {
        "name": "Minimal", "is_default": False,
        "layout": _layout(
            [
                _text(4, 4, 78, 7, "{{school_name}}", size=9, bold=True, color=BRAND),
                _divider(4, 12, 78, BRAND),
                _text(4, 16, 78, 7, "{{student_name}}", size=10, bold=True),
                _text(4, 24, 78, 12, "{{class_section}} · Roll {{roll_no}} · {{academic_year}}", size=7, color=SOFT),
            ],
            [
                _qr(33, 14, 20, encode="document-number"),
                _text(4, 40, 78, 8, "{{school_address}}", size=6, align="center", color=SOFT),
            ],
            size="CR80", margin=2,
        ),
    },
]

# Certificates: A4 landscape (297 x 210). Border built from four thin shapes.
def _border(color=BRAND, inset=8, thickness=1.2):
    outer_w, outer_h = 297, 210
    return [
        _shape(inset, inset, outer_w - 2 * inset, thickness, color),
        _shape(inset, outer_h - inset - thickness, outer_w - 2 * inset, thickness, color),
        _shape(inset, inset, thickness, outer_h - 2 * inset, color),
        _shape(outer_w - inset - thickness, inset, thickness, outer_h - 2 * inset, color),
    ]


def _certificate(title, body_line, accent=ACCENT):
    return _layout([
        *_border(),
        _image(138, 18, 22, 22),
        _text(24, 44, 249, 10, "{{school_name}}", size=20, bold=True, align="center", color=BRAND),
        _text(24, 58, 249, 8, title, size=15, bold=True, align="center", color=accent),
        _text(24, 78, 249, 10, "This is to certify that", size=11, align="center", color=SOFT),
        _text(24, 90, 249, 12, "{{student_name}}", size=22, bold=True, italic=True, align="center"),
        _text(24, 106, 249, 16, body_line, size=11, align="center"),
        _text(24, 130, 249, 8, "Issued on {{issue_date}} · {{academic_year}}", size=10, align="center", color=SOFT),
        _signature(48, 170, 56, label="Class teacher"),
        _signature(196, 170, 56, label="Principal"),
        _qr(138, 160, 20),
    ], size="A4L", margin=8)


PRESET_CERTIFICATE = [
    {"name": "Achievement", "is_default": True,
     "layout": _certificate("CERTIFICATE OF ACHIEVEMENT",
                            "of {{class_section}} has demonstrated outstanding achievement in {{event_name}}.")},
    {"name": "Participation", "is_default": False,
     "layout": _certificate("CERTIFICATE OF PARTICIPATION",
                            "of {{class_section}} has participated in {{event_name}}.", accent="#7C4EA6")},
    {"name": "Character", "is_default": False,
     "layout": _certificate("CHARACTER CERTIFICATE",
                            "of {{class_section}} has borne a good moral character during their time at this institution.",
                            accent=SOFT)},
]
```

Then replace the final `PRESETS` dict with:

```python
PRESETS: dict[str, list[dict]] = {
    "FEE_INVOICE": PRESET_FEE_INVOICE,
    "FEE_RECEIPT": PRESET_FEE_RECEIPT,
    "MARKSHEET": PRESET_MARKSHEET,
    "ID_CARD": PRESET_ID_CARD,
    "CERTIFICATE": PRESET_CERTIFICATE,
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd services/api && uv run pytest tests/test_documents_presets.py -v`
Expected: 2 PASSED — the validity test now iterates 5 categories × 3 presets; the seeding test counts 15.

- [ ] **Step 3: Commit**

```bash
git add services/api/modules/documents/presets.py
git commit -m "feat(documents): mark sheet, ID card and certificate presets"
```

---

### Task 5: Finance repoint — drop InvoiceTemplate, retarget FeeInvoice.template

**Files:**
- Modify: `services/api/modules/finance/models.py`
- Create (generated + hand-checked): `services/api/modules/finance/migrations/0008_*.py`
- Modify: `services/api/modules/finance/api/views.py`
- Modify: `services/api/modules/institutes/api/admin_urls.py`
- Delete: `services/api/modules/finance/api/templates_views.py`, `services/api/tests/test_admin_finance_templates.py`
- Modify: `services/api/tests/test_admin_finance_invoices.py`

- [ ] **Step 1: Add a failing test for the retargeted template FK**

Append to `services/api/tests/test_admin_finance_invoices.py` (it already defines `make_admin`, `make_student`, `INVOICE_BODY`):

```python
@pytest.mark.django_db
def test_invoice_accepts_document_template_and_rejects_foreign_or_wrong_category(api_client):
    from modules.documents.models import DocumentTemplate

    institute, branch, token = make_admin(api_client)
    other_institute, _, _ = make_admin(api_client, code="OTHER")
    student = make_student(institute, branch)
    mine = DocumentTemplate.objects.create(
        institute=institute, name="Mine", category="FEE_INVOICE", layout={"version": 2}
    )
    wrong_category = DocumentTemplate.objects.create(
        institute=institute, name="Card", category="ID_CARD", layout={"version": 2}
    )
    foreign = DocumentTemplate.objects.create(
        institute=other_institute, name="Foreign", category="FEE_INVOICE", layout={"version": 2}
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    ok = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id), "templateId": str(mine.id)},
        format="json",
    )
    bad_category = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id), "templateId": str(wrong_category.id)},
        format="json",
    )
    cross_tenant = api_client.post(
        "/api/v1/admin/fees/invoices",
        {**INVOICE_BODY, "studentId": str(student.id), "templateId": str(foreign.id)},
        format="json",
    )

    assert ok.status_code == 201
    assert ok.json()["data"]["templateId"] == str(mine.id)
    assert bad_category.status_code == 404
    assert cross_tenant.status_code == 404
```

(Direct ORM creation bypasses the API's layout validation, so the bare `{"version": 2}` layouts are fine for FK-focused tests.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd services/api && uv run pytest tests/test_admin_finance_invoices.py -v`
Expected: the new test FAILS (FK still points at finance.InvoiceTemplate, so the DocumentTemplate id 404s); the 7 existing tests PASS.

- [ ] **Step 3: Retarget the model**

In `services/api/modules/finance/models.py`:
1. DELETE the entire `InvoiceTemplate` class.
2. In `FeeInvoice`, replace the `template` field with:

```python
    template = models.ForeignKey(
        "documents.DocumentTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fee_invoices",
    )
```

- [ ] **Step 4: Generate and verify the migration**

Run: `cd services/api && uv run python manage.py makemigrations finance -n retarget_template_to_documents`
Expected: `0008_retarget_template_to_documents.py`. Open it and verify the operations do (in this order): `RemoveField` feeinvoice.template → `DeleteModel` InvoiceTemplate → `AddField` feeinvoice.template pointing at documents.DocumentTemplate. If makemigrations produced an `AlterField` instead, rewrite the operations by hand into the Remove/Delete/Add form (existing template ids reference the old table and must be dropped, not converted — testing-phase reset per spec). Dependencies must include `("documents", "0001_initial")` and only git-tracked migrations (pin people to `0014_remove_inactive_student_guardian_links` if 0015/0016 leak in).

- [ ] **Step 5: Update finance views**

In `services/api/modules/finance/api/views.py`:
1. In the imports: remove `InvoiceTemplate` from the `modules.finance.models` import; add `from modules.documents.models import DocumentTemplate`.
2. Replace BOTH template lookups (in `FeeInvoiceListCreateView.post` and `FeeInvoiceDetailView.patch`) with:

```python
                template = get_object_or_404(
                    DocumentTemplate,
                    id=values["templateId"],
                    institute=request.institute,
                    category=DocumentTemplate.Category.FEE_INVOICE,
                )
```

(In `patch` keep the existing `if values["templateId"] ... else None` structure — only the lookup changes.)
3. In `FeeInvoiceBulkGenerateView.post`, apply the same replacement for its `templateId` lookup.

- [ ] **Step 6: Remove the old template endpoints**

1. Delete `services/api/modules/finance/api/templates_views.py`.
2. Delete `services/api/tests/test_admin_finance_templates.py`.
3. In `services/api/modules/institutes/api/admin_urls.py`: remove the `InvoiceTemplateListCreateView`/`InvoiceTemplateDetailView` import and both `fees/templates` path entries.
4. Grep for leftovers: `grep -rn "InvoiceTemplate\|templates_views" services/api/modules services/api/tests` — the only acceptable remaining hits are inside migration files (historical operations reference the model by name there; that's frozen history, leave them).

- [ ] **Step 7: Run the affected suites**

Run: `cd services/api && uv run pytest tests/test_admin_finance_invoices.py tests/test_admin_finance_api.py tests/test_admin_finance_payments.py tests/test_admin_finance_bulk.py tests/test_admin_documents_api.py tests/test_documents_presets.py -v`
Expected: all PASS (8 invoice tests incl. the new one).

- [ ] **Step 8: Commit**

```bash
git add -A services/api/modules/finance/ services/api/modules/institutes/api/admin_urls.py services/api/tests/test_admin_finance_invoices.py services/api/tests/test_admin_finance_templates.py
git commit -m "refactor(finance): retarget invoice templates to documents.DocumentTemplate"
```

---

### Task 6: Frontend deps, layout types, documents API layer

**Files:**
- Modify: `apps/institute-admin-web/package.json` (via npm install)
- Create: `apps/institute-admin-web/src/features/documents/engine/types.ts`
- Create: `apps/institute-admin-web/src/features/documents/documents.api.ts`

- [ ] **Step 1: Install dependencies**

Run from `apps/institute-admin-web/`:

```bash
npm install qrcode pako
npm install -D @types/qrcode @types/pako
```

- [ ] **Step 2: Create `engine/types.ts`**

```typescript
/** Layout JSON v2 + document data types. Mirrors the backend validator's contract
 *  (services/api/modules/documents/validators.py). Coordinates are millimetres. */

export type DocumentCategory = 'FEE_INVOICE' | 'FEE_RECEIPT' | 'MARKSHEET' | 'ID_CARD' | 'CERTIFICATE'
export type PageSizeId = 'A4P' | 'A4L' | 'CR80' | 'A4P_HALF_TOP' | 'A4P_HALF_BOTTOM'

export const PAGE_SIZES_MM: Record<PageSizeId, { w: number; h: number }> = {
  A4P: { w: 210, h: 297 },
  A4L: { w: 297, h: 210 },
  CR80: { w: 86, h: 54 },
  A4P_HALF_TOP: { w: 210, h: 148.5 },
  A4P_HALF_BOTTOM: { w: 210, h: 148.5 },
}

export type ElementType = 'text' | 'image' | 'table' | 'totals' | 'shape' | 'divider' | 'signature' | 'qr'
export type TextAlign = 'left' | 'center' | 'right'

export interface BaseElement {
  id: string
  type: ElementType
  x: number
  y: number
  w: number
  h: number
  locked?: boolean
}

export interface TextStyle { fontSize: number; bold: boolean; italic: boolean; align: TextAlign; color: string }
export interface TextElement extends BaseElement { type: 'text'; content: string; style: TextStyle }
export interface ImageElement extends BaseElement { type: 'image'; src: string; fallbackInitials: string }

export interface TableColumn {
  id: string
  label: string
  type: 'data' | 'formula'
  dtype?: 'text' | 'number'
  formula?: string
  widthPct: number
  align: TextAlign
}
export interface TableStyle { headerBg: string; headerColor: string; fontSize: number }
export interface TableElement extends BaseElement { type: 'table'; datasetId: string; columns: TableColumn[]; style: TableStyle }

export interface TotalsRow { id: string; label: string; kind: 'value' | 'formula'; value?: number; formula?: string; emphasize?: boolean }
export interface TotalsElement extends BaseElement { type: 'totals'; datasetId: string; rows: TotalsRow[] }

export interface ShapeElement extends BaseElement { type: 'shape'; shape: 'rect'; fill: string }
export interface DividerElement extends BaseElement { type: 'divider'; stroke: string }
export interface SignatureElement extends BaseElement { type: 'signature'; label: string }
export interface QrElement extends BaseElement { type: 'qr'; encode: 'verify-url' | 'document-number' }

export type CanvasElement =
  | TextElement | ImageElement | TableElement | TotalsElement
  | ShapeElement | DividerElement | SignatureElement | QrElement

export interface LayoutZones {
  headerMm: number
  footerMm: number
  repeatHeader: boolean
  repeatFooter: boolean
  hideHeaderOnFirstPage: boolean
}
export interface LayoutWatermark { enabled: boolean; mode: 'text' | 'image'; text: string; imageUrl: string; opacity: number }

export interface LayoutV2 {
  version: 2
  page: { sizeId: PageSizeId; marginMm: number; background: string | { imageUrl: string } }
  zones: LayoutZones
  watermark: LayoutWatermark
  pages: { elements: CanvasElement[] }[]
}

/** Everything a renderer needs about ONE concrete document (real or sample). */
export interface DocumentData {
  category: DocumentCategory
  /** {{token}} → value; unresolved tokens render blank. */
  tokens: Record<string, string>
  /** Dataset rows for the table/totals elements, keyed by column id (c1, c2, …). */
  rows: Record<string, unknown>[]
  /** Image sources by symbolic id: 'institute-logo', 'student-photo', 'staff-photo'. */
  images: Record<string, string | null>
  /** Pre-generated QR data URLs keyed by element id (QR generation is async; render is sync). */
  qrDataUrls?: Record<string, string>
  status?: string
}

export function defaultLayout(sizeId: PageSizeId = 'A4P', pageCount: 1 | 2 = 1): LayoutV2 {
  return {
    version: 2,
    page: { sizeId, marginMm: sizeId === 'CR80' ? 2 : 10, background: '#FFFFFF' },
    zones: { headerMm: 0, footerMm: 0, repeatHeader: false, repeatFooter: false, hideHeaderOnFirstPage: false },
    watermark: { enabled: false, mode: 'text', text: 'SAMPLE', imageUrl: '', opacity: 0.07 },
    pages: Array.from({ length: pageCount }, () => ({ elements: [] })),
  }
}
```

- [ ] **Step 3: Create `documents.api.ts`**

```typescript
import { adminRequest, type PageData } from '../admin/admin.api'
import type { DocumentCategory, LayoutV2 } from './engine/types'

export interface DocumentTemplateRecord {
  id: string
  name: string
  category: DocumentCategory
  layout: LayoutV2
  isDefault: boolean
  createdAt: string
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value))
  })
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export function listDocumentTemplates(
  accessToken: string,
  category?: DocumentCategory,
  signal?: AbortSignal,
) {
  // pageSize 100: templates per institute are author-curated; the cap is a deliberate bound.
  return adminRequest<PageData<DocumentTemplateRecord>>(
    accessToken, `documents/templates${query({ category, pageSize: 100 })}`, { signal },
  )
}

export function getDocumentTemplate(accessToken: string, templateId: string, signal?: AbortSignal) {
  return adminRequest<DocumentTemplateRecord>(accessToken, `documents/templates/${templateId}`, { signal })
}

export function createDocumentTemplate(
  accessToken: string,
  body: { name: string; category: DocumentCategory; layout: LayoutV2; isDefault?: boolean },
) {
  return adminRequest<DocumentTemplateRecord>(accessToken, 'documents/templates', {
    method: 'POST', body: JSON.stringify(body),
  })
}

export function patchDocumentTemplate(
  accessToken: string,
  templateId: string,
  body: Partial<{ name: string; category: DocumentCategory; layout: LayoutV2; isDefault: boolean }>,
) {
  return adminRequest<DocumentTemplateRecord>(accessToken, `documents/templates/${templateId}`, {
    method: 'PATCH', body: JSON.stringify(body),
  })
}

export function deleteDocumentTemplate(accessToken: string, templateId: string) {
  return adminRequest<void>(accessToken, `documents/templates/${templateId}`, { method: 'DELETE' })
}
```

- [ ] **Step 4: Typecheck and commit**

Run: `cd apps/institute-admin-web && npm run typecheck` — must be clean.

```bash
git add apps/institute-admin-web/package.json apps/institute-admin-web/package-lock.json apps/institute-admin-web/src/features/documents/
git commit -m "feat(documents-web): layout v2 types and documents API layer"
```

---

### Task 7: Safe formula engine

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/engine/formula.ts`
- Test: `apps/institute-admin-web/src/features/documents/engine/formula.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `engine/formula.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { computeTableRows, computeTotals, evaluateFormula } from './formula'
import type { TableColumn, TotalsRow } from './types'

const col = (id: string, label: string, extra: Partial<TableColumn> = {}): TableColumn => ({
  id, label, type: 'data', dtype: 'number', widthPct: 20, align: 'left', ...extra,
})

const FEE_COLUMNS: TableColumn[] = [
  col('c1', 'Description', { dtype: 'text' }),
  col('c3', 'Qty'),
  col('c4', 'Rate'),
  col('c5', 'Amount', { type: 'formula', formula: '=[Qty]*[Rate]' }),
]
const FEE_ROWS = [
  { c1: 'Tuition', c3: 2, c4: 1500.5 },
  { c1: 'Transport', c3: 1, c4: 3000 },
]

describe('evaluateFormula', () => {
  const env = { ref: (name: string) => ({ Qty: 2, Rate: 1500.5, Name: 'Aarav' } as Record<string, number | string>)[name] ?? (() => { throw new Error(`unknown ref ${name}`) })() }

  it('handles arithmetic with precedence and parens', () => {
    expect(evaluateFormula('=1+2*3', env)).toBe(7)
    expect(evaluateFormula('=(1+2)*3', env)).toBe(9)
    expect(evaluateFormula('=-4+10/2', env)).toBe(1)
  })

  it('resolves refs and functions', () => {
    expect(evaluateFormula('=[Qty]*[Rate]', env)).toBe(3001)
    expect(evaluateFormula('=ROUND([Rate],0)', env)).toBe(1501)
    expect(evaluateFormula('=SUM(1,2,3)+MAX(4,9)', env)).toBe(15)
    expect(evaluateFormula('=AVG(2,4)', env)).toBe(3)
    expect(evaluateFormula('=MIN(5,2,8)', env)).toBe(2)
  })

  it('handles IF with comparisons and strings', () => {
    expect(evaluateFormula('=IF([Qty]>=2,"bulk","single")', env)).toBe('bulk')
    expect(evaluateFormula('=IF([Name]=="Aarav",1,0)', env)).toBe(1)
    expect(evaluateFormula('=IF(1>2,"a",IF(3!=3,"b","c"))', env)).toBe('c')
  })

  it('throws (not evaluates) on unknown identifiers and injection-shaped input', () => {
    expect(() => evaluateFormula('=constructor("alert(1)")', env)).toThrow()
    expect(() => evaluateFormula('=__proto__', env)).toThrow()
    expect(() => evaluateFormula('=[Nope]', env)).toThrow()
    expect(() => evaluateFormula('=1+*2', env)).toThrow()
  })
})

describe('computeTableRows', () => {
  it('computes formula columns per row', () => {
    const rows = computeTableRows(FEE_COLUMNS, FEE_ROWS)
    expect(rows[0].c5).toBe(3001)
    expect(rows[1].c5).toBe(3000)
  })

  it('renders #ERR for a broken formula without affecting other cells', () => {
    const columns = [...FEE_COLUMNS, col('c6', 'Bad', { type: 'formula', formula: '=[Missing]+1' })]
    const rows = computeTableRows(columns, FEE_ROWS)
    expect(rows[0].c6).toBe('#ERR')
    expect(rows[0].c5).toBe(3001)
  })

  it('supports RANK and PERCENTILE over a column', () => {
    const columns = [
      col('c1', 'Subject', { dtype: 'text' }),
      col('c3', 'Marks'),
      col('c7', 'Rank', { type: 'formula', formula: '=RANK([Marks])' }),
      col('c8', 'Pct', { type: 'formula', formula: '=PERCENTILE([Marks])' }),
    ]
    const rows = computeTableRows(columns, [
      { c1: 'Eng', c3: 88 }, { c1: 'Math', c3: 95 }, { c1: 'Sci', c3: 88 },
    ])
    expect(rows[1].c7).toBe(1)
    expect(rows[0].c7).toBe(2)
    expect(rows[2].c7).toBe(2)
    expect(rows[1].c8).toBe(100)
  })
})

describe('computeTotals', () => {
  const TOTALS: TotalsRow[] = [
    { id: 'r1', label: 'Subtotal', kind: 'formula', formula: '=SUM_TABLE("Amount")' },
    { id: 'r2', label: 'Discount', kind: 'value', value: 500 },
    { id: 'r3', label: 'Grand total', kind: 'formula', formula: '=[Subtotal]-[Discount]', emphasize: true },
  ]

  it('chains SUM_TABLE and row references', () => {
    const results = computeTotals(TOTALS, { columns: FEE_COLUMNS, rows: FEE_ROWS })
    expect(results.r1).toBe(6001)
    expect(results.r2).toBe(500)
    expect(results.r3).toBe(5501)
  })

  it('forward references and missing tables yield #ERR', () => {
    const forward: TotalsRow[] = [
      { id: 'r1', label: 'A', kind: 'formula', formula: '=[B]+1' },
      { id: 'r2', label: 'B', kind: 'value', value: 1 },
    ]
    expect(computeTotals(forward, { columns: FEE_COLUMNS, rows: FEE_ROWS }).r1).toBe('#ERR')
    expect(computeTotals(TOTALS, null).r1).toBe('#ERR')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/institute-admin-web && npx vitest run src/features/documents/engine/formula.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `engine/formula.ts`**

```typescript
/** Safe spreadsheet-style formula engine.
 *
 *  Syntax (reference-compatible): `=[Qty]*[Rate]`, `=IF([Marks]>=91,"A1","A2")`,
 *  `=SUM_TABLE("Amount")`, `=RANK([Marks])`, row refs `[Row label]` in totals.
 *  Implementation: tokenizer → recursive-descent parser → AST evaluation with an
 *  explicit environment. Stored template content is NEVER executed as code.
 */

import type { TableColumn, TotalsRow } from './types'

export type Value = number | string | boolean
export class FormulaError extends Error {}

export interface FormulaEnv {
  /** Resolve `[Name]` for the current scope. Throw for unknown names. */
  ref(name: string): Value
  /** All numeric values of a column (for RANK/PERCENTILE). */
  columnValues?(label: string): number[]
  /** Sum of a computed table column (for SUM_TABLE). */
  sumTable?(label: string): number
}

type Token =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'ref'; v: string }
  | { t: 'ident'; v: string } | { t: 'op'; v: string } | { t: 'lparen' } | { t: 'rparen' } | { t: 'comma' }

const FUNCTIONS = new Set(['IF', 'SUM', 'AVG', 'MAX', 'MIN', 'ROUND', 'RANK', 'PERCENTILE', 'SUM_TABLE'])

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === ' ' || ch === '\t') { i += 1; continue }
    if (ch === '(') { tokens.push({ t: 'lparen' }); i += 1; continue }
    if (ch === ')') { tokens.push({ t: 'rparen' }); i += 1; continue }
    if (ch === ',') { tokens.push({ t: 'comma' }); i += 1; continue }
    if (ch === '[') {
      const end = source.indexOf(']', i)
      if (end === -1) throw new FormulaError('Unclosed [reference]')
      tokens.push({ t: 'ref', v: source.slice(i + 1, end).trim() })
      i = end + 1
      continue
    }
    if (ch === '"') {
      const end = source.indexOf('"', i + 1)
      if (end === -1) throw new FormulaError('Unclosed string')
      tokens.push({ t: 'str', v: source.slice(i + 1, end) })
      i = end + 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      const match = /^[0-9]*\.?[0-9]+/.exec(source.slice(i))
      if (!match) throw new FormulaError(`Bad number at ${i}`)
      tokens.push({ t: 'num', v: Number(match[0]) })
      i += match[0].length
      continue
    }
    const twoChar = source.slice(i, i + 2)
    if (['>=', '<=', '==', '!='].includes(twoChar)) { tokens.push({ t: 'op', v: twoChar }); i += 2; continue }
    if ('+-*/><'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i += 1; continue }
    if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i))!
      tokens.push({ t: 'ident', v: match[0] })
      i += match[0].length
      continue
    }
    throw new FormulaError(`Unexpected character '${ch}'`)
  }
  return tokens
}

type Node =
  | { k: 'num'; v: number } | { k: 'str'; v: string } | { k: 'ref'; name: string }
  | { k: 'call'; name: string; args: Node[] } | { k: 'bin'; op: string; l: Node; r: Node } | { k: 'neg'; e: Node }

function parse(tokens: Token[]): Node {
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]
  const expect = (t: Token['t']) => {
    const token = next()
    if (!token || token.t !== t) throw new FormulaError(`Expected ${t}`)
    return token
  }

  function comparison(): Node {
    let left = additive()
    const token = peek()
    if (token?.t === 'op' && ['>', '>=', '<', '<=', '==', '!='].includes(token.v)) {
      next()
      left = { k: 'bin', op: token.v, l: left, r: additive() }
    }
    return left
  }
  function additive(): Node {
    let left = multiplicative()
    while (peek()?.t === 'op' && ['+', '-'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v
      left = { k: 'bin', op, l: left, r: multiplicative() }
    }
    return left
  }
  function multiplicative(): Node {
    let left = unary()
    while (peek()?.t === 'op' && ['*', '/'].includes((peek() as { v: string }).v)) {
      const op = (next() as { v: string }).v
      left = { k: 'bin', op, l: left, r: unary() }
    }
    return left
  }
  function unary(): Node {
    const token = peek()
    if (token?.t === 'op' && token.v === '-') { next(); return { k: 'neg', e: unary() } }
    return primary()
  }
  function primary(): Node {
    const token = next()
    if (!token) throw new FormulaError('Unexpected end of formula')
    if (token.t === 'num') return { k: 'num', v: token.v }
    if (token.t === 'str') return { k: 'str', v: token.v }
    if (token.t === 'ref') return { k: 'ref', name: token.v }
    if (token.t === 'lparen') {
      const inner = comparison()
      expect('rparen')
      return inner
    }
    if (token.t === 'ident') {
      if (!FUNCTIONS.has(token.v)) throw new FormulaError(`Unknown function '${token.v}'`)
      expect('lparen')
      const args: Node[] = []
      if (peek()?.t !== 'rparen') {
        args.push(comparison())
        while (peek()?.t === 'comma') { next(); args.push(comparison()) }
      }
      expect('rparen')
      return { k: 'call', name: token.v, args }
    }
    throw new FormulaError('Unexpected token')
  }

  const root = comparison()
  if (pos !== tokens.length) throw new FormulaError('Trailing input after expression')
  return root
}

function asNumber(value: Value): number {
  if (typeof value === 'boolean') return value ? 1 : 0
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) throw new FormulaError(`Not a number: ${String(value)}`)
  return num
}

function evalNode(node: Node, env: FormulaEnv): Value {
  switch (node.k) {
    case 'num': return node.v
    case 'str': return node.v
    case 'ref': return env.ref(node.name)
    case 'neg': return -asNumber(evalNode(node.e, env))
    case 'bin': {
      const l = evalNode(node.l, env)
      const r = evalNode(node.r, env)
      switch (node.op) {
        case '+': return asNumber(l) + asNumber(r)
        case '-': return asNumber(l) - asNumber(r)
        case '*': return asNumber(l) * asNumber(r)
        case '/': return asNumber(l) / asNumber(r)
        case '>': return asNumber(l) > asNumber(r)
        case '>=': return asNumber(l) >= asNumber(r)
        case '<': return asNumber(l) < asNumber(r)
        case '<=': return asNumber(l) <= asNumber(r)
        case '==': return l === r || asNumberSafe(l) === asNumberSafe(r)
        case '!=': return !(l === r || asNumberSafe(l) === asNumberSafe(r))
        default: throw new FormulaError(`Unknown operator ${node.op}`)
      }
    }
    case 'call': {
      const { name, args } = node
      if (name === 'IF') {
        if (args.length !== 3) throw new FormulaError('IF takes 3 arguments')
        return evalNode(args[0], env) ? evalNode(args[1], env) : evalNode(args[2], env)
      }
      if (name === 'RANK' || name === 'PERCENTILE') {
        const refArg = args[0]
        if (args.length !== 1 || refArg.k !== 'ref') throw new FormulaError(`${name} takes one [Column] reference`)
        if (!env.columnValues) throw new FormulaError(`${name} needs table context`)
        const values = env.columnValues(refArg.name)
        const mine = asNumber(env.ref(refArg.name))
        if (name === 'RANK') {
          const sorted = [...new Set(values)].sort((a, b) => b - a)
          return sorted.indexOf(mine) + 1
        }
        const below = values.filter((value) => value <= mine).length
        return Math.round((below / values.length) * 100)
      }
      if (name === 'SUM_TABLE') {
        const labelArg = args[0]
        if (args.length !== 1 || labelArg.k !== 'str') throw new FormulaError('SUM_TABLE takes one "Column label"')
        if (!env.sumTable) throw new FormulaError('SUM_TABLE needs table context')
        return env.sumTable(labelArg.v)
      }
      const values = args.map((arg) => asNumber(evalNode(arg, env)))
      switch (name) {
        case 'SUM': return values.reduce((sum, value) => sum + value, 0)
        case 'AVG': return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
        case 'MAX': return Math.max(...values)
        case 'MIN': return Math.min(...values)
        case 'ROUND': {
          const digits = values[1] ?? 0
          return Number(values[0].toFixed(digits))
        }
        default: throw new FormulaError(`Unknown function '${name}'`)
      }
    }
  }
}

function asNumberSafe(value: Value): number | null {
  try { return asNumber(value) } catch { return null }
}

export function evaluateFormula(source: string, env: FormulaEnv): Value {
  const stripped = source.trim().replace(/^=/, '')
  if (!stripped) throw new FormulaError('Empty formula')
  return evalNode(parse(tokenize(stripped)), env)
}

/** Compute formula columns for every row. Errors become '#ERR' in that cell only. */
export function computeTableRows(
  columns: TableColumn[],
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const byLabel = new Map(columns.map((column) => [column.label, column]))
  const computed = rows.map((row) => ({ ...row }))
  for (const column of columns) {
    if (column.type !== 'formula') continue
    for (const row of computed) {
      const env: FormulaEnv = {
        ref(name) {
          const target = byLabel.get(name)
          if (!target) throw new FormulaError(`Unknown column [${name}]`)
          const value = row[target.id]
          if (value === undefined || value === null || value === '#ERR') throw new FormulaError(`No value for [${name}]`)
          return value as Value
        },
        columnValues(label) {
          const target = byLabel.get(label)
          if (!target) throw new FormulaError(`Unknown column [${label}]`)
          return computed.map((r) => Number(r[target.id]) || 0)
        },
      }
      try {
        row[column.id] = evaluateFormula(column.formula ?? '', env)
      } catch {
        row[column.id] = '#ERR'
      }
    }
  }
  return computed
}

/** Evaluate totals rows top-to-bottom. Errors and forward references become '#ERR'. */
export function computeTotals(
  rows: TotalsRow[],
  table: { columns: TableColumn[]; rows: Record<string, unknown>[] } | null,
): Record<string, number | string> {
  const results: Record<string, number | string> = {}
  const computedTable = table ? computeTableRows(table.columns, table.rows) : null
  for (const row of rows) {
    if (row.kind === 'value') {
      results[row.id] = Number(row.value) || 0
      continue
    }
    const env: FormulaEnv = {
      ref(name) {
        const earlier = rows.find((candidate) => candidate.label === name)
        if (!earlier || !(earlier.id in results)) throw new FormulaError(`Unknown row [${name}]`)
        const value = results[earlier.id]
        if (value === '#ERR') throw new FormulaError('Referenced row errored')
        return value
      },
      sumTable(label) {
        if (!computedTable || !table) throw new FormulaError('No table on this template')
        const column = table.columns.find((candidate) => candidate.label === label)
        if (!column) throw new FormulaError(`Unknown table column "${label}"`)
        return computedTable.reduce((sum, entry) => sum + (Number(entry[column.id]) || 0), 0)
      },
    }
    try {
      const value = evaluateFormula(row.formula ?? '', env)
      results[row.id] = typeof value === 'boolean' ? Number(value) : value as number | string
    } catch {
      results[row.id] = '#ERR'
    }
  }
  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/institute-admin-web && npx vitest run src/features/documents/engine/formula.test.ts`
Expected: 9 PASSED. Also `npm run typecheck` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/institute-admin-web/src/features/documents/engine/formula.ts apps/institute-admin-web/src/features/documents/engine/formula.test.ts
git commit -m "feat(documents-web): safe spreadsheet formula engine"
```

---

### Task 8: Dataset registry + sample data + fee adapter

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/engine/datasets.ts`
- Test: `apps/institute-admin-web/src/features/documents/engine/datasets.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest'
import { CATEGORY_CONFIG, invoiceToDocumentData, sampleDocumentData } from './datasets'
import type { Invoice } from '../../finance/finance.api'

describe('sampleDocumentData', () => {
  it('provides tokens and rows for every category', () => {
    for (const category of ['FEE_INVOICE', 'FEE_RECEIPT', 'MARKSHEET', 'ID_CARD', 'CERTIFICATE'] as const) {
      const data = sampleDocumentData(category)
      expect(data.tokens.school_name).toBeTruthy()
      expect(data.tokens.student_name).toBeTruthy()
      expect(Array.isArray(data.rows)).toBe(true)
      expect(CATEGORY_CONFIG[category].tokenGroups.length).toBeGreaterThan(0)
    }
    expect(sampleDocumentData('FEE_INVOICE').rows.length).toBeGreaterThan(0)
    expect(sampleDocumentData('MARKSHEET').rows.length).toBeGreaterThan(3)
  })
})

describe('invoiceToDocumentData', () => {
  it('maps line items to fee_items rows and fills tokens', () => {
    const invoice = {
      id: 'i1', invoiceNumber: 'INV-2026-0042', studentId: 's1', studentName: 'Diya Sharma',
      admissionNumber: 'NSA-0042', className: 'Class 8 A', status: 'ISSUED',
      issueDate: '2026-08-13', dueDate: '2026-08-28',
      lineItems: [{ description: 'Tuition fee', period: 'Term 1', qty: 2, amount: '1500.50' }],
      subtotal: '3001.00', discountAmount: '0.00', taxAmount: '0.00', total: '3001.00',
      notes: '', templateId: null, totalPaid: '0.00',
    } as Invoice
    const data = invoiceToDocumentData(invoice, { name: 'Northstar', logoUrl: null, brandColor: '#143f5c' })

    expect(data.tokens.invoice_no).toBe('INV-2026-0042')
    expect(data.tokens.student_name).toBe('Diya Sharma')
    expect(data.tokens.class_section).toBe('Class 8 A')
    expect(data.rows[0]).toMatchObject({ c1: 'Tuition fee', c2: 'Term 1', c3: 2, c4: 1500.5, c6: 3001 })
    expect(data.images['institute-logo']).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement `engine/datasets.ts`**:

```typescript
/** Per-category configuration: merge-field token groups, table datasets with sample
 *  rows, and live-binding adapters (fees in Phase 1; marks/ID/certificate are sampled). */

import type { Invoice, InstituteBranding, Payment } from '../../finance/finance.api'
import type { DocumentCategory, DocumentData, PageSizeId, TableColumn } from './types'

export interface TokenGroup { source: string; fields: string[] }
export interface DatasetDef { id: string; label: string; columns: TableColumn[]; sampleRows: Record<string, unknown>[] }
export interface CategoryConfig {
  label: string
  pageSizeIds: PageSizeId[]
  pageCount: 1 | 2
  tokenGroups: TokenGroup[]
  datasets: DatasetDef[]
}

const SCHOOL_TOKENS: TokenGroup = { source: 'School', fields: ['school_name', 'school_address', 'school_gstin', 'authorised_signatory'] }
const STUDENT_TOKENS: TokenGroup = { source: 'Student', fields: ['student_name', 'student_id', 'class_section', 'roll_no', 'guardian_name'] }

export const SAMPLE_TOKENS: Record<string, string> = {
  student_name: 'Aarav Sharma', student_id: 'ADM-1042', class_section: 'Grade 8-A', roll_no: '14',
  guardian_name: 'Mr. Rakesh Sharma', staff_name: 'Priya Verma', staff_id: 'EMP-011', designation: 'Senior Teacher',
  invoice_no: 'INV-2026-0001', invoice_date: '12 Aug 2026', due_date: '31 Aug 2026', payment_status: 'Pending',
  receipt_no: 'RCP-2026-0001', payment_method: 'UPI',
  exam_name: 'Term 1 Examination', event_name: 'Annual Science Fair', academic_year: 'AY 2026-27',
  issue_date: '13 Aug 2026',
  school_name: 'Step Next Academy', school_address: 'Jodhpur, Rajasthan',
  school_gstin: '08AAAAA0000A1Z5', authorised_signatory: 'Principal',
}

const col = (id: string, label: string, extra: Partial<TableColumn> = {}): TableColumn => ({
  id, label, type: 'data', dtype: 'text', widthPct: 20, align: 'left', ...extra,
})

/** Data contract: c4 = per-unit rate; c6 = precomputed line total (rate × qty) —
 *  receipt tables read c6 since they have no Qty/Rate columns to compute from. */
export const FEE_ITEMS_DATASET: DatasetDef = {
  id: 'fee_items', label: 'Fee items',
  columns: [
    col('c1', 'Description', { widthPct: 38 }),
    col('c2', 'Period', { widthPct: 16 }),
    col('c3', 'Qty', { dtype: 'number', widthPct: 10, align: 'center' }),
    col('c4', 'Rate', { dtype: 'number', widthPct: 16, align: 'right' }),
    col('c5', 'Amount', { type: 'formula', formula: '=[Qty]*[Rate]', widthPct: 20, align: 'right' }),
  ],
  sampleRows: [
    { c1: 'Tuition fee', c2: 'Term 1', c3: 1, c4: 15000, c6: 15000 },
    { c1: 'Transport fee', c2: 'Term 1', c3: 1, c4: 3000, c6: 3000 },
  ],
}

export const MARKS_DATASET: DatasetDef = {
  id: 'marks', label: 'Mark sheet',
  columns: [
    col('c1', 'Subject', { widthPct: 30 }),
    col('c2', 'Max marks', { dtype: 'number', widthPct: 16, align: 'right' }),
    col('c3', 'Marks', { dtype: 'number', widthPct: 16, align: 'right' }),
    col('c4', 'Grade', {
      type: 'formula', widthPct: 14, align: 'center',
      formula: '=IF([Marks]>=91,"A1",IF([Marks]>=81,"A2",IF([Marks]>=71,"B1",IF([Marks]>=61,"B2",IF([Marks]>=51,"C1",IF([Marks]>=41,"C2",IF([Marks]>=33,"D","E")))))))',
    }),
  ],
  sampleRows: [
    { c1: 'English', c2: 100, c3: 88 }, { c1: 'Mathematics', c2: 100, c3: 95 },
    { c1: 'Science', c2: 100, c3: 79 }, { c1: 'Social Science', c2: 100, c3: 84 },
    { c1: 'Hindi', c2: 100, c3: 91 },
  ],
}

export const CATEGORY_CONFIG: Record<DocumentCategory, CategoryConfig> = {
  FEE_INVOICE: {
    label: 'Fee Invoice', pageSizeIds: ['A4P', 'A4P_HALF_TOP', 'A4P_HALF_BOTTOM'], pageCount: 1,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Invoice', fields: ['invoice_no', 'invoice_date', 'due_date', 'payment_status'] },
      SCHOOL_TOKENS,
    ],
    datasets: [FEE_ITEMS_DATASET],
  },
  FEE_RECEIPT: {
    label: 'Fee Receipt', pageSizeIds: ['A4P', 'A4P_HALF_TOP', 'A4P_HALF_BOTTOM'], pageCount: 1,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Receipt', fields: ['receipt_no', 'invoice_no', 'invoice_date', 'payment_method'] },
      SCHOOL_TOKENS,
    ],
    datasets: [FEE_ITEMS_DATASET],
  },
  MARKSHEET: {
    label: 'Mark Sheet', pageSizeIds: ['A4P'], pageCount: 1,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Exam', fields: ['exam_name', 'academic_year', 'issue_date'] },
      SCHOOL_TOKENS,
    ],
    datasets: [MARKS_DATASET],
  },
  ID_CARD: {
    label: 'ID Card', pageSizeIds: ['CR80'], pageCount: 2,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Staff', fields: ['staff_name', 'staff_id', 'designation'] },
      { source: 'Session', fields: ['academic_year', 'issue_date'] },
      SCHOOL_TOKENS,
    ],
    datasets: [],
  },
  CERTIFICATE: {
    label: 'Certificate', pageSizeIds: ['A4L', 'A4P'], pageCount: 1,
    tokenGroups: [
      STUDENT_TOKENS,
      { source: 'Certificate', fields: ['event_name', 'issue_date', 'academic_year'] },
      SCHOOL_TOKENS,
    ],
    datasets: [],
  },
}

export function sampleDocumentData(category: DocumentCategory): DocumentData {
  const dataset = CATEGORY_CONFIG[category].datasets[0]
  return {
    category,
    tokens: { ...SAMPLE_TOKENS },
    rows: dataset ? dataset.sampleRows.map((row) => ({ ...row })) : [],
    images: { 'institute-logo': null, 'student-photo': null, 'staff-photo': null },
    status: SAMPLE_TOKENS.payment_status,
  }
}

/** Phase 1 live adapter: a real invoice (+ optional payment for receipts) → DocumentData. */
export function invoiceToDocumentData(
  invoice: Invoice,
  branding: InstituteBranding,
  payment?: Payment,
): DocumentData {
  const category: DocumentCategory = payment ? 'FEE_RECEIPT' : 'FEE_INVOICE'
  // Blank-by-default: tokens a real document can't supply must NEVER fall back to
  // sample values — fabricated data on a printed financial document.
  const tokens: Record<string, string> = {}
  for (const group of CATEGORY_CONFIG[category].tokenGroups) {
    for (const field of group.fields) tokens[field] = ''
  }
  Object.assign(tokens, {
    student_name: invoice.studentName,
    student_id: invoice.admissionNumber,
    class_section: invoice.className,
    invoice_no: invoice.invoiceNumber,
    invoice_date: invoice.issueDate ?? '',
    due_date: invoice.dueDate,
    payment_status: invoice.status.replace('_', ' '),
    receipt_no: payment?.receiptNumber ?? '',
    payment_method: payment?.method ?? '',
    school_name: branding.name,
  })
  const rows = invoice.lineItems.map((item, index) => {
    const qty = Number(item.qty) || 1
    const rate = Number(item.amount) || 0
    return { c1: item.description, c2: item.period, c3: qty, c4: rate, c6: qty * rate, id: `row${index}` }
  })
  return {
    category,
    tokens,
    rows,
    images: { 'institute-logo': branding.logoUrl, 'student-photo': null, 'staff-photo': null },
    status: invoice.status,
  }
}
```

- [ ] **Step 4: Verify + commit**

Run: `cd apps/institute-admin-web && npx vitest run src/features/documents/engine/datasets.test.ts && npm run typecheck`
Expected: 2 PASSED, typecheck clean.

```bash
git add apps/institute-admin-web/src/features/documents/engine/datasets.ts apps/institute-admin-web/src/features/documents/engine/datasets.test.ts
git commit -m "feat(documents-web): dataset registry with samples and fee live adapter"
```

---

### Task 9: Element HTML renderers (single escape point)

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/engine/renderHtml.ts`
- Test: `apps/institute-admin-web/src/features/documents/engine/renderHtml.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest'
import { renderElementInner, resolveContent, type RenderContext } from './renderHtml'
import { FEE_ITEMS_DATASET, sampleDocumentData } from './datasets'
import type { TableElement, TextElement, TotalsElement } from './types'

function ctx(overrides: Partial<RenderContext> = {}): RenderContext {
  const data = sampleDocumentData('FEE_INVOICE')
  data.tokens.student_name = '<b>Diya</b> & Co'
  return { data, sampleMode: true, highlightTokens: false, table: { columns: FEE_ITEMS_DATASET.columns, rows: data.rows }, ...overrides }
}

const textEl = (content: string): TextElement => ({
  id: 'e1', type: 'text', x: 0, y: 0, w: 100, h: 10, content,
  style: { fontSize: 12, bold: false, italic: false, align: 'left', color: '#16212E' },
})

describe('resolveContent', () => {
  it('escapes literal text and token values', () => {
    const html = resolveContent('<script>x</script> {{student_name}}', ctx())
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;Diya&lt;/b&gt; &amp; Co')
  })

  it('shows raw tokens when sampleMode is off and blanks unknown tokens when on', () => {
    expect(resolveContent('{{student_name}}', ctx({ sampleMode: false }))).toContain('{{student_name}}')
    expect(resolveContent('{{bogus}}', ctx())).not.toContain('{{')
  })
})

describe('renderElementInner', () => {
  it('rejects malicious style colors', () => {
    const el = textEl('hi')
    el.style.color = 'red;background:url(javascript:x)' as string
    const html = renderElementInner(el, ctx())
    expect(html).not.toContain('javascript:')
  })

  it('renders table with computed formula column and #ERR isolation', () => {
    const table: TableElement = {
      id: 't1', type: 'table', x: 0, y: 0, w: 190, h: 60, datasetId: 'fee_items',
      columns: [...FEE_ITEMS_DATASET.columns, { id: 'c9', label: 'Bad', type: 'formula', formula: '=[Nope]', widthPct: 10, align: 'left' }],
      style: { headerBg: '#173A5E', headerColor: '#FFFFFF', fontSize: 10 },
    }
    const html = renderElementInner(table, ctx())
    expect(html).toContain('15,000.00')  // 1 × 15000 computed Amount
    expect(html).toContain('#ERR')
  })

  it('renders totals with SUM_TABLE and row refs', () => {
    const totals: TotalsElement = {
      id: 'to1', type: 'totals', x: 0, y: 0, w: 70, h: 30, datasetId: 'fee_items',
      rows: [
        { id: 'r1', label: 'Subtotal', kind: 'formula', formula: '=SUM_TABLE("Amount")' },
        { id: 'r2', label: 'Grand total', kind: 'formula', formula: '=[Subtotal]', emphasize: true },
      ],
    }
    const html = renderElementInner(totals, ctx())
    expect(html).toContain('18,000.00')
    expect(html).toContain('Grand total')
  })

  it('renders qr placeholder without a data url and img with one', () => {
    const qr = { id: 'q1', type: 'qr' as const, x: 0, y: 0, w: 22, h: 22, encode: 'verify-url' as const }
    expect(renderElementInner(qr, ctx())).toContain('doc-qr-placeholder')
    const withUrl = ctx()
    withUrl.data.qrDataUrls = { q1: 'data:image/png;base64,AAA' }
    expect(renderElementInner(qr, withUrl)).toContain('<img')
  })
})
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement `engine/renderHtml.ts`**:

```typescript
/** Per-element HTML renderers. THE single escape boundary for the whole Studio:
 *  every dynamic value passes through escapeHtml / safe* helpers here.
 *  Used identically by the editor canvas (via dangerouslySetInnerHTML inside the
 *  positioned wrapper) and by docRender's print assembly — guaranteeing WYSIWYG. */

import { computeTableRows, computeTotals } from './formula'
import type { CanvasElement, TableColumn, TextAlign } from './types'
import type { DocumentData } from './types'

export interface RenderContext {
  data: DocumentData
  /** true → tokens resolve to values; false → show raw {{token}} (editor "sample data" off). */
  sampleMode: boolean
  /** editor: wrap resolved tokens in a highlight span; print: plain text. */
  highlightTokens: boolean
  /** The template's table (if any) — needed by totals SUM_TABLE. */
  table: { columns: TableColumn[]; rows: Record<string, unknown>[] } | null
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character
  ))
}

export const safeAlign = (value: string): TextAlign =>
  (['left', 'center', 'right'].includes(value) ? value as TextAlign : 'left')
export const safeColor = (value: string, fallback = '#16212E'): string =>
  (/^#[0-9A-Fa-f]{3,8}$/.test(value) ? value : fallback)
export const safePct = (value: number): number =>
  (Number.isFinite(value) ? Math.min(Math.max(value, 1), 100) : 20)

const formatNumber = (value: unknown): string => {
  const num = Number(value)
  if (!Number.isFinite(num)) return escapeHtml(String(value ?? ''))
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Escape everything, then substitute {{tokens}} (tokens survive escaping — no {} in the escape set). */
export function resolveContent(content: string, ctx: RenderContext): string {
  return escapeHtml(content).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, token: string) => {
    if (!ctx.sampleMode) return `<span class="doc-tk">{{${escapeHtml(token)}}}</span>`
    const value = escapeHtml(ctx.data.tokens[token] ?? '')
    return ctx.highlightTokens ? `<span class="doc-tk">${value}</span>` : value
  })
}

export function renderElementInner(el: CanvasElement, ctx: RenderContext): string {
  switch (el.type) {
    case 'text': {
      const s = el.style
      return `<div class="doc-text" style="font-size:${safePct(s.fontSize)}px;font-weight:${s.bold ? 700 : 400};font-style:${s.italic ? 'italic' : 'normal'};text-align:${safeAlign(s.align)};color:${safeColor(s.color)}">${resolveContent(el.content, ctx).replace(/\n/g, '<br>')}</div>`
    }
    case 'image': {
      const src = ctx.data.images[el.src] ?? (el.src.startsWith('http') || el.src.startsWith('data:') ? el.src : null)
      if (src) return `<img class="doc-img" src="${escapeHtml(src)}" alt="" />`
      return `<div class="doc-img-fallback">${escapeHtml(el.fallbackInitials || '?')}</div>`
    }
    case 'table': {
      const rows = computeTableRows(el.columns, ctx.data.rows)
      const header = el.columns.map((column) =>
        `<th style="width:${safePct(column.widthPct)}%;text-align:${safeAlign(column.align)}">${escapeHtml(column.label)}</th>`,
      ).join('')
      const body = rows.map((row) => `<tr>${el.columns.map((column) => {
        const raw = row[column.id]
        const value = (column.dtype === 'number' || column.type === 'formula') && raw !== '#ERR'
          ? formatNumber(raw)
          : escapeHtml(String(raw ?? ''))
        return `<td style="text-align:${safeAlign(column.align)}">${value === '#ERR' ? '#ERR' : value}</td>`
      }).join('')}</tr>`).join('')
      return `<table class="doc-table" style="font-size:${safePct(el.style.fontSize)}px"><thead><tr style="background:${safeColor(el.style.headerBg)};color:${safeColor(el.style.headerColor, '#FFFFFF')}">${header}</tr></thead><tbody>${body}</tbody></table>`
    }
    case 'totals': {
      const results = computeTotals(el.rows, ctx.table)
      return `<div class="doc-totals">${el.rows.map((row) => {
        const value = results[row.id]
        const display = value === '#ERR' ? '#ERR' : formatNumber(value)
        return `<div class="doc-totals-row${row.emphasize ? ' is-grand' : ''}"><span>${escapeHtml(row.label)}</span><span>${display}</span></div>`
      }).join('')}</div>`
    }
    case 'shape':
      return `<div class="doc-shape" style="background:${safeColor(el.fill, '#E8EEF5')}"></div>`
    case 'divider':
      return `<div class="doc-divider" style="border-top-color:${safeColor(el.stroke)}"></div>`
    case 'signature':
      return `<div class="doc-signature">${escapeHtml(el.label)}</div>`
    case 'qr': {
      const dataUrl = ctx.data.qrDataUrls?.[el.id]
      if (dataUrl) return `<img class="doc-qr" src="${escapeHtml(dataUrl)}" alt="QR code" />`
      return `<div class="doc-qr-placeholder"></div>`
    }
  }
}

/** Shared element CSS injected by both the stage (editor) and docRender (print). */
export const ELEMENT_CSS = `
.doc-text{line-height:1.35;overflow:hidden;width:100%;height:100%}
.doc-tk{background:#FDF1E1;color:#9A5B12;border-radius:2px;padding:0 1px}
.doc-img{width:100%;height:100%;object-fit:contain}
.doc-img-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#173A5E;color:#fff;font-weight:800;border-radius:4px}
.doc-table{width:100%;border-collapse:collapse}
.doc-table th{padding:4px 5px;font-weight:700;text-align:left}
.doc-table td{padding:3.5px 5px;border-bottom:0.3mm solid #EEF0F4}
.doc-totals{width:100%;font-size:11px}
.doc-totals-row{display:flex;justify-content:space-between;padding:1px 0}
.doc-totals-row.is-grand{font-weight:800;border-top:0.4mm solid #16212E;margin-top:1mm;padding-top:1mm}
.doc-shape{width:100%;height:100%}
.doc-divider{width:100%;border-top:0.5mm solid #5B6675}
.doc-signature{width:100%;height:100%;border-top:0.3mm solid #5B6675;display:flex;align-items:flex-end;justify-content:center;font-size:9px;color:#5B6675;padding-top:1mm}
.doc-qr,.doc-qr-placeholder{width:100%;height:100%}
.doc-qr-placeholder{background:repeating-conic-gradient(#16212E 0% 25%, #fff 0% 50%) 0 0/22% 22%;border-radius:2px}
`
```

- [ ] **Step 4: Verify + commit**

Run: `cd apps/institute-admin-web && npx vitest run src/features/documents/engine/renderHtml.test.ts && npm run typecheck`
Expected: 6 PASSED, typecheck clean.

```bash
git add apps/institute-admin-web/src/features/documents/engine/renderHtml.ts apps/institute-admin-web/src/features/documents/engine/renderHtml.test.ts
git commit -m "feat(documents-web): escaped per-element HTML renderers shared by editor and print"
```

---

### Task 10: Document renderer — zones, watermark, grow-and-push, print doc

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/engine/docRender.ts`
- Test: `apps/institute-admin-web/src/features/documents/engine/docRender.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest'
import { paginateLayout, renderDocumentHtml, tableRowsPerPage } from './docRender'
import { sampleDocumentData } from './datasets'
import { defaultLayout, type LayoutV2, type TableElement, type TextElement } from './types'
import { FEE_ITEMS_DATASET } from './datasets'

const text = (id: string, y: number, content = 'x'): TextElement => ({
  id, type: 'text', x: 10, y, w: 100, h: 8, content,
  style: { fontSize: 10, bold: false, italic: false, align: 'left', color: '#16212E' },
})
const table = (y = 80, h = 40): TableElement => ({
  id: 'tbl', type: 'table', x: 10, y, w: 190, h, datasetId: 'fee_items',
  columns: FEE_ITEMS_DATASET.columns,
  style: { headerBg: '#173A5E', headerColor: '#FFFFFF', fontSize: 10 },
})

function layoutWith(elements: LayoutV2['pages'][0]['elements'], zones?: Partial<LayoutV2['zones']>): LayoutV2 {
  const layout = defaultLayout('A4P')
  layout.pages[0].elements = elements
  layout.zones = { ...layout.zones, headerMm: 30, footerMm: 15, repeatHeader: true, repeatFooter: true, ...zones }
  return layout
}

describe('paginateLayout', () => {
  it('keeps everything on one page when the table fits', () => {
    const layout = layoutWith([text('h1', 5), table(), text('below', 130)])
    const data = sampleDocumentData('FEE_INVOICE') // 2 rows
    const plans = paginateLayout(layout, 0, data.rows.length)
    expect(plans).toHaveLength(1)
    expect(plans[0].rowRange).toEqual([0, 2])
  })

  it('splits rows across pages and pushes below-band elements to the last page', () => {
    const layout = layoutWith([text('h1', 5), table(80, 40), text('below', 130)])
    const plans = paginateLayout(layout, 0, 200)
    expect(plans.length).toBeGreaterThan(1)
    const last = plans[plans.length - 1]
    expect(last.elements.some((placed) => placed.element.id === 'below')).toBe(true)
    expect(plans[0].elements.some((placed) => placed.element.id === 'below')).toBe(false)
    const covered = plans.reduce((sum, plan) => sum + (plan.rowRange ? plan.rowRange[1] - plan.rowRange[0] : 0), 0)
    expect(covered).toBe(200)
  })

  it('repeats header elements on continuation pages unless hidden on first', () => {
    const layout = layoutWith([text('h1', 5), table(80, 40)], { hideHeaderOnFirstPage: true })
    const plans = paginateLayout(layout, 0, 200)
    expect(plans[0].elements.some((placed) => placed.element.id === 'h1')).toBe(false)
    expect(plans[1].elements.some((placed) => placed.element.id === 'h1')).toBe(true)
  })

  it('grow-and-push shifts a below element down when the table grows within one page', () => {
    const layout = layoutWith([table(80, 20), text('below', 105)])
    const plans = paginateLayout(layout, 0, 8) // 8 rows won't fit 20mm design height but fit the page
    const below = plans[0].elements.find((placed) => placed.element.id === 'below')!
    expect(below.y).toBeGreaterThan(105)
  })
})

describe('renderDocumentHtml', () => {
  it('emits mm-positioned sheets with @page sizing and escaped tokens', () => {
    const layout = layoutWith([text('t', 40, 'Hello {{student_name}}')])
    const data = sampleDocumentData('FEE_INVOICE')
    data.tokens.student_name = '<script>alert(1)</script>'
    const html = renderDocumentHtml({ layout, data, mode: 'print' })
    expect(html).toContain('@page{size:210mm 297mm')
    expect(html).toContain('left:10mm')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders two sheets for a CR80 two-page layout and a watermark when enabled', () => {
    const layout = defaultLayout('CR80', 2)
    layout.pages[0].elements = [text('f', 10, 'front')]
    layout.pages[1].elements = [text('b', 10, 'back')]
    layout.watermark = { enabled: true, mode: 'text', text: 'SAMPLE', imageUrl: '', opacity: 0.1 }
    const html = renderDocumentHtml({ layout, data: sampleDocumentData('ID_CARD'), mode: 'print' })
    expect(html.match(/class="doc-sheet"/g)).toHaveLength(2)
    expect(html).toContain('@page{size:86mm 54mm')
    expect(html).toContain('doc-watermark')
  })
})

describe('tableRowsPerPage', () => {
  it('is deterministic and positive', () => {
    expect(tableRowsPerPage(10, 100)).toBeGreaterThan(0)
    expect(tableRowsPerPage(10, 100)).toBe(tableRowsPerPage(10, 100))
  })
})
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement `engine/docRender.ts`**:

```typescript
/** Assembles full printable documents from layout JSON v2 + DocumentData.
 *  Deterministic mm geometry: pagination math is pure and unit-tested; the same
 *  numbers drive the editor preview, so what you see is what prints. */

import { ELEMENT_CSS, escapeHtml, renderElementInner, safeColor, type RenderContext } from './renderHtml'
import { PAGE_SIZES_MM, type CanvasElement, type DocumentData, type LayoutV2, type TableElement } from './types'

/** Coerce untrusted geometry to a finite number before interpolating into CSS. */
const mm = (n: unknown): number => (Number.isFinite(n) ? (n as number) : 0)

/** Deterministic per-row height estimate in mm (fontSize is px). */
export function tableRowMm(fontSizePx: number): number {
  const size = Number.isFinite(fontSizePx) ? fontSizePx : 10
  return size * 0.35 + 3.2
}

export function tableRowsPerPage(fontSizePx: number, availableMm: number): number {
  return Math.max(1, Math.floor((availableMm - tableRowMm(fontSizePx)) / tableRowMm(fontSizePx)))
}

export interface PlacedElement { element: CanvasElement; y: number }
export interface PagePlan { elements: PlacedElement[]; rowRange?: [number, number]; tableY?: number }

type Zone = 'header' | 'footer' | 'body'

function zoneOf(element: CanvasElement, layout: LayoutV2): Zone {
  const { h: pageH } = PAGE_SIZES_MM[layout.page.sizeId]
  if (layout.zones.headerMm > 0 && element.y < layout.zones.headerMm) return 'header'
  if (layout.zones.footerMm > 0 && element.y + element.h > pageH - layout.zones.footerMm) return 'footer'
  return 'body'
}

/** Plan the physical pages for ONE layout page (grow-and-push around its table). */
export function paginateLayout(layout: LayoutV2, pageIndex: number, rowCount: number): PagePlan[] {
  const elements = layout.pages[pageIndex].elements
  const { h: pageH } = PAGE_SIZES_MM[layout.page.sizeId]
  const table = elements.find((element): element is TableElement => element.type === 'table')
  const headerEls = elements.filter((element) => zoneOf(element, layout) === 'header')
  const footerEls = elements.filter((element) => zoneOf(element, layout) === 'footer')
  const place = (list: CanvasElement[]): PlacedElement[] => list.map((element) => ({ element, y: element.y }))
  const firstPageHeader = layout.zones.hideHeaderOnFirstPage ? [] : headerEls

  if (!table) {
    return [{ elements: place(elements.filter((element) => layout.zones.hideHeaderOnFirstPage ? zoneOf(element, layout) !== 'header' : true)) }]
  }

  const bodyEls = elements.filter((element) => element !== table && zoneOf(element, layout) === 'body')
  const aboveOrBeside = bodyEls.filter((element) => element.y < table.y + table.h)
  const below = bodyEls.filter((element) => element.y >= table.y + table.h)

  const rowMm = tableRowMm(table.style.fontSize)
  const headerRowMm = rowMm
  const bottomLimit = pageH - Math.max(layout.zones.footerMm, layout.page.marginMm)
  const firstAvail = bottomLimit - table.y - headerRowMm
  const firstCapacity = Math.max(1, Math.floor(firstAvail / rowMm))

  if (rowCount <= firstCapacity) {
    // Single page: grow-and-push within the page.
    const naturalMm = headerRowMm + rowCount * rowMm
    const delta = Math.max(0, naturalMm - table.h)
    return [{
      elements: [
        ...place(firstPageHeader), ...place(footerEls), ...place(aboveOrBeside),
        { element: table, y: table.y },
        ...below.map((element) => ({ element, y: element.y + delta })),
      ],
      rowRange: [0, rowCount],
      tableY: table.y,
    }]
  }

  const plans: PagePlan[] = []
  const contTableY = Math.max(layout.zones.headerMm, layout.page.marginMm) + 4
  const contCapacity = Math.max(1, Math.floor((bottomLimit - contTableY - headerRowMm) / rowMm))
  let consumed = 0
  let pageNo = 0
  while (consumed < rowCount) {
    const isFirst = pageNo === 0
    const capacity = isFirst ? firstCapacity : contCapacity
    const take = Math.min(capacity, rowCount - consumed)
    const tableY = isFirst ? table.y : contTableY
    const isLast = consumed + take >= rowCount
    const repeatedHeader = isFirst ? firstPageHeader : (layout.zones.repeatHeader ? headerEls : [])
    const repeatedFooter = isFirst ? footerEls : (layout.zones.repeatFooter ? footerEls : [])
    const pageElements: PlacedElement[] = [
      ...place(repeatedHeader), ...place(repeatedFooter),
      ...(isFirst ? place(aboveOrBeside) : []),
      { element: table, y: tableY },
    ]
    if (isLast) {
      const tableEnd = tableY + tableRowMm(table.style.fontSize) + take * rowMm
      const designBottom = table.y + table.h
      pageElements.push(...below.map((element) => ({ element, y: tableEnd + (element.y - designBottom) })))
    }
    plans.push({ elements: pageElements, rowRange: [consumed, consumed + take], tableY })
    consumed += take
    pageNo += 1
  }
  return plans
}

export interface RenderDocumentOptions {
  layout: LayoutV2
  data: DocumentData
  mode: 'print' | 'preview'
  sampleMode?: boolean
}

export function renderDocumentHtml({ layout, data, mode, sampleMode = true }: RenderDocumentOptions): string {
  const { w: pageW, h: pageH } = PAGE_SIZES_MM[layout.page.sizeId]
  const table = layout.pages.flatMap((page) => page.elements).find((element): element is TableElement => element.type === 'table')
  const ctx: RenderContext = {
    data, sampleMode, highlightTokens: false,
    table: table ? { columns: table.columns, rows: data.rows } : null,
  }
  const background = typeof layout.page.background === 'string'
    ? `background:${safeColor(layout.page.background, '#FFFFFF')}`
    : `background-image:url('${escapeHtml(layout.page.background.imageUrl)}');background-size:cover`
  const watermark = layout.watermark.enabled
    ? (layout.watermark.mode === 'text'
      ? `<div class="doc-watermark"><span style="opacity:${Math.min(Math.max(mm(layout.watermark.opacity), 0.02), 0.4)}">${escapeHtml(layout.watermark.text)}</span></div>`
      : `<div class="doc-watermark"><img src="${escapeHtml(layout.watermark.imageUrl)}" style="opacity:${Math.min(Math.max(mm(layout.watermark.opacity) * 4, 0.05), 0.6)}" alt="" /></div>`)
    : ''

  const sheets: string[] = []
  layout.pages.forEach((_page, pageIndex) => {
    const plans = paginateLayout(layout, pageIndex, data.rows.length)
    plans.forEach((plan) => {
      const inner = plan.elements.map(({ element, y }) => {
        const content = element.type === 'table' && plan.rowRange
          ? renderElementInner(element, { ...ctx, data: { ...data, rows: data.rows.slice(plan.rowRange[0], plan.rowRange[1]) } })
          : renderElementInner(element, ctx)
        return `<div class="doc-el" style="left:${mm(element.x)}mm;top:${mm(y)}mm;width:${mm(element.w)}mm;${element.type === 'table' || element.type === 'totals' ? '' : `height:${mm(element.h)}mm;`}">${content}</div>`
      }).join('')
      sheets.push(`<div class="doc-sheet" style="${background}">${watermark}${inner}</div>`)
    })
  })

  const previewCss = mode === 'preview'
    ? 'body{background:#F3F5F8;padding:12px}.doc-sheet{box-shadow:0 2px 14px rgba(22,33,46,.18);margin:0 auto 12px}'
    : 'body{margin:0}.doc-sheet{page-break-after:always}.doc-sheet:last-child{page-break-after:auto}'

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Document</title><style>
@page{size:${pageW}mm ${pageH}mm;margin:0}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:#16212E}
.doc-sheet{width:${pageW}mm;height:${pageH}mm;position:relative;overflow:hidden}
.doc-el{position:absolute}
.doc-watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden}
.doc-watermark span{font-size:64px;font-weight:800;color:#173A5E;transform:rotate(-28deg);white-space:nowrap}
.doc-watermark img{max-width:60%;max-height:60%;transform:rotate(-20deg);object-fit:contain}
${ELEMENT_CSS}
${previewCss}
</style></head><body>${sheets.join('')}</body></html>`
}

/** Popup + print — same pattern as the finance renderer it replaces. */
export function openPrintWindow(html: string): boolean {
  const popup = window.open('', '_blank', 'width=900,height=900')
  if (!popup) return false
  popup.opener = null
  popup.document.write(html.replace('</body>', "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body>"))
  popup.document.close()
  return true
}
```

- [ ] **Step 4: Verify + commit**

Run: `cd apps/institute-admin-web && npx vitest run src/features/documents/engine/docRender.test.ts && npm run typecheck`
Expected: 7 PASSED, typecheck clean.

```bash
git add apps/institute-admin-web/src/features/documents/engine/docRender.ts apps/institute-admin-web/src/features/documents/engine/docRender.test.ts
git commit -m "feat(documents-web): document renderer with zones, watermark and grow-and-push pagination"
```

---

### Task 11: QR payload codec + QR image preparation

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/engine/qrPayload.ts`
- Test: `apps/institute-admin-web/src/features/documents/engine/qrPayload.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, expect, it } from 'vitest'
import { buildVerifyUrl, decodePayload, encodePayload, payloadFromDocumentData, type QrDocPayload } from './qrPayload'
import { sampleDocumentData } from './datasets'

const payload: QrDocPayload = {
  v: 1, cat: 'FEE_INVOICE', num: 'INV-2026-0001', date: '2026-08-13',
  inst: 'Step Next Academy', student: 'Aarav Sharma · Grade 8-A',
  items: [['Tuition fee', 15000], ['Transport fee', 3000]],
  totals: [['Grand total', 18000]], status: 'Pending',
}

describe('qrPayload', () => {
  it('round-trips through encode/decode including unicode', () => {
    const unicode = { ...payload, student: 'आरव शर्मा · कक्षा 8' }
    expect(decodePayload(encodePayload(unicode))).toEqual({ ok: true, payload: unicode })
  })

  it('produces URL-safe output', () => {
    const encoded = encodePayload(payload)
    expect(encoded).not.toMatch(/[+/=#?]/)
  })

  it('degrades oversized payloads by dropping items, deterministically', () => {
    const huge = {
      ...payload,
      items: Array.from({ length: 400 }, (_, i) => [`Line item with a fairly long description ${i}`, i * 10] as [string, number]),
    }
    const url = buildVerifyUrl('https://app.example.com', huge)
    const fragment = url.split('#')[1]
    expect(fragment.length).toBeLessThanOrEqual(2500)
    const decoded = decodePayload(fragment)
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.payload.items).toBeUndefined()
    expect(decoded.payload.totals).toEqual(payload.totals)
  })

  it('rejects oversized encoded payloads', () => {
    // Poorly compressible content so the encoded form blows past the ceiling.
    const bomb = {
      ...payload,
      items: Array.from({ length: 5000 }, (_, i) => [`item-${i}-${Math.sqrt(i + 2)}`, i] as [string, number]),
    }
    const encoded = encodePayload(bomb)
    expect(encoded.length).toBeGreaterThan(10000)
    expect(decodePayload(encoded)).toEqual({ ok: false })
  })

  it('rejects malformed and wrong-shape payloads', () => {
    expect(decodePayload('%%%not-base64url%%%')).toEqual({ ok: false })
    expect(decodePayload('')).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ v: 999 } as unknown as QrDocPayload))).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ ...payload, items: 'not-an-array' } as unknown as QrDocPayload))).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ ...payload, cat: 'EVIL' } as unknown as QrDocPayload))).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ ...payload, num: 42 } as unknown as QrDocPayload))).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ ...payload, items: [['only-one-element']] } as unknown as QrDocPayload))).toEqual({ ok: false })
  })

  it('builds a payload from DocumentData with c6 line totals', () => {
    const data = sampleDocumentData('FEE_INVOICE')
    const built = payloadFromDocumentData(data)
    expect(built.v).toBe(1)
    expect(built.num).toBe(data.tokens.invoice_no)
    expect(built.inst).toBe(data.tokens.school_name)
    expect(built.items!.length).toBe(data.rows.length)
    expect(built.items).toEqual(data.rows.map((row) => [String(row.c1), Number(row.c6)]))
  })

  it('omits items for non-fee categories', () => {
    const built = payloadFromDocumentData(sampleDocumentData('MARKSHEET'))
    expect(built.items).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement `engine/qrPayload.ts`**:

```typescript
/** Self-contained document payloads for QR codes.
 *  The payload rides in a URL #fragment (never sent to any server); the verify page
 *  renders it with zero database dependency. QR capacity is ~2.9KB — buildVerifyUrl
 *  deterministically degrades to a summary (no line items) when over budget.
 *
 *  SECURITY: the fragment is attacker-forgeable (anyone can print their own QR
 *  pointing at /verify), so decodePayload is a trust boundary: it caps input size
 *  before inflating, never throws, and validates the decoded shape before
 *  returning ok. */

import { deflate, inflate } from 'pako'
import QRCode from 'qrcode'
import type { DocumentCategory, DocumentData, LayoutV2 } from './types'

export interface QrDocPayload {
  v: 1
  cat: DocumentCategory
  num: string
  date: string
  inst: string
  student?: string
  items?: [string, number][]
  totals?: [string, number][]
  status?: string
}

export type QrDecodeResult = { ok: true; payload: QrDocPayload } | { ok: false }

const FRAGMENT_BUDGET = 2500
/** Hard ceiling on encoded input length, enforced before inflate (zip-bomb guard). */
const MAX_ENCODED_LENGTH = FRAGMENT_BUDGET * 4

const CATEGORIES: readonly DocumentCategory[] = ['FEE_INVOICE', 'FEE_RECEIPT', 'MARKSHEET', 'ID_CARD', 'CERTIFICATE']

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function isPairArray(value: unknown): value is [string, number][] {
  return Array.isArray(value) && value.every((entry) =>
    Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'number')
}

function isQrDocPayload(value: unknown): value is QrDocPayload {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (candidate.v !== 1) return false
  if (typeof candidate.cat !== 'string' || !CATEGORIES.includes(candidate.cat as DocumentCategory)) return false
  for (const key of ['num', 'date', 'inst'] as const) {
    if (typeof candidate[key] !== 'string') return false
  }
  for (const key of ['student', 'status'] as const) {
    if (candidate[key] !== undefined && typeof candidate[key] !== 'string') return false
  }
  for (const key of ['items', 'totals'] as const) {
    if (candidate[key] !== undefined && !isPairArray(candidate[key])) return false
  }
  return true
}

export function encodePayload(payload: QrDocPayload): string {
  return toBase64Url(deflate(new TextEncoder().encode(JSON.stringify(payload))))
}

export function decodePayload(encoded: string): QrDecodeResult {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_ENCODED_LENGTH) return { ok: false }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(inflate(fromBase64Url(encoded))))
    return isQrDocPayload(parsed) ? { ok: true, payload: parsed } : { ok: false }
  } catch {
    return { ok: false }
  }
}

export function buildVerifyUrl(baseUrl: string, payload: QrDocPayload): string {
  let encoded = encodePayload(payload)
  if (encoded.length > FRAGMENT_BUDGET) {
    const { items: _items, ...summary } = payload
    encoded = encodePayload(summary as QrDocPayload)
  }
  return `${baseUrl.replace(/\/$/, '')}/verify#${encoded}`
}

export function payloadFromDocumentData(data: DocumentData): QrDocPayload {
  const isReceipt = data.category === 'FEE_RECEIPT'
  const isFeeDocument = data.category === 'FEE_INVOICE' || isReceipt
  return {
    v: 1,
    cat: data.category,
    num: (isReceipt ? data.tokens.receipt_no : data.tokens.invoice_no) || data.tokens.student_id || '',
    date: data.tokens.invoice_date || data.tokens.issue_date || '',
    inst: data.tokens.school_name || '',
    student: [data.tokens.student_name, data.tokens.class_section].filter(Boolean).join(' · ') || undefined,
    // c6 is the precomputed line total (see datasets.ts data contract). Non-fee
    // categories carry marks/attributes in these columns, so they get no items.
    items: isFeeDocument && data.rows.length
      ? data.rows.map((row) => [String(row.c1 ?? ''), Number(row.c6 ?? 0)] as [string, number])
      : undefined,
    status: data.status,
  }
}

/** Pre-generate QR data URLs for every qr element (async; docRender is sync). */
export async function prepareQrDataUrls(
  layout: LayoutV2,
  data: DocumentData,
  verifyBaseUrl: string = window.location.origin,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const payload = payloadFromDocumentData(data)
  for (const page of layout.pages) {
    for (const element of page.elements) {
      if (element.type !== 'qr') continue
      const content = element.encode === 'document-number'
        ? (payload.num || 'UNASSIGNED')
        : buildVerifyUrl(verifyBaseUrl, payload)
      result[element.id] = await QRCode.toDataURL(content, { margin: 0, width: 256 })
    }
  }
  return result
}
```

- [ ] **Step 4: Verify + commit**

Run: `cd apps/institute-admin-web && npx vitest run src/features/documents/engine/qrPayload.test.ts && npm run typecheck`
Expected: 7 PASSED, typecheck clean. (Note: `prepareQrDataUrls` isn't unit-tested — it needs a DOM canvas; the codec functions it composes are.)

```bash
git add apps/institute-admin-web/src/features/documents/engine/qrPayload.ts apps/institute-admin-web/src/features/documents/engine/qrPayload.test.ts
git commit -m "feat(documents-web): compressed QR payload codec with deterministic degradation"
```

---

### Task 12: Editor state reducer + snap math

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/studio/useEditorState.ts`
- Create: `apps/institute-admin-web/src/features/documents/studio/snap.ts`
- Create: `apps/institute-admin-web/src/features/documents/studio/elementDefaults.ts`
- Test: `apps/institute-admin-web/src/features/documents/studio/useEditorState.test.ts`, `apps/institute-admin-web/src/features/documents/studio/snap.test.ts`

- [ ] **Step 1: Write the failing reducer tests**

Create `studio/useEditorState.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState } from './useEditorState'
import { defaultElement } from './elementDefaults'
import { defaultLayout } from '../engine/types'

function loaded() {
  return editorReducer(initialEditorState, { type: 'load', layout: defaultLayout('A4P') })
}

describe('editorReducer', () => {
  it('adds, selects and clamps elements to the page', () => {
    let state = loaded()
    const el = defaultElement('text', 'FEE_INVOICE')
    state = editorReducer(state, { type: 'addElement', element: { ...el, x: 500, y: -20 } })
    const added = state.layout.pages[0].elements[0]
    expect(state.selectedId).toBe(added.id)
    expect(added.x).toBeLessThanOrEqual(210 - added.w)
    expect(added.y).toBeGreaterThanOrEqual(0)
  })

  it('transient moves do not enter history until commit', () => {
    let state = loaded()
    state = editorReducer(state, { type: 'addElement', element: defaultElement('text', 'FEE_INVOICE') })
    const id = state.selectedId!
    const depth = state.history.length
    state = editorReducer(state, { type: 'moveElement', id, x: 50, y: 60 })
    expect(state.history.length).toBe(depth)
    state = editorReducer(state, { type: 'commit' })
    expect(state.history.length).toBe(depth + 1)
  })

  it('undo/redo restores layout snapshots and clears dangling selection', () => {
    let state = loaded()
    state = editorReducer(state, { type: 'addElement', element: defaultElement('shape', 'FEE_INVOICE') })
    const id = state.selectedId!
    state = editorReducer(state, { type: 'deleteElement', id })
    expect(state.layout.pages[0].elements).toHaveLength(0)
    state = editorReducer(state, { type: 'undo' })
    expect(state.layout.pages[0].elements).toHaveLength(1)
    state = editorReducer(state, { type: 'redo' })
    expect(state.layout.pages[0].elements).toHaveLength(0)
    expect(state.selectedId).toBeNull()
  })

  it('duplicate offsets the copy and enforces the single-table rule', () => {
    let state = loaded()
    state = editorReducer(state, { type: 'addElement', element: defaultElement('table', 'FEE_INVOICE') })
    const tableId = state.selectedId!
    state = editorReducer(state, { type: 'duplicateElement', id: tableId })
    expect(state.layout.pages[0].elements.filter((element) => element.type === 'table')).toHaveLength(1)
    state = editorReducer(state, { type: 'addElement', element: defaultElement('text', 'FEE_INVOICE') })
    const textId = state.selectedId!
    state = editorReducer(state, { type: 'duplicateElement', id: textId })
    const texts = state.layout.pages[0].elements.filter((element) => element.type === 'text')
    expect(texts).toHaveLength(2)
    expect(texts[1].x).toBeCloseTo(texts[0].x + 4)
  })

  it('page/zone/watermark edits commit; zoom and sampleMode do not', () => {
    let state = loaded()
    const depth = state.history.length
    state = editorReducer(state, { type: 'setZones', patch: { headerMm: 30 } })
    expect(state.layout.zones.headerMm).toBe(30)
    expect(state.history.length).toBe(depth + 1)
    state = editorReducer(state, { type: 'setZoom', zoom: 1.2 })
    state = editorReducer(state, { type: 'setSampleMode', on: false })
    expect(state.history.length).toBe(depth + 1)
  })
})
```

Create `studio/snap.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { computeSnap } from './snap'

const page = { w: 210, h: 297, margin: 10 }

describe('computeSnap', () => {
  it('snaps the left edge to the page margin within tolerance', () => {
    const result = computeSnap({ x: 11.2, y: 50, w: 40, h: 10 }, [], page)
    expect(result.x).toBe(10)
    expect(result.guides.some((guide) => guide.orientation === 'v' && guide.positionMm === 10)).toBe(true)
  })

  it('snaps the horizontal centre to the page centre', () => {
    const result = computeSnap({ x: 84.4, y: 50, w: 40, h: 10 }, [], page) // centre 104.4 ≈ 105
    expect(result.x).toBeCloseTo(85)
  })

  it('snaps to a sibling edge and ignores far elements', () => {
    const sibling = { x: 60, y: 20, w: 30, h: 10 }
    const near = computeSnap({ x: 59.1, y: 100, w: 20, h: 10 }, [sibling], page)
    expect(near.x).toBe(60)
    // x: 30 keeps every edge (30 / 40 / 50) > tolerance from all targets; the plan's
    // original x: 40 put the right edge exactly on the sibling's left edge (60),
    // which legitimately emits a zero-delta alignment guide.
    const far = computeSnap({ x: 30, y: 100, w: 20, h: 10 }, [sibling], page)
    expect(far.x).toBe(30)
    expect(far.guides).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement the three modules**.

`studio/elementDefaults.ts`:

```typescript
import { CATEGORY_CONFIG } from '../engine/datasets'
import type { CanvasElement, DocumentCategory, ElementType } from '../engine/types'

export function makeElementId(): string {
  return `el-${Math.random().toString(36).slice(2, 10)}`
}

export function defaultElement(type: ElementType, category: DocumentCategory): CanvasElement {
  const id = makeElementId()
  const base = { id, x: 20, y: 30, locked: false }
  switch (type) {
    case 'text':
      return { ...base, type, w: 70, h: 10, content: 'New text — {{student_name}}', style: { fontSize: 12, bold: false, italic: false, align: 'left', color: '#16212E' } }
    case 'image':
      return { ...base, type, w: 24, h: 24, src: 'institute-logo', fallbackInitials: 'SC' }
    case 'table': {
      const dataset = CATEGORY_CONFIG[category].datasets[0]
      return {
        ...base, type, w: 170, h: 45,
        datasetId: dataset?.id ?? 'fee_items',
        columns: (dataset?.columns ?? []).map((column) => ({ ...column })),
        style: { headerBg: '#173A5E', headerColor: '#FFFFFF', fontSize: 10 },
      }
    }
    case 'totals':
      return {
        ...base, type, w: 70, h: 26, datasetId: CATEGORY_CONFIG[category].datasets[0]?.id ?? 'fee_items',
        rows: [
          { id: 'r1', label: 'Subtotal', kind: 'formula', formula: '=SUM_TABLE("Amount")' },
          { id: 'r2', label: 'Grand total', kind: 'formula', formula: '=[Subtotal]', emphasize: true },
        ],
      }
    case 'shape': return { ...base, type, w: 60, h: 12, shape: 'rect', fill: '#E8EEF5' }
    case 'divider': return { ...base, type, w: 80, h: 1, stroke: '#5B6675' }
    case 'signature': return { ...base, type, w: 48, h: 12, label: 'Authorised signature' }
    case 'qr': return { ...base, type, w: 22, h: 22, encode: 'verify-url' }
  }
}
```

`studio/snap.ts`:

```typescript
export interface Rect { x: number; y: number; w: number; h: number }
export interface SnapGuide { orientation: 'v' | 'h'; positionMm: number }
export interface SnapResult { x: number; y: number; guides: SnapGuide[] }

/** Snap a moving rect's edges/centres to page margins, page centre and sibling edges. */
export function computeSnap(
  moving: Rect,
  siblings: Rect[],
  page: { w: number; h: number; margin: number },
  tolerance = 1.5,
): SnapResult {
  const verticalTargets = [page.margin, page.w / 2, page.w - page.margin]
  const horizontalTargets = [page.margin, page.h / 2, page.h - page.margin]
  for (const sibling of siblings) {
    verticalTargets.push(sibling.x, sibling.x + sibling.w / 2, sibling.x + sibling.w)
    horizontalTargets.push(sibling.y, sibling.y + sibling.h / 2, sibling.y + sibling.h)
  }

  const snapAxis = (position: number, size: number, targets: number[]) => {
    const edges = [
      { offset: 0, value: position },
      { offset: size / 2, value: position + size / 2 },
      { offset: size, value: position + size },
    ]
    for (const target of targets) {
      for (const edge of edges) {
        if (Math.abs(edge.value - target) <= tolerance) {
          return { snapped: target - edge.offset, guide: target }
        }
      }
    }
    return null
  }

  const guides: SnapGuide[] = []
  let { x, y } = moving
  const vertical = snapAxis(moving.x, moving.w, verticalTargets)
  if (vertical) { x = vertical.snapped; guides.push({ orientation: 'v', positionMm: vertical.guide }) }
  const horizontal = snapAxis(moving.y, moving.h, horizontalTargets)
  if (horizontal) { y = horizontal.snapped; guides.push({ orientation: 'h', positionMm: horizontal.guide }) }
  return { x, y, guides }
}
```

`studio/useEditorState.ts`:

```typescript
import { PAGE_SIZES_MM, type CanvasElement, type LayoutV2, type LayoutWatermark, type LayoutZones } from '../engine/types'
import { makeElementId } from './elementDefaults'

export interface EditorState {
  layout: LayoutV2
  activePage: number
  selectedId: string | null
  sampleMode: boolean
  zoom: number
  history: string[]
  historyIndex: number
  dirty: boolean
}

export const initialEditorState: EditorState = {
  layout: { version: 2, page: { sizeId: 'A4P', marginMm: 10, background: '#FFFFFF' }, zones: { headerMm: 0, footerMm: 0, repeatHeader: false, repeatFooter: false, hideHeaderOnFirstPage: false }, watermark: { enabled: false, mode: 'text', text: 'SAMPLE', imageUrl: '', opacity: 0.07 }, pages: [{ elements: [] }] },
  activePage: 0,
  selectedId: null,
  sampleMode: true,
  zoom: 1,
  history: [],
  historyIndex: -1,
  dirty: false,
}

export type EditorAction =
  | { type: 'load'; layout: LayoutV2 }
  | { type: 'select'; id: string | null }
  | { type: 'setActivePage'; page: number }
  | { type: 'addElement'; element: CanvasElement }
  | { type: 'updateElement'; id: string; patch: Partial<CanvasElement> }
  | { type: 'moveElement'; id: string; x: number; y: number }
  | { type: 'resizeElement'; id: string; w: number; h: number }
  | { type: 'commit' }
  | { type: 'deleteElement'; id: string }
  | { type: 'duplicateElement'; id: string }
  | { type: 'setPage'; patch: Partial<LayoutV2['page']> }
  | { type: 'setZones'; patch: Partial<LayoutZones> }
  | { type: 'setWatermark'; patch: Partial<LayoutWatermark> }
  | { type: 'undo' } | { type: 'redo' }
  | { type: 'setZoom'; zoom: number }
  | { type: 'setSampleMode'; on: boolean }
  | { type: 'markSaved' }

const MIN_W = 4
const MIN_H = 1
const HISTORY_LIMIT = 100

function clampElement<T extends CanvasElement>(element: T, layout: LayoutV2): T {
  const { w: pageW, h: pageH } = PAGE_SIZES_MM[layout.page.sizeId]
  const w = Math.min(Math.max(element.w, MIN_W), pageW)
  const h = Math.min(Math.max(element.h, MIN_H), pageH)
  return {
    ...element, w, h,
    x: Math.min(Math.max(element.x, 0), pageW - w),
    y: Math.min(Math.max(element.y, 0), pageH - h),
  }
}

function mapElements(layout: LayoutV2, page: number, fn: (elements: CanvasElement[]) => CanvasElement[]): LayoutV2 {
  return {
    ...layout,
    pages: layout.pages.map((entry, index) => (index === page ? { elements: fn(entry.elements) } : entry)),
  }
}

function pushHistory(state: EditorState, layout: LayoutV2): EditorState {
  const snapshot = JSON.stringify(layout)
  const history = [...state.history.slice(0, state.historyIndex + 1), snapshot].slice(-HISTORY_LIMIT)
  return { ...state, layout, history, historyIndex: history.length - 1, dirty: true }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load': {
      const snapshot = JSON.stringify(action.layout)
      return { ...initialEditorState, layout: action.layout, history: [snapshot], historyIndex: 0, sampleMode: state.sampleMode, zoom: state.zoom }
    }
    case 'select': return { ...state, selectedId: action.id }
    case 'setActivePage': return { ...state, activePage: action.page, selectedId: null }
    case 'addElement': {
      if (action.element.type === 'table'
        && state.layout.pages.some((page) => page.elements.some((element) => element.type === 'table'))) {
        return state
      }
      const element = clampElement(action.element, state.layout)
      const layout = mapElements(state.layout, state.activePage, (elements) => [...elements, element])
      return { ...pushHistory(state, layout), selectedId: element.id }
    }
    case 'updateElement': {
      const layout = mapElements(state.layout, state.activePage, (elements) =>
        elements.map((element) => (element.id === action.id
          ? clampElement({ ...element, ...action.patch, id: element.id, type: element.type } as CanvasElement, state.layout)
          : element)))
      return pushHistory(state, layout)
    }
    case 'moveElement': {
      const layout = mapElements(state.layout, state.activePage, (elements) =>
        elements.map((element) => (element.id === action.id
          ? clampElement({ ...element, x: action.x, y: action.y }, state.layout)
          : element)))
      return { ...state, layout, dirty: true }
    }
    case 'resizeElement': {
      const layout = mapElements(state.layout, state.activePage, (elements) =>
        elements.map((element) => (element.id === action.id
          ? clampElement({ ...element, w: action.w, h: action.h }, state.layout)
          : element)))
      return { ...state, layout, dirty: true }
    }
    case 'commit': return pushHistory(state, state.layout)
    case 'deleteElement': {
      const layout = mapElements(state.layout, state.activePage, (elements) =>
        elements.filter((element) => element.id !== action.id))
      return { ...pushHistory(state, layout), selectedId: state.selectedId === action.id ? null : state.selectedId }
    }
    case 'duplicateElement': {
      const source = state.layout.pages[state.activePage].elements.find((element) => element.id === action.id)
      if (!source || source.type === 'table') return state
      const copy = clampElement({ ...JSON.parse(JSON.stringify(source)), id: makeElementId(), x: source.x + 4, y: source.y + 4 }, state.layout)
      const layout = mapElements(state.layout, state.activePage, (elements) => [...elements, copy])
      return { ...pushHistory(state, layout), selectedId: copy.id }
    }
    case 'setPage': return pushHistory(state, { ...state.layout, page: { ...state.layout.page, ...action.patch } })
    case 'setZones': return pushHistory(state, { ...state.layout, zones: { ...state.layout.zones, ...action.patch } })
    case 'setWatermark': return pushHistory(state, { ...state.layout, watermark: { ...state.layout.watermark, ...action.patch } })
    case 'undo': {
      if (state.historyIndex <= 0) return state
      const index = state.historyIndex - 1
      return { ...state, layout: JSON.parse(state.history[index]) as LayoutV2, historyIndex: index, selectedId: null, dirty: true }
    }
    case 'redo': {
      if (state.historyIndex >= state.history.length - 1) return state
      const index = state.historyIndex + 1
      return { ...state, layout: JSON.parse(state.history[index]) as LayoutV2, historyIndex: index, selectedId: null, dirty: true }
    }
    case 'setZoom': return { ...state, zoom: Math.min(Math.max(action.zoom, 0.4), 2) }
    case 'setSampleMode': return { ...state, sampleMode: action.on }
    case 'markSaved': return { ...state, dirty: false }
  }
}
```

- [ ] **Step 4: Verify + commit**

Run: `cd apps/institute-admin-web && npx vitest run src/features/documents/studio && npm run typecheck`
Expected: 8 PASSED (5 reducer + 3 snap), typecheck clean.

```bash
git add apps/institute-admin-web/src/features/documents/studio/
git commit -m "feat(documents-web): editor reducer with history, clamping and snap math"
```

---

### Task 13: Canvas stage (drag, resize, drops, guides, zones, inline text edit)

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/studio/CanvasStage.tsx`
- Create: `apps/institute-admin-web/src/features/documents/studio.css`

No unit tests for this task (interaction-heavy DOM component; logic lives in the already-tested reducer/snap/renderHtml modules). Verification is typecheck + the Task 17 smoke test + the full-suite run.

- [ ] **Step 1: Create `studio/CanvasStage.tsx`**

```tsx
import {
  useRef, useState,
  type Dispatch, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import { renderElementInner, type RenderContext } from '../engine/renderHtml'
import { PAGE_SIZES_MM, type CanvasElement, type DocumentData } from '../engine/types'
import { defaultElement } from './elementDefaults'
import { computeSnap, type SnapGuide } from './snap'
import type { EditorAction, EditorState } from './useEditorState'

export const PX_PER_MM = 3.7795

const TYPE_LABELS: Record<CanvasElement['type'], string> = {
  text: 'Text', image: 'Image', table: 'Table', totals: 'Totals',
  shape: 'Shape', divider: 'Divider', signature: 'Signature', qr: 'QR code',
}

interface CanvasStageProps {
  state: EditorState
  dispatch: Dispatch<EditorAction>
  data: DocumentData
}

export function CanvasStage({ state, dispatch, data }: CanvasStageProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const { layout, activePage, selectedId, zoom, sampleMode } = state
  const size = PAGE_SIZES_MM[layout.page.sizeId]
  const scale = PX_PER_MM * zoom
  const elements = layout.pages[activePage].elements
  const table = layout.pages.flatMap((page) => page.elements).find((element) => element.type === 'table')
  const ctx: RenderContext = {
    data, sampleMode, highlightTokens: true,
    table: table && table.type === 'table' ? { columns: table.columns, rows: data.rows } : null,
  }

  const toMm = (clientX: number, clientY: number) => {
    const rect = pageRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  const startDrag = (event: ReactPointerEvent, element: CanvasElement, mode: 'move' | 'resize') => {
    if (element.locked && mode === 'move') return
    event.preventDefault()
    event.stopPropagation()
    dispatch({ type: 'select', id: element.id })
    const startPointer = { x: event.clientX, y: event.clientY }
    const origin = { x: element.x, y: element.y, w: element.w, h: element.h }
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)

    const onMove = (move: globalThis.PointerEvent) => {
      const dx = (move.clientX - startPointer.x) / scale
      const dy = (move.clientY - startPointer.y) / scale
      if (mode === 'move') {
        const siblings = elements.filter((sibling) => sibling.id !== element.id)
        const snapped = computeSnap(
          { x: origin.x + dx, y: origin.y + dy, w: element.w, h: element.h },
          siblings,
          { w: size.w, h: size.h, margin: layout.page.marginMm },
        )
        setGuides(snapped.guides)
        dispatch({ type: 'moveElement', id: element.id, x: snapped.x, y: snapped.y })
      } else {
        dispatch({ type: 'resizeElement', id: element.id, w: origin.w + dx, h: origin.h + dy })
      }
    }
    const onUp = () => {
      target.releasePointerCapture(event.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setGuides([])
      dispatch({ type: 'commit' })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    const point = toMm(event.clientX, event.clientY)
    const token = event.dataTransfer.getData('application/x-doc-token')
    if (token) {
      const hit = elements.find((element) =>
        element.type === 'text'
        && point.x >= element.x && point.x <= element.x + element.w
        && point.y >= element.y && point.y <= element.y + element.h)
      if (hit && hit.type === 'text') {
        dispatch({ type: 'updateElement', id: hit.id, patch: { content: `${hit.content} {{${token}}}`.trim() } })
      } else {
        const element = defaultElement('text', data.category)
        if (element.type === 'text') element.content = `{{${token}}}`
        dispatch({ type: 'addElement', element: { ...element, x: point.x, y: point.y, w: 50, h: 8 } })
      }
      return
    }
    const type = event.dataTransfer.getData('application/x-doc-element')
    if (type) {
      const element = defaultElement(type as CanvasElement['type'], data.category)
      dispatch({ type: 'addElement', element: { ...element, x: point.x, y: point.y } })
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!selectedId || editingId) return
    const selected = elements.find((element) => element.id === selectedId)
    if (!selected) return
    const step = event.shiftKey ? 5 : 1
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      dispatch({ type: 'deleteElement', id: selectedId })
    } else if (event.key === 'Escape') {
      dispatch({ type: 'select', id: null })
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      dispatch({ type: 'updateElement', id: selectedId, patch: { x: selected.x + dx, y: selected.y + dy } })
    }
  }

  // Zone tag mirroring the reference: selected header/footer-band elements announce repetition.
  const zoneTagFor = (element: CanvasElement): string | null => {
    if (layout.zones.headerMm > 0 && element.y < layout.zones.headerMm) {
      return layout.zones.repeatHeader ? '↑ header · every page' : '↑ header'
    }
    if (layout.zones.footerMm > 0 && element.y + element.h > size.h - layout.zones.footerMm) {
      return layout.zones.repeatFooter ? '↓ footer · every page' : '↓ footer'
    }
    return null
  }

  const backgroundStyle = typeof layout.page.background === 'string'
    ? { background: layout.page.background }
    : { backgroundImage: `url(${layout.page.background.imageUrl})`, backgroundSize: 'cover' }

  return (
    <div className="stu-stage" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="stu-page-note">
        {layout.page.sizeId} · {size.w}×{size.h}mm
        {layout.pages.length > 1 && (
          <span className="stu-page-tabs">
            {layout.pages.map((_page, index) => (
              <button key={index} type="button" className={index === activePage ? 'is-active' : ''}
                onClick={() => dispatch({ type: 'setActivePage', page: index })}>
                {index === 0 ? 'Front' : 'Back'}
              </button>
            ))}
          </span>
        )}
      </div>
      <div
        ref={pageRef}
        className="stu-page"
        style={{ width: size.w * scale, height: size.h * scale, ...backgroundStyle }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        onPointerDown={(event) => { if (event.target === pageRef.current) dispatch({ type: 'select', id: null }) }}
      >
        {layout.watermark.enabled && (
          <div className="stu-watermark">
            {layout.watermark.mode === 'text'
              ? <span style={{ opacity: layout.watermark.opacity }}>{layout.watermark.text}</span>
              : layout.watermark.imageUrl && <img src={layout.watermark.imageUrl} style={{ opacity: layout.watermark.opacity * 4 }} alt="" />}
          </div>
        )}
        {layout.zones.headerMm > 0 && (
          <div className="stu-zone stu-zone--header" style={{ height: layout.zones.headerMm * scale }}>
            <span>Header{layout.zones.repeatHeader ? ' · repeats on every page' : ''}</span>
          </div>
        )}
        {layout.zones.footerMm > 0 && (
          <div className="stu-zone stu-zone--footer" style={{ height: layout.zones.footerMm * scale }}>
            <span>Footer{layout.zones.repeatFooter ? ' · repeats on every page' : ''}</span>
          </div>
        )}
        {guides.map((guide, index) => guide.orientation === 'v'
          ? <div key={index} className="stu-guide stu-guide--v" style={{ left: guide.positionMm * scale }} />
          : <div key={index} className="stu-guide stu-guide--h" style={{ top: guide.positionMm * scale }} />)}
        {elements.map((element) => (
          <div
            key={element.id}
            data-typelabel={TYPE_LABELS[element.type]}
            className={`stu-el${element.id === selectedId ? ' is-selected' : ''}${element.locked ? ' is-locked' : ''}`}
            style={{ left: element.x * scale, top: element.y * scale, width: element.w * scale, height: element.h * scale }}
            onPointerDown={(event) => startDrag(event, element, 'move')}
            onDoubleClick={() => { if (element.type === 'text' && !element.locked) setEditingId(element.id) }}
          >
            {editingId === element.id && element.type === 'text' ? (
              <textarea
                className="stu-inline-edit"
                autoFocus
                defaultValue={element.content}
                onBlur={(event) => {
                  dispatch({ type: 'updateElement', id: element.id, patch: { content: event.target.value } })
                  setEditingId(null)
                }}
              />
            ) : (
              <div
                className="stu-el-inner"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: element.w * PX_PER_MM, height: element.h * PX_PER_MM }}
                dangerouslySetInnerHTML={{ __html: renderElementInner(element, ctx) }}
              />
            )}
            {element.id === selectedId && zoneTagFor(element) && (
              <span className="stu-zonetag">{zoneTagFor(element)}</span>
            )}
            {element.id === selectedId && !element.locked && (
              <div className="stu-resize" onPointerDown={(event) => startDrag(event, element, 'resize')} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `studio.css`** (adapted from the reference prototype's palette; all `stu-` prefixed):

```css
.stu-root { display: flex; flex-direction: column; height: calc(100vh - 120px); background: #F3F5F8; border: 1px solid #E1E4EA; border-radius: 12px; overflow: hidden; }
.stu-topbar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: #fff; border-bottom: 1px solid #E1E4EA; font-size: 13px; flex: 0 0 auto; }
.stu-topbar .spacer { flex: 1; }
.stu-btn { border: 1px solid #E1E4EA; background: #fff; color: #16212E; padding: 6px 11px; border-radius: 8px; font-size: 12.5px; cursor: pointer; }
.stu-btn:hover { background: #EEF0F4; }
.stu-btn:disabled { opacity: .5; cursor: default; }
.stu-btn--primary { background: #173A5E; border-color: #173A5E; color: #fff; }
.stu-workspace { flex: 1; display: flex; min-height: 0; }
.stu-rail { width: 232px; flex: 0 0 auto; background: #fff; border-right: 1px solid #E1E4EA; overflow-y: auto; padding: 12px; }
.stu-rail h4 { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #5B6675; margin: 14px 2px 7px; }
.stu-rail h4:first-child { margin-top: 0; }
.stu-comp { display: flex; align-items: center; gap: 9px; padding: 8px 9px; border: 1px solid #E1E4EA; border-radius: 9px; margin-bottom: 6px; background: #fff; cursor: grab; font-size: 12.5px; font-weight: 600; }
.stu-comp:hover { border-color: #173A5E; }
.stu-comp.is-disabled { color: #9AA3AE; background: #F7F8FA; cursor: default; }
.stu-comp .ic { width: 24px; height: 24px; border-radius: 6px; background: #E8EEF5; color: #173A5E; display: flex; align-items: center; justify-content: center; font-size: 12px; }
.stu-search { width: 100%; padding: 6px 9px; border: 1px solid #E1E4EA; border-radius: 8px; font-size: 12px; margin-bottom: 8px; background: #F3F5F8; }
.stu-token { display: inline-flex; align-items: center; padding: 4px 8px; margin: 0 4px 4px 0; background: #FDF1E1; border: 1px solid #F0D9AF; color: #9A5B12; border-radius: 20px; font-size: 11px; font-weight: 600; cursor: grab; }
.stu-token-src { font-size: 10px; color: #5B6675; font-weight: 700; text-transform: uppercase; margin: 6px 0 4px; }
.stu-stage { flex: 1; overflow: auto; padding: 26px 16px; display: flex; flex-direction: column; align-items: center; outline: none; }
.stu-page-note { font-size: 11px; color: #5B6675; margin-bottom: 6px; display: flex; gap: 10px; align-items: center; }
.stu-page-tabs button { border: 1px solid #E1E4EA; background: #fff; padding: 2px 10px; font-size: 11px; cursor: pointer; }
.stu-page-tabs button.is-active { background: #E8EEF5; color: #173A5E; font-weight: 700; }
.stu-page { position: relative; background: #fff; box-shadow: 0 1px 2px rgba(22,33,46,.04), 0 12px 28px -12px rgba(22,33,46,.18); flex: 0 0 auto; }
.stu-zone { position: absolute; left: 0; right: 0; background: #F4EEFA; opacity: .55; pointer-events: none; }
.stu-zone--header { top: 0; border-bottom: 1.5px dashed #7C4EA6; }
.stu-zone--footer { bottom: 0; border-top: 1.5px dashed #7C4EA6; }
.stu-zone span { position: absolute; left: 6px; top: 3px; font-size: 9px; font-weight: 800; text-transform: uppercase; color: #7C4EA6; background: #fff; padding: 1px 5px; border-radius: 4px; border: 1px solid #7C4EA6; }
.stu-zone--footer span { top: auto; bottom: 3px; }
.stu-watermark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; overflow: hidden; }
.stu-watermark span { font-size: 64px; font-weight: 800; color: #173A5E; transform: rotate(-28deg); white-space: nowrap; }
.stu-watermark img { max-width: 60%; max-height: 60%; transform: rotate(-20deg); object-fit: contain; }
.stu-guide { position: absolute; background: #F43F5E; opacity: .75; z-index: 40; pointer-events: none; }
.stu-guide--v { top: 0; bottom: 0; width: 1px; }
.stu-guide--h { left: 0; right: 0; height: 1px; }
.stu-el { position: absolute; outline: 1px dashed transparent; cursor: grab; }
.stu-el:hover { outline-color: #B9C4D3; }
.stu-el.is-selected { outline: 1.5px solid #173A5E; z-index: 30; }
.stu-el.is-selected::before { content: attr(data-typelabel); position: absolute; top: -18px; left: -1px; background: #173A5E; color: #fff; font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px 4px 4px 0; }
.stu-el.is-locked { cursor: default; }
.stu-el-inner { pointer-events: none; overflow: hidden; }
.stu-resize { position: absolute; width: 10px; height: 10px; right: -5px; bottom: -5px; background: #fff; border: 1.5px solid #173A5E; border-radius: 2px; cursor: nwse-resize; z-index: 31; }
.stu-zonetag { position: absolute; top: -18px; right: -1px; background: #7C4EA6; color: #fff; font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 4px 4px 0 4px; white-space: nowrap; z-index: 32; }
.stu-inline-edit { position: absolute; inset: 0; border: 1px solid #173A5E; font: inherit; font-size: 12px; padding: 2px; resize: none; }
.stu-props { width: 288px; flex: 0 0 auto; background: #fff; border-left: 1px solid #E1E4EA; overflow-y: auto; }
.stu-ptabs { display: flex; border-bottom: 1px solid #E1E4EA; }
.stu-ptabs button { flex: 1; border: 0; background: none; padding: 11px 0; font-size: 12px; font-weight: 700; color: #5B6675; cursor: pointer; border-bottom: 2px solid transparent; }
.stu-ptabs button.is-active { color: #173A5E; border-color: #173A5E; }
.stu-pbody { padding: 14px; font-size: 12.5px; }
.stu-field { margin-bottom: 12px; }
.stu-field label { display: block; font-size: 10.5px; font-weight: 700; color: #5B6675; margin-bottom: 5px; text-transform: uppercase; letter-spacing: .03em; }
.stu-field input, .stu-field select, .stu-field textarea { width: 100%; border: 1px solid #E1E4EA; border-radius: 7px; padding: 6px 8px; font-size: 12.5px; font-family: inherit; }
.stu-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stu-row4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.stu-colcard { border: 1px solid #E1E4EA; border-radius: 8px; padding: 8px; margin-bottom: 7px; background: #F7F8FA; }
.stu-colcard .top { display: flex; gap: 6px; align-items: center; margin-bottom: 5px; }
.stu-colcard .top input { flex: 1; }
.stu-fx { display: flex; align-items: center; gap: 6px; }
.stu-fx .prefix { color: #1D6FA5; font-weight: 800; font-family: ui-monospace, monospace; font-size: 12px; }
.stu-fx input { flex: 1; font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; border-color: #1D6FA5; background: #EAF3FA; color: #1D6FA5; }
.stu-quickfx { display: flex; flex-wrap: wrap; gap: 5px; margin: 6px 0; }
.stu-quickfx button { font-size: 10.5px; padding: 3px 8px; border: 1px solid #1D6FA5; background: #EAF3FA; color: #1D6FA5; border-radius: 14px; cursor: pointer; font-weight: 600; }
.stu-addbtn { width: 100%; padding: 7px; border: 1.5px dashed #E1E4EA; background: none; border-radius: 8px; color: #5B6675; cursor: pointer; font-size: 12px; font-weight: 600; }
.stu-addbtn:hover { border-color: #173A5E; color: #173A5E; }
.stu-actions { display: flex; gap: 8px; margin-top: 14px; }
.stu-actions .stu-btn { flex: 1; }
.stu-danger { color: #C0392B; border-color: #F2D2CC; }
.stu-empty { color: #5B6675; line-height: 1.6; padding: 4px 2px; }
.stu-infobox { background: #E7F6EE; border: 1px solid #CFE8DA; color: #137A4B; border-radius: 8px; padding: 8px 9px; font-size: 11.5px; line-height: 1.5; margin-top: 8px; }
.stu-home-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.stu-home-card { border: 1px solid #E1E4EA; border-radius: 12px; background: #fff; padding: 16px; cursor: pointer; text-align: left; }
.stu-home-card:hover { border-color: #173A5E; box-shadow: 0 2px 10px rgba(23,58,94,.08); }
.stu-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.stu-gallery-card { border: 1px solid #E1E4EA; border-radius: 10px; background: #fff; padding: 12px; cursor: pointer; text-align: left; }
.stu-gallery-card.is-default { border-color: #173A5E; }
```

- [ ] **Step 3: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck` — clean.

```bash
git add apps/institute-admin-web/src/features/documents/studio/CanvasStage.tsx apps/institute-admin-web/src/features/documents/studio.css
git commit -m "feat(documents-web): canvas stage with drag, resize, snap guides, zones and inline text edit"
```

---

### Task 14: Component rail (palette + merge fields)

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/studio/ComponentRail.tsx`

- [ ] **Step 1: Create `studio/ComponentRail.tsx`**

```tsx
import { useState, type Dispatch } from 'react'
import { CATEGORY_CONFIG } from '../engine/datasets'
import type { DocumentCategory, ElementType } from '../engine/types'
import { defaultElement } from './elementDefaults'
import type { EditorAction, EditorState } from './useEditorState'

const PALETTE: { type: ElementType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'image', label: 'Logo / image', icon: '▣' },
  { type: 'table', label: 'Table', icon: '▤' },
  { type: 'totals', label: 'Totals', icon: 'Σ' },
  { type: 'shape', label: 'Shape / band', icon: '▭' },
  { type: 'divider', label: 'Divider line', icon: '—' },
  { type: 'signature', label: 'Signature', icon: '✒' },
  { type: 'qr', label: 'QR code', icon: '▦' },
]

interface ComponentRailProps {
  category: DocumentCategory
  state: EditorState
  dispatch: Dispatch<EditorAction>
}

export function ComponentRail({ category, state, dispatch }: ComponentRailProps) {
  const [search, setSearch] = useState('')
  const hasTable = state.layout.pages.some((page) => page.elements.some((element) => element.type === 'table'))
  const selected = state.layout.pages[state.activePage].elements.find((element) => element.id === state.selectedId)

  const addToken = (token: string) => {
    if (selected?.type === 'text') {
      dispatch({ type: 'updateElement', id: selected.id, patch: { content: `${selected.content} {{${token}}}`.trim() } })
      return
    }
    const element = defaultElement('text', category)
    if (element.type === 'text') element.content = `{{${token}}}`
    dispatch({ type: 'addElement', element: { ...element, w: 50, h: 8 } })
  }

  return (
    <div className="stu-rail">
      <h4>Drag onto page</h4>
      {PALETTE.map((item) => {
        const disabled = item.type === 'table' && (hasTable || !CATEGORY_CONFIG[category].datasets.length)
        return (
          <div
            key={item.type}
            className={`stu-comp${disabled ? ' is-disabled' : ''}`}
            draggable={!disabled}
            onDragStart={(event) => event.dataTransfer.setData('application/x-doc-element', item.type)}
            onClick={() => { if (!disabled) dispatch({ type: 'addElement', element: defaultElement(item.type, category) }) }}
          >
            <span className="ic">{item.icon}</span>
            <span>{item.label}</span>
            {item.type === 'table' && hasTable && <span style={{ marginLeft: 'auto', fontSize: 10 }}>added ✓</span>}
          </div>
        )
      })}
      <h4>Merge fields</h4>
      <input
        className="stu-search"
        placeholder="Search fields…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {CATEGORY_CONFIG[category].tokenGroups.map((group) => {
        const fields = group.fields.filter((field) => field.toLowerCase().includes(search.toLowerCase()))
        if (!fields.length) return null
        return (
          <div key={group.source}>
            <div className="stu-token-src">{group.source}</div>
            {fields.map((field) => (
              <span
                key={field}
                className="stu-token"
                draggable
                onDragStart={(event) => event.dataTransfer.setData('application/x-doc-token', field)}
                onClick={() => addToken(field)}
              >
                {field}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck` — clean.

```bash
git add apps/institute-admin-web/src/features/documents/studio/ComponentRail.tsx
git commit -m "feat(documents-web): component palette and merge-field rail"
```

---

### Task 15: Properties panel (Element + Page tabs)

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/studio/PropertiesPanel.tsx`

- [ ] **Step 1: Create `studio/PropertiesPanel.tsx`**

```tsx
import { useState, type Dispatch } from 'react'
import { CATEGORY_CONFIG } from '../engine/datasets'
import { computeTableRows } from '../engine/formula'
import type {
  CanvasElement, DocumentCategory, DocumentData, PageSizeId,
  TableColumn, TableElement, TotalsElement, TotalsRow,
} from '../engine/types'
import type { EditorAction, EditorState } from './useEditorState'

const SWATCHES = ['#16212E', '#173A5E', '#9A5B12', '#C0392B', '#137A4B', '#7C4EA6', '#E8EEF5', '#FFFFFF']

interface PropertiesPanelProps {
  category: DocumentCategory
  state: EditorState
  dispatch: Dispatch<EditorAction>
  data: DocumentData
}

export function PropertiesPanel({ category, state, dispatch, data }: PropertiesPanelProps) {
  const [tab, setTab] = useState<'element' | 'page'>('element')
  const selected = state.layout.pages[state.activePage].elements.find(
    (element) => element.id === state.selectedId,
  )

  return (
    <div className="stu-props">
      <div className="stu-ptabs">
        <button type="button" className={tab === 'element' ? 'is-active' : ''} onClick={() => setTab('element')}>Element</button>
        <button type="button" className={tab === 'page' ? 'is-active' : ''} onClick={() => setTab('page')}>Page</button>
      </div>
      <div className="stu-pbody">
        {tab === 'element'
          ? (selected
            ? <ElementForm element={selected} dispatch={dispatch} data={data} />
            : <p className="stu-empty"><b>Nothing selected.</b><br />Click a block on the page, or drag a component from the left rail.</p>)
          : <PageForm category={category} state={state} dispatch={dispatch} />}
      </div>
    </div>
  )
}

function ElementForm({ element, dispatch, data }: { element: CanvasElement; dispatch: Dispatch<EditorAction>; data: DocumentData }) {
  const patch = (values: Partial<CanvasElement>) =>
    dispatch({ type: 'updateElement', id: element.id, patch: values })

  return (
    <div>
      {element.type === 'text' && (
        <>
          <div className="stu-field">
            <label>Content — use {'{{token}}'} for merge fields</label>
            <textarea rows={3} value={element.content} onChange={(event) => patch({ content: event.target.value })} />
          </div>
          <div className="stu-row2">
            <div className="stu-field">
              <label>Font size</label>
              <input type="number" min={5} max={72} value={element.style.fontSize}
                onChange={(event) => patch({ style: { ...element.style, fontSize: Number(event.target.value) || 12 } })} />
            </div>
            <div className="stu-field">
              <label>Align</label>
              <select value={element.style.align}
                onChange={(event) => patch({ style: { ...element.style, align: event.target.value as 'left' | 'center' | 'right' } })}>
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
              </select>
            </div>
          </div>
          <div className="stu-row2">
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={element.style.bold}
              onChange={(event) => patch({ style: { ...element.style, bold: event.target.checked } })} /> Bold</label>
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={element.style.italic}
              onChange={(event) => patch({ style: { ...element.style, italic: event.target.checked } })} /> Italic</label>
          </div>
          <ColorField label="Colour" value={element.style.color}
            onPick={(color) => patch({ style: { ...element.style, color } })} />
        </>
      )}

      {element.type === 'image' && (
        <>
          <div className="stu-infobox">Symbolic sources pull live from the ERP: <b>institute-logo</b> (Branding), <b>student-photo</b>, <b>staff-photo</b>. Or paste an image URL.</div>
          <div className="stu-field" style={{ marginTop: 10 }}>
            <label>Source</label>
            <input value={element.src} onChange={(event) => patch({ src: event.target.value })} />
          </div>
          <div className="stu-field">
            <label>Fallback initials</label>
            <input value={element.fallbackInitials} maxLength={3}
              onChange={(event) => patch({ fallbackInitials: event.target.value })} />
          </div>
        </>
      )}

      {element.type === 'table' && <TableForm element={element} patch={patch} data={data} />}
      {element.type === 'totals' && <TotalsForm element={element} patch={patch} />}

      {element.type === 'shape' && (
        <ColorField label="Fill" value={element.fill} onPick={(fill) => patch({ fill })} />
      )}
      {element.type === 'divider' && (
        <ColorField label="Line colour" value={element.stroke} onPick={(stroke) => patch({ stroke })} />
      )}
      {element.type === 'signature' && (
        <div className="stu-field"><label>Label</label>
          <input value={element.label} onChange={(event) => patch({ label: event.target.value })} /></div>
      )}
      {element.type === 'qr' && (
        <>
          <div className="stu-infobox">The verify URL embeds the document's data — scanning renders it even if the database is unreachable. "Document number" encodes just the number for internal scanning.</div>
          <div className="stu-field" style={{ marginTop: 10 }}>
            <label>Encodes</label>
            <select value={element.encode} onChange={(event) => patch({ encode: event.target.value as 'verify-url' | 'document-number' })}>
              <option value="verify-url">Verify URL (self-contained data)</option>
              <option value="document-number">Document number only</option>
            </select>
          </div>
        </>
      )}

      <div className="stu-field">
        <label>Position & size (mm)</label>
        <div className="stu-row4">
          {(['x', 'y', 'w', 'h'] as const).map((key) => (
            <input key={key} type="number" value={Math.round(element[key] * 10) / 10} aria-label={key.toUpperCase()}
              onChange={(event) => patch({ [key]: Number(event.target.value) || 0 })} />
          ))}
        </div>
      </div>
      <label style={{ fontSize: 12 }}>
        <input type="checkbox" checked={Boolean(element.locked)} onChange={(event) => patch({ locked: event.target.checked })} /> Lock element
      </label>
      <div className="stu-actions">
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'duplicateElement', id: element.id })} disabled={element.type === 'table'}>Duplicate</button>
        <button type="button" className="stu-btn stu-danger" onClick={() => dispatch({ type: 'deleteElement', id: element.id })}>Delete</button>
      </div>
    </div>
  )
}

function TableForm({ element, patch, data }: { element: TableElement; patch: (values: Partial<CanvasElement>) => void; data: DocumentData }) {
  const setColumns = (columns: TableColumn[]) => patch({ columns })
  const previewRows = computeTableRows(element.columns, data.rows)
  const quickFormulas: [string, string][] = element.datasetId === 'marks'
    ? [['Grade', '=IF([Marks]>=91,"A1",IF([Marks]>=81,"A2","B1"))'], ['Rank', '=RANK([Marks])'], ['Percentile', '=PERCENTILE([Marks])']]
    : [['Amount', '=[Qty]*[Rate]'], ['Amount w/ tax', '=[Qty]*[Rate]*1.18']]

  return (
    <>
      <div className="stu-infobox" style={{ marginBottom: 10 }}>
        Formulas work like a spreadsheet — reference columns as <b>[Column name]</b>; use SUM, IF, RANK, PERCENTILE, AVG, ROUND.
      </div>
      <div className="stu-field"><label>Columns</label></div>
      {element.columns.map((column, index) => (
        <div className="stu-colcard" key={column.id}>
          <div className="top">
            <input value={column.label} onChange={(event) =>
              setColumns(element.columns.map((candidate, position) => position === index ? { ...candidate, label: event.target.value } : candidate))} />
            <select value={column.type} onChange={(event) =>
              setColumns(element.columns.map((candidate, position) => position === index
                ? { ...candidate, type: event.target.value as 'data' | 'formula', formula: event.target.value === 'formula' ? (candidate.formula ?? '=0') : candidate.formula }
                : candidate))}>
              <option value="data">Data</option><option value="formula">Formula ƒx</option>
            </select>
            <button type="button" className="stu-btn stu-danger" style={{ padding: '2px 8px' }} onClick={() =>
              setColumns(element.columns.filter((_candidate, position) => position !== index))}>✕</button>
          </div>
          {column.type === 'formula' && (
            <>
              <div className="stu-fx">
                <span className="prefix">ƒx =</span>
                <input value={(column.formula ?? '').replace(/^=/, '')} placeholder="[Qty]*[Rate]" onChange={(event) =>
                  setColumns(element.columns.map((candidate, position) => position === index ? { ...candidate, formula: `=${event.target.value}` } : candidate))} />
              </div>
              <div style={{ fontSize: 10.5, color: '#5B6675', marginTop: 4 }}>
                Preview (row 1): <b style={{ color: '#1D6FA5' }}>{String(previewRows[0]?.[column.id] ?? '—')}</b>
              </div>
            </>
          )}
        </div>
      ))}
      <div className="stu-quickfx">
        {quickFormulas.map(([label, formula]) => (
          <button key={label} type="button" onClick={() =>
            setColumns([...element.columns, { id: `c-${Math.random().toString(36).slice(2, 8)}`, label, type: 'formula', formula, widthPct: 14, align: 'center' }])}>
            + {label}
          </button>
        ))}
      </div>
      <button type="button" className="stu-addbtn" onClick={() =>
        setColumns([...element.columns, { id: `c-${Math.random().toString(36).slice(2, 8)}`, label: 'New column', type: 'data', dtype: 'text', widthPct: 16, align: 'left' }])}>
        + Add column
      </button>
    </>
  )
}

function TotalsForm({ element, patch }: { element: TotalsElement; patch: (values: Partial<CanvasElement>) => void }) {
  const setRows = (rows: TotalsRow[]) => patch({ rows })
  return (
    <>
      <div className="stu-infobox" style={{ marginBottom: 10 }}>
        Rows can pull from the table with <b>SUM_TABLE("Column")</b> or reference other rows as <b>[Row label]</b>.
      </div>
      {element.rows.map((row, index) => (
        <div className="stu-colcard" key={row.id}>
          <div className="top">
            <input value={row.label} onChange={(event) =>
              setRows(element.rows.map((candidate, position) => position === index ? { ...candidate, label: event.target.value } : candidate))} />
            <select value={row.kind} onChange={(event) =>
              setRows(element.rows.map((candidate, position) => position === index
                ? { ...candidate, kind: event.target.value as 'value' | 'formula', formula: event.target.value === 'formula' ? (candidate.formula ?? '=0') : candidate.formula }
                : candidate))}>
              <option value="value">Fixed value</option><option value="formula">Formula ƒx</option>
            </select>
            <button type="button" className="stu-btn stu-danger" style={{ padding: '2px 8px' }} onClick={() =>
              setRows(element.rows.filter((_candidate, position) => position !== index))}>✕</button>
          </div>
          {row.kind === 'value' ? (
            <input type="number" value={row.value ?? 0} onChange={(event) =>
              setRows(element.rows.map((candidate, position) => position === index ? { ...candidate, value: Number(event.target.value) || 0 } : candidate))} />
          ) : (
            <div className="stu-fx">
              <span className="prefix">ƒx =</span>
              <input value={(row.formula ?? '').replace(/^=/, '')} placeholder='SUM_TABLE("Amount")' onChange={(event) =>
                setRows(element.rows.map((candidate, position) => position === index ? { ...candidate, formula: `=${event.target.value}` } : candidate))} />
            </div>
          )}
          <label style={{ fontSize: 11, display: 'block', marginTop: 5 }}>
            <input type="checkbox" checked={Boolean(row.emphasize)} onChange={(event) =>
              setRows(element.rows.map((candidate, position) => position === index ? { ...candidate, emphasize: event.target.checked } : candidate))} /> Emphasize (grand total)
          </label>
        </div>
      ))}
      <button type="button" className="stu-addbtn" onClick={() =>
        setRows([...element.rows, { id: `r-${Math.random().toString(36).slice(2, 8)}`, label: 'New row', kind: 'value', value: 0 }])}>
        + Add row
      </button>
    </>
  )
}

function PageForm({ category, state, dispatch }: { category: DocumentCategory; state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const { layout } = state
  const sizes = CATEGORY_CONFIG[category].pageSizeIds
  return (
    <div>
      <div className="stu-field">
        <label>Print area</label>
        <select value={layout.page.sizeId} onChange={(event) => dispatch({ type: 'setPage', patch: { sizeId: event.target.value as PageSizeId } })}>
          {sizes.map((sizeId) => <option key={sizeId} value={sizeId}>{sizeId}</option>)}
        </select>
      </div>
      <div className="stu-row2">
        <div className="stu-field"><label>Header height (mm)</label>
          <input type="number" min={0} max={100} value={layout.zones.headerMm}
            onChange={(event) => dispatch({ type: 'setZones', patch: { headerMm: Number(event.target.value) || 0 } })} /></div>
        <div className="stu-field"><label>Footer height (mm)</label>
          <input type="number" min={0} max={100} value={layout.zones.footerMm}
            onChange={(event) => dispatch({ type: 'setZones', patch: { footerMm: Number(event.target.value) || 0 } })} /></div>
      </div>
      {([['repeatHeader', 'Repeat header on every page'], ['repeatFooter', 'Repeat footer on every page'], ['hideHeaderOnFirstPage', 'Hide header on page 1']] as const).map(([key, label]) => (
        <label key={key} style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          <input type="checkbox" checked={layout.zones[key]}
            onChange={(event) => dispatch({ type: 'setZones', patch: { [key]: event.target.checked } })} /> {label}
        </label>
      ))}
      <div className="stu-field" style={{ marginTop: 12 }}>
        <label>Watermark</label>
        <label style={{ fontSize: 12, display: 'block' }}>
          <input type="checkbox" checked={layout.watermark.enabled}
            onChange={(event) => dispatch({ type: 'setWatermark', patch: { enabled: event.target.checked } })} /> Show watermark
        </label>
      </div>
      {layout.watermark.enabled && (
        <>
          <div className="stu-row2">
            <div className="stu-field"><label>Mode</label>
              <select value={layout.watermark.mode} onChange={(event) => dispatch({ type: 'setWatermark', patch: { mode: event.target.value as 'text' | 'image' } })}>
                <option value="text">Text</option><option value="image">Image URL</option>
              </select></div>
            <div className="stu-field"><label>Opacity %</label>
              <input type="number" min={2} max={35} value={Math.round(layout.watermark.opacity * 100)}
                onChange={(event) => dispatch({ type: 'setWatermark', patch: { opacity: (Number(event.target.value) || 7) / 100 } })} /></div>
          </div>
          {layout.watermark.mode === 'text' ? (
            <div className="stu-field"><label>Text</label>
              <input value={layout.watermark.text} onChange={(event) => dispatch({ type: 'setWatermark', patch: { text: event.target.value } })} /></div>
          ) : (
            <div className="stu-field"><label>Image URL</label>
              <input value={layout.watermark.imageUrl} onChange={(event) => dispatch({ type: 'setWatermark', patch: { imageUrl: event.target.value } })} /></div>
          )}
        </>
      )}
      <ColorField label="Page background" value={typeof layout.page.background === 'string' ? layout.page.background : '#FFFFFF'}
        onPick={(background) => dispatch({ type: 'setPage', patch: { background } })} />
    </div>
  )
}

function ColorField({ label, value, onPick }: { label: string; value: string; onPick: (color: string) => void }) {
  return (
    <div className="stu-field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {SWATCHES.map((swatch) => (
          <button key={swatch} type="button" aria-label={`Colour ${swatch}`} onClick={() => onPick(swatch)}
            style={{ width: 20, height: 20, borderRadius: 999, background: swatch, border: value === swatch ? '2px solid #173A5E' : '1px solid #E1E4EA', cursor: 'pointer' }} />
        ))}
        <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#16212E'}
          onChange={(event) => onPick(event.target.value)} style={{ width: 28, height: 24, padding: 0, border: 'none' }} aria-label={`${label} custom`} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck` — clean.

```bash
git add apps/institute-admin-web/src/features/documents/studio/PropertiesPanel.tsx
git commit -m "feat(documents-web): element and page property forms with formula editors"
```

---

### Task 16: Studio editor shell (toolbar, save, preview print)

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/studio/StudioEditor.tsx`

- [ ] **Step 1: Create `studio/StudioEditor.tsx`**

```tsx
import { useEffect, useMemo, useReducer, useState } from 'react'
import { AdminApiError } from '../../admin/admin.api'
import { fetchInstituteBranding } from '../../finance/finance.api'
import { patchDocumentTemplate, type DocumentTemplateRecord } from '../documents.api'
import { sampleDocumentData } from '../engine/datasets'
import { openPrintWindow, renderDocumentHtml } from '../engine/docRender'
import { prepareQrDataUrls } from '../engine/qrPayload'
import { CanvasStage } from './CanvasStage'
import { ComponentRail } from './ComponentRail'
import { PropertiesPanel } from './PropertiesPanel'
import { editorReducer, initialEditorState } from './useEditorState'

interface StudioEditorProps {
  accessToken: string
  template: DocumentTemplateRecord
  onBack: (saved: boolean) => void
}

export function StudioEditor({ accessToken, template, onBack }: StudioEditorProps) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [savedOnce, setSavedOnce] = useState(false)

  useEffect(() => { dispatch({ type: 'load', layout: template.layout }) }, [template])

  const [branding, setBranding] = useState<{ name: string; logoUrl: string | null } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchInstituteBranding(accessToken, controller.signal)
      .then((result) => setBranding({ name: result.name, logoUrl: result.logoUrl }))
      .catch(() => { /* sample values remain — branding is a nicety in the editor */ })
    return () => controller.abort()
  }, [accessToken])

  const data = useMemo(() => {
    const sample = sampleDocumentData(template.category)
    if (branding) {
      sample.tokens.school_name = branding.name
      sample.images['institute-logo'] = branding.logoUrl
    }
    return sample
  }, [template.category, branding])

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      await patchDocumentTemplate(accessToken, template.id, { layout: state.layout })
      dispatch({ type: 'markSaved' })
      setSavedOnce(true)
      setNotice('Saved.')
    } catch (cause) {
      setNotice(cause instanceof AdminApiError
        ? (cause.fieldErrors.layout?.[0] ?? cause.message)
        : 'The template could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const previewPrint = async () => {
    setNotice(null)
    try {
      const qrDataUrls = await prepareQrDataUrls(state.layout, data)
      const html = renderDocumentHtml({
        layout: state.layout,
        data: { ...data, qrDataUrls },
        mode: 'print',
        sampleMode: true,
      })
      if (!openPrintWindow(html)) setNotice('The print popup was blocked by the browser.')
    } catch {
      setNotice('Preview failed — check the template for invalid values.')
    }
  }

  const leave = () => {
    if (state.dirty && !window.confirm('You have unsaved changes. Leave anyway?')) return
    onBack(savedOnce)
  }

  return (
    <div className="stu-root">
      <div className="stu-topbar">
        <strong>{template.name}</strong>
        <span style={{ background: '#E8EEF5', color: '#173A5E', borderRadius: 99, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
          {template.category.replace('_', ' ')}
        </span>
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'undo' })} disabled={state.historyIndex <= 0}>↶ Undo</button>
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'redo' })} disabled={state.historyIndex >= state.history.length - 1}>↷ Redo</button>
        <label style={{ fontSize: 12 }}>
          <input type="checkbox" checked={state.sampleMode} onChange={(event) => dispatch({ type: 'setSampleMode', on: event.target.checked })} /> Sample data
        </label>
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'setZoom', zoom: state.zoom - 0.1 })}>−</button>
        <span style={{ fontSize: 12, minWidth: 38, textAlign: 'center' }}>{Math.round(state.zoom * 100)}%</span>
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'setZoom', zoom: state.zoom + 0.1 })}>+</button>
        <span className="spacer" />
        {notice && <span role="alert" style={{ fontSize: 12, color: notice === 'Saved.' ? '#137A4B' : '#C0392B' }}>{notice}</span>}
        <button type="button" className="stu-btn" onClick={() => void previewPrint()}>Preview print</button>
        <button type="button" className="stu-btn stu-btn--primary" disabled={saving || !state.dirty} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save template'}
        </button>
        <button type="button" className="stu-btn" onClick={leave}>Back</button>
      </div>
      <div className="stu-workspace">
        <ComponentRail category={template.category} state={state} dispatch={dispatch} />
        <CanvasStage state={state} dispatch={dispatch} data={data} />
        <PropertiesPanel category={template.category} state={state} dispatch={dispatch} data={data} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck` — clean.

```bash
git add apps/institute-admin-web/src/features/documents/studio/StudioEditor.tsx
git commit -m "feat(documents-web): studio editor shell with undo, zoom, sample toggle, save and preview print"
```

---

### Task 17: Template Studio page (home → gallery → editor) + navigation

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/TemplateStudioPage.tsx`
- Modify: `apps/institute-admin-web/src/adminNavigation.ts`
- Modify: `apps/institute-admin-web/src/App.tsx`
- Modify: `apps/institute-admin-web/src/App.test.tsx`

- [ ] **Step 1: Create `TemplateStudioPage.tsx`**

```tsx
import { useState } from 'react'
import { AdminApiError } from '../admin/admin.api'
import { StatePanel, useAbortableLoad } from '../finance/sections/shared'
import {
  createDocumentTemplate, deleteDocumentTemplate, listDocumentTemplates, patchDocumentTemplate,
  type DocumentTemplateRecord,
} from './documents.api'
import { CATEGORY_CONFIG } from './engine/datasets'
import { defaultLayout, type DocumentCategory } from './engine/types'
import { StudioEditor } from './studio/StudioEditor'
import './studio.css'

const CATEGORIES = Object.keys(CATEGORY_CONFIG) as DocumentCategory[]

export default function TemplateStudioPage({ accessToken }: { accessToken: string }) {
  const [category, setCategory] = useState<DocumentCategory | null>(null)
  const [editing, setEditing] = useState<DocumentTemplateRecord | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const templates = useAbortableLoad(
    (signal) => category ? listDocumentTemplates(accessToken, category, signal) : Promise.resolve(null),
    [accessToken, category, editing === null],
  )

  const run = (action: Promise<unknown>, then?: () => void) => {
    setBusy(true)
    setNotice(null)
    action
      .then(() => { templates.reload(); then?.() })
      .catch((cause: unknown) => setNotice(cause instanceof AdminApiError ? cause.message : 'The action failed.'))
      .finally(() => setBusy(false))
  }

  if (editing) {
    return <StudioEditor accessToken={accessToken} template={editing} onBack={() => setEditing(null)} />
  }

  if (!category) {
    return (
      <section>
        <h2>Template Studio</h2>
        <p style={{ color: '#5B6675', fontSize: 13 }}>Design and print every school document — drag-and-drop, merge fields, formulas, QR verification.</p>
        <div className="stu-home-grid">
          {CATEGORIES.map((candidate) => (
            <button key={candidate} type="button" className="stu-home-card" onClick={() => setCategory(candidate)}>
              <h3 style={{ margin: '0 0 6px' }}>{CATEGORY_CONFIG[candidate].label}</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#5B6675' }}>
                3 ready-made presets · custom designs · {CATEGORY_CONFIG[candidate].pageSizeIds[0]}
              </p>
            </button>
          ))}
        </div>
      </section>
    )
  }

  const items = templates.data?.items ?? []
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button type="button" className="stu-btn" onClick={() => setCategory(null)}>← All documents</button>
        <h2 style={{ margin: 0 }}>{CATEGORY_CONFIG[category].label} templates</h2>
        <span style={{ flex: 1 }} />
        <button type="button" className="stu-btn stu-btn--primary" disabled={busy} onClick={() =>
          run(
            createDocumentTemplate(accessToken, {
              name: 'Untitled template', category,
              layout: defaultLayout(CATEGORY_CONFIG[category].pageSizeIds[0], CATEGORY_CONFIG[category].pageCount),
            }).then((created) => setEditing(created)),
          )}>
          + New template
        </button>
      </div>
      {notice && <p role="alert" style={{ color: '#C0392B', fontSize: 12 }}>{notice}</p>}
      <StatePanel loading={templates.loading} error={templates.error} onRetry={templates.reload}
        empty={!items.length} emptyMessage="No templates yet — presets seed on first load.">
        <div className="stu-gallery">
          {items.map((template) => (
            <div key={template.id} className={`stu-gallery-card${template.isDefault ? ' is-default' : ''}`}>
              <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>{template.name}{template.isDefault ? ' ★' : ''}</h3>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: '#5B6675' }}>{template.layout.page.sizeId} · {template.layout.pages.length} page{template.layout.pages.length > 1 ? 's' : ''}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="stu-btn" onClick={() => setEditing(template)}>Open in editor</button>
                {!template.isDefault && (
                  <>
                    <button type="button" className="stu-btn" disabled={busy}
                      onClick={() => run(patchDocumentTemplate(accessToken, template.id, { isDefault: true }))}>Set default</button>
                    <button type="button" className="stu-btn stu-danger" disabled={busy}
                      onClick={() => { if (window.confirm(`Delete template "${template.name}"?`)) run(deleteDocumentTemplate(accessToken, template.id)) }}>Delete</button>
                  </>
                )}
                <button type="button" className="stu-btn" disabled={busy}
                  onClick={() => run(createDocumentTemplate(accessToken, { name: `Copy of ${template.name}`, category, layout: template.layout }))}>Duplicate</button>
              </div>
            </div>
          ))}
        </div>
      </StatePanel>
    </section>
  )
}
```

Note: `useAbortableLoad`'s loader here returns `Promise.resolve(null)` when no category is chosen — check `shared.tsx`'s hook signature; it accepts any `Promise<T>`, so this typechecks with `PageData<DocumentTemplateRecord> | null`.

- [ ] **Step 2: Navigation wiring**

1. `adminNavigation.ts`:
   - Extend the `AdminView` union with `'template-studio'`.
   - Add a top-level entry AFTER the Finance entry (matching the single-route pattern used by Finance/Audit Log):

```typescript
  { label: 'Template Studio', icon: 'reports', route: route('TS1', 'Template Studio', '/template-studio', 'Template Studio', 'template-studio') },
```

2. `App.tsx`:
   - Import: `import TemplateStudioPage from './features/documents/TemplateStudioPage'`
   - In the route-rendering block (alongside the FinanceSuitePage branches), add:

```tsx
      {route?.view === 'template-studio' && <TemplateStudioPage accessToken={session.accessToken} />}
```

- [ ] **Step 3: Smoke test**

In `App.test.tsx`, add near the finance-suite test (reuse its fetch-mock arrangement — read the existing test first and copy its setup pattern):

```tsx
  it('renders the template studio category home', async () => {
    window.history.pushState({}, '', '/template-studio')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Template Studio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fee invoice/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /id card/i })).toBeInTheDocument()
  })
```

- [ ] **Step 4: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck && npx vitest run src/App.test.tsx`
Expected: typecheck clean; the new test passes (pre-existing flaky failures in that file are known).

```bash
git add apps/institute-admin-web/src/features/documents/TemplateStudioPage.tsx apps/institute-admin-web/src/adminNavigation.ts apps/institute-admin-web/src/App.tsx apps/institute-admin-web/src/App.test.tsx
git commit -m "feat(documents-web): template studio home, gallery and top-level navigation"
```

---

### Task 18: Verify page (login-free, fragment-rendered)

**Files:**
- Create: `apps/institute-admin-web/src/features/documents/verify/VerifyPage.tsx`
- Modify: `apps/institute-admin-web/src/App.tsx`
- Modify: `apps/institute-admin-web/src/App.test.tsx`

- [ ] **Step 1: Create `verify/VerifyPage.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { decodePayload, type QrDocPayload } from '../engine/qrPayload'

/** Login-free document verification. Renders ONLY from the URL #fragment — the
 *  payload never reaches a server and no API/database is touched. */
export default function VerifyPage() {
  const [payload, setPayload] = useState<QrDocPayload | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const read = () => {
      const fragment = window.location.hash.replace(/^#/, '')
      if (!fragment) { setError(true); return }
      try {
        setPayload(decodePayload(fragment))
        setError(false)
      } catch {
        setError(true)
      }
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const formatAmount = (value: number) =>
    value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div style={{ minHeight: '100vh', background: '#F3F5F8', padding: 24, fontFamily: 'Inter, system-ui, sans-serif', color: '#16212E' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 12px 28px -12px rgba(22,33,46,.18)' }}>
        {error && (
          <>
            <h1 style={{ fontSize: 18, marginTop: 0 }}>Document verification</h1>
            <p style={{ color: '#C0392B' }}>This link doesn't contain readable document data. Scan the QR code on the printed document again.</p>
          </>
        )}
        {payload && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #173A5E', paddingBottom: 10 }}>
              <div>
                <h1 style={{ fontSize: 18, margin: 0, color: '#173A5E' }}>{payload.inst}</h1>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#5B6675' }}>{payload.cat.replace(/_/g, ' ')} · verified from QR data</p>
              </div>
              <strong>#{payload.num}</strong>
            </div>
            <dl style={{ fontSize: 13, lineHeight: 1.8 }}>
              {payload.student && <><dt style={{ float: 'left', color: '#5B6675', width: 90 }}>For</dt><dd style={{ margin: 0 }}>{payload.student}</dd></>}
              <dt style={{ float: 'left', color: '#5B6675', width: 90 }}>Date</dt><dd style={{ margin: 0 }}>{payload.date}</dd>
              {payload.status && <><dt style={{ float: 'left', color: '#5B6675', width: 90 }}>Status</dt><dd style={{ margin: 0 }}>{payload.status}</dd></>}
            </dl>
            {payload.items && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
                <thead><tr style={{ background: '#173A5E', color: '#fff' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Amount</th>
                </tr></thead>
                <tbody>
                  {payload.items.map(([label, amount], index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #EEF0F4' }}>
                      <td style={{ padding: '6px 8px' }}>{label}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatAmount(amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {payload.totals?.map(([label, amount], index) => (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 8, fontSize: 14 }}>
                <span>{label}</span><span>{formatAmount(amount)}</span>
              </div>
            ))}
            <button type="button" onClick={() => window.print()}
              style={{ marginTop: 20, padding: '8px 16px', background: '#173A5E', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer' }}>
              Print this record
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

(React renders all payload strings as text nodes — no HTML injection surface; no `dangerouslySetInnerHTML` here.)

- [ ] **Step 2: Bypass the auth gate**

In `App.tsx`'s `RoutedApp`, immediately BEFORE the `if (!session) {` block (currently ~line 257), add:

```tsx
  // Public QR verification — renders purely from the URL fragment, no session required.
  if (location.pathname === '/verify') return <VerifyPage />
```

with the import `import VerifyPage from './features/documents/verify/VerifyPage'` at the top. The early return must come BEFORE the session gate so scanned QR links work logged-out.

- [ ] **Step 3: Test**

Append to `App.test.tsx`:

```tsx
  it('renders the public verify page from a QR fragment without a session', async () => {
    const { encodePayload } = await import('./features/documents/engine/qrPayload')
    const fragment = encodePayload({
      v: 1, cat: 'FEE_INVOICE', num: 'INV-2026-0009', date: '2026-08-13',
      inst: 'Northstar Academy', student: 'Diya Sharma · Grade 8-A',
      items: [['Tuition fee', 15000]], totals: [['Grand total', 15000]], status: 'Pending',
    })
    localStorage.removeItem('campusone.session')
    window.history.pushState({}, '', `/verify#${fragment}`)
    render(<App />)

    expect(await screen.findByText('Northstar Academy')).toBeInTheDocument()
    expect(screen.getByText('#INV-2026-0009')).toBeInTheDocument()
    expect(screen.getByText('Tuition fee')).toBeInTheDocument()
  })
```

- [ ] **Step 4: Verify + commit**

Run: `cd apps/institute-admin-web && npm run typecheck && npx vitest run src/App.test.tsx`
Expected: typecheck clean, new test passes.

```bash
git add apps/institute-admin-web/src/features/documents/verify/ apps/institute-admin-web/src/App.tsx apps/institute-admin-web/src/App.test.tsx
git commit -m "feat(documents-web): login-free QR verify page rendering from the URL fragment"
```

---

### Task 19: Migrate finance printing to the new engine; delete the old renderer + editor; full verification

**Files:**
- Modify: `apps/institute-admin-web/src/features/finance/sections/InvoiceEditor.tsx`
- Modify: `apps/institute-admin-web/src/features/finance/sections/InvoicesSection.tsx`
- Modify: `apps/institute-admin-web/src/features/finance/sections/PaymentsSection.tsx`
- Modify: `apps/institute-admin-web/src/features/finance/sections/DuesSection.tsx`
- Modify: `apps/institute-admin-web/src/features/finance/FinanceSuitePage.tsx`
- Modify: `apps/institute-admin-web/src/features/finance/finance.api.ts`
- Modify: `apps/institute-admin-web/src/adminNavigation.ts`, `apps/institute-admin-web/src/App.tsx`
- Delete: `apps/institute-admin-web/src/features/finance/invoiceRender.ts`, `invoiceRender.test.ts`, `sections/TemplatesSection.tsx`

**Read each file fully before editing.** The exact current code may have drifted; the snippets below define the target shape — adapt mechanically, escalate on structural surprises.

- [ ] **Step 1: Shared print helper for finance sections**

The three finance call sites repeat the same flow, so add ONE helper to `apps/institute-admin-web/src/features/documents/engine/printDocument.ts` (new small file, part of this task):

```typescript
import type { Invoice, InstituteBranding, Payment } from '../../finance/finance.api'
import type { DocumentTemplateRecord } from '../documents.api'
import { invoiceToDocumentData } from './datasets'
import { openPrintWindow, renderDocumentHtml } from './docRender'
import { prepareQrDataUrls } from './qrPayload'
import { defaultLayout } from './types'

/** Print a real invoice/receipt through a document template. Returns false if the popup was blocked. */
export async function printFinanceDocument(options: {
  invoice: Invoice
  branding: InstituteBranding
  template: DocumentTemplateRecord | null
  payment?: Payment
}): Promise<boolean> {
  const { invoice, branding, template, payment } = options
  const layout = template?.layout ?? defaultLayout('A4P')
  const data = invoiceToDocumentData(invoice, branding, payment)
  data.qrDataUrls = await prepareQrDataUrls(layout, data)
  return openPrintWindow(renderDocumentHtml({ layout, data, mode: 'print' }))
}
```

- [ ] **Step 2: InvoicesSection**

1. Replace the imports of `buildDocumentModel/openPrintWindow/renderDocumentHtml/resolveLayout` from `../invoiceRender` and `listTemplates`/`TemplateRecord` from `../finance.api` with:

```typescript
import { listDocumentTemplates, type DocumentTemplateRecord } from '../../documents/documents.api'
import { printFinanceDocument } from '../../documents/engine/printDocument'
```

2. Replace the templates load with `useAbortableLoad((signal) => listDocumentTemplates(accessToken, 'FEE_INVOICE', signal), [accessToken])`.
3. Replace `templateFor` + `printInvoice` with:

```typescript
  const templateFor = (invoice: Invoice): DocumentTemplateRecord | null => {
    const all = templates.data?.items ?? []
    return all.find((candidate) => candidate.id === invoice.templateId)
      ?? all.find((candidate) => candidate.isDefault)
      ?? all[0] ?? null
  }

  const printInvoice = async (invoice: Invoice) => {
    if (!branding.data) return
    setBusyMessage(null)
    const printed = await printFinanceDocument({ invoice, branding: branding.data, template: templateFor(invoice) })
    if (!printed) setBusyMessage('The print popup was blocked by the browser.')
  }
```

(Adjust the Print button's onClick to `() => void printInvoice(invoice)`.)

- [ ] **Step 3: InvoiceEditor**

1. Same import swap as above (plus `renderDocumentHtml` + `invoiceToDocumentData` + `defaultLayout` for the live preview; drop everything from `../invoiceRender`).
2. Templates load: `listDocumentTemplates(accessToken, 'FEE_INVOICE', signal)`; the `template` variable becomes a `DocumentTemplateRecord | null` (`.isDefault` replaces the old `.isDefault` — same name; the `kind` filter argument is gone).
3. Replace the `previewHtml` memo body: build the draft `Invoice` exactly as today, then

```typescript
    const data = invoiceToDocumentData(draft, branding.data)
    return renderDocumentHtml({ layout: template?.layout ?? defaultLayout('A4P'), data, mode: 'preview' })
```

(The preview shows QR placeholders — real QR images are generated only at print time, which is async.)
4. Save & print path: replace the old render call with `await printFinanceDocument({ invoice: created, branding: branding.data, template })` (the containing function is already async).

- [ ] **Step 4: PaymentsSection**

Same import swap; receipt templates load becomes `listDocumentTemplates(accessToken, 'FEE_RECEIPT', signal)`; `printReceipt`'s render block becomes:

```typescript
      const invoice = await getInvoice(accessToken, payment.invoiceId)
      const receiptTemplate = templates.data?.items.find((candidate) => candidate.isDefault)
        ?? templates.data?.items[0] ?? null
      const printed = await printFinanceDocument({
        invoice, branding: branding.data, template: receiptTemplate, payment,
      })
      if (!printed) setNotice('The print popup was blocked by the browser.')
```

- [ ] **Step 5: DuesSection**

Swap `import { escapeHtml, openPrintWindow } from '../invoiceRender'` for:

```typescript
import { openPrintWindow } from '../../documents/engine/docRender'
import { escapeHtml } from '../../documents/engine/renderHtml'
```

(No other changes — its print flow builds its own standalone HTML.)

- [ ] **Step 6: Remove the finance Templates section**

1. `FinanceSuitePage.tsx`: delete the `TemplatesSection` import, its NAV entry (`{ section: 'templates', ... }`), and its render branch; remove `'templates'` from the `FinanceSection` union.
2. `App.tsx`: remove `FIT1: 'templates'` from `financeSectionByRoute`.
3. `adminNavigation.ts`: remove the `FIT1` route from `auxiliaryRoutes`; grep for `'Invoice Templates'` in `actionAliases`/`legacyPaths` and remove any references.
4. Delete files: `sections/TemplatesSection.tsx`, `invoiceRender.ts`, `invoiceRender.test.ts`.
5. `finance.api.ts`: remove `TemplateKind`, `TemplateColumn`, `TemplateLayout`, `TemplateRecord` types and the `listTemplates`/`createTemplate`/`patchTemplate`/`deleteTemplate` wrappers. KEEP `Invoice`, `InstituteBranding`, `Payment`, `fetchInstituteBranding`, `getInvoice` etc. — the documents engine imports them.
6. Grep to confirm zero dangling references:

```bash
grep -rn "invoiceRender\|TemplatesSection\|listTemplates\|TemplateRecord" apps/institute-admin-web/src --include=*.ts --include=*.tsx
```

Only `documents/` files (their own `DocumentTemplateRecord`/`listDocumentTemplates`) may match.

- [ ] **Step 7: Full verification**

```bash
cd apps/institute-admin-web && npm run typecheck && npm run lint; npx vitest run
cd ../../services/api && uv run pytest
```

Expected: typecheck clean; lint shows only the known pre-existing debt (report the count); vitest — all documents/finance tests pass, only the known flaky files fail; backend — all documents+finance tests pass, only the 6 known unrelated failures remain.

- [ ] **Step 8: Commit**

```bash
git add -A apps/institute-admin-web/src/features/finance/ apps/institute-admin-web/src/features/documents/ apps/institute-admin-web/src/adminNavigation.ts apps/institute-admin-web/src/App.tsx
git commit -m "refactor(finance-web): print invoices and receipts through the Template Studio engine"
```

---

## Post-implementation checklist (manual smoke test)

1. Open Template Studio → each category card → gallery shows 3 seeded presets.
2. Open "Classic letterhead": drag a text block, drop a `student_name` token onto it, resize the table, toggle sample data, undo/redo, save.
3. Preview print → popup shows sample invoice with QR; scan the QR → verify page renders the sample data.
4. Finance → Invoices → create + Save & Print → output uses the studio template; record a payment → print receipt.
5. ID card preset: front/back tabs both editable; preview prints two CR80 sheets.
6. Mark sheet preset: change a Marks value expectation via the formula preview (row 1) in the column editor.






