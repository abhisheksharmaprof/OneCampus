"""Shape validation for layout JSON v2. The layout is otherwise opaque to the backend."""

import json
import re
import uuid

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
    if isinstance(layout, dict) and layout.get("version") == 3:
        from modules.documents.layout_v3 import validate_layout_v3

        return validate_layout_v3(layout, category=category)
    if not isinstance(layout, dict):
        _fail("Layout must be an object.")
    if layout.get("version") != 2:
        _fail("Layout version must be 2.")
    letterhead = layout.get("letterhead")
    if letterhead is not None and not isinstance(letterhead, dict):
        _fail("letterhead must be a saved letterhead design or null.")
    if isinstance(letterhead, dict):
        try:
            uuid.UUID(str(letterhead.get("templateId", "")))
        except (TypeError, ValueError, AttributeError):
            _fail("letterhead.templateId must be a valid letterhead template ID.")
        if not isinstance(letterhead.get("elements"), list):
            _fail("letterhead.elements must be a list.")
        validate_layout(
            {
                "version": 2,
                "page": {"sizeId": "A4P", "marginMm": 0, "background": "#FFFFFF"},
                "zones": {},
                "watermark": {},
                "pages": [{"elements": letterhead["elements"]}],
            },
            category="LETTERHEAD",
        )
    if len(json.dumps(layout)) > MAX_LAYOUT_BYTES:
        _fail("Layout is too large (max 64 KB).")

    page = layout.get("page")
    if not isinstance(page, dict) or page.get("sizeId") not in PAGE_SIZE_IDS:
        _fail("Unknown or missing page size.")
    margin = page.get("marginMm", 0)
    if not isinstance(margin, (int, float)) or isinstance(margin, bool):
        _fail("page.marginMm must be a number.")
    for key in ("zones", "watermark"):
        if key in layout and not isinstance(layout[key], dict):
            _fail(f"'{key}' must be an object.")

    pages = layout.get("pages")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 2:
        _fail("Layout must have 1 or 2 pages.")
    if len(pages) == 2 and category != "ID_CARD":
        _fail("Only ID card templates may have two pages.")
    if category == "ADMIT_CARD" and page.get("sizeId") not in {"A4P", "A4L", "A4P_HALF_TOP", "A4P_HALF_BOTTOM"}:
        _fail("Admit card templates require an A4 page format.")

    table_count = 0
    element_count = 0
    seen_ids = set()
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
            if "visible" in element and not isinstance(element["visible"], bool):
                _fail("Element visibility must be a boolean.")
            required_text_tokens = {"student_name", "exam_name"} if category in {"ADMIT_CARD", "MARKSHEET"} else set()
            if element.get("type") == "text" and element.get("visible") is False:
                content = element.get("content", "")
                if isinstance(content, str) and any(
                    re.search(r"\{\{\s*" + token + r"\s*\}\}", content)
                    for token in required_text_tokens
                ):
                    _fail("Student name and exam name fields cannot be hidden.")
            if not isinstance(element.get("id"), str) or not element["id"]:
                _fail("Every element needs a string id.")
            if element["id"] in seen_ids:
                _fail(f"Duplicate element id '{element['id']}'.")
            seen_ids.add(element["id"])
            for key in GEOMETRY_KEYS:
                value = element.get(key)
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    _fail(f"Element geometry '{key}' must be a number.")
                if key in ("w", "h"):
                    if not 0 < value <= GEOMETRY_RANGE[1]:
                        _fail(f"Element geometry '{key}' must be positive.")
                elif not GEOMETRY_RANGE[0] <= value <= GEOMETRY_RANGE[1]:
                    _fail(f"Element geometry '{key}' is out of range.")
            if element["type"] == "table":
                table_count += 1
                required_dataset = "exam_schedule" if category == "ADMIT_CARD" else "marks" if category == "MARKSHEET" else None
                if required_dataset and element.get("datasetId") == required_dataset and element.get("visible") is False:
                    _fail("The exam or marks table cannot be hidden.")
                columns = element.get("columns", [])
                if not isinstance(columns, list):
                    _fail("Table columns must be a list.")
                for column in columns:
                    if isinstance(column, dict) and "visible" in column and not isinstance(column["visible"], bool):
                        _fail("Table column visibility must be a boolean.")
                    if category == "ADMIT_CARD" and element.get("datasetId") == "exam_schedule" and isinstance(column, dict) and column.get("id") in {"c1", "c2", "c3"} and column.get("visible") is False:
                        _fail("Subject, date, and time columns cannot be hidden on admit cards.")
                    if category == "MARKSHEET" and element.get("datasetId") == "marks" and isinstance(column, dict) and column.get("id") in {"c1", "c3"} and column.get("visible") is False:
                        _fail("Subject and marks columns cannot be hidden on marksheets.")
    if table_count > 1:
        _fail("A template may contain at most one table.")
