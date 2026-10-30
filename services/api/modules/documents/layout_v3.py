"""Validation for the parallel document layout v3 contract."""

import json
import math
import uuid

from rest_framework import serializers

PAGE_SIZES_MM = {
    "A4P": (210.0, 297.0),
    "A4L": (297.0, 210.0),
    "CR80": (86.0, 54.0),
    "A4P_HALF_TOP": (210.0, 148.5),
    "A4P_HALF_BOTTOM": (210.0, 148.5),
}
ELEMENT_TYPES = {
    "text",
    "image",
    "table",
    "totals",
    "shape",
    "divider",
    "signature",
    "qr",
    "barcode",
    "photo",
    "pageFrame",
}
WATERMARK_MODES = {"none", "image", "text", "both"}
MAX_ELEMENTS = 500
MAX_LAYOUT_BYTES = 2 * 1024 * 1024
MAX_GEOMETRY_MM = 1000.0


def _fail(message):
    raise serializers.ValidationError({"layout": [message]})


def _number(value, path):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        _fail(f"{path} must be a finite number.")
    return float(value)


def validate_layout_v3(layout, *, category=None):
    if not isinstance(layout, dict) or layout.get("version") != 3:
        _fail("Layout version must be 3.")
    try:
        size = json.dumps(layout).encode("utf-8")
    except (TypeError, ValueError, OverflowError):
        _fail("Layout must contain JSON-compatible finite values.")
    if len(size) > MAX_LAYOUT_BYTES:
        _fail("Layout is too large (max 2 MB).")

    page = layout.get("page")
    if not isinstance(page, dict) or page.get("sizeId") not in PAGE_SIZES_MM:
        _fail("Unknown or missing page size.")
    if page.get("orientation") not in {"PORTRAIT", "LANDSCAPE"}:
        _fail("Page orientation must be PORTRAIT or LANDSCAPE.")
    if (page["sizeId"] == "A4L") != (page["orientation"] == "LANDSCAPE"):
        _fail("Page orientation must match the selected page size.")
    margins = page.get("marginsMm")
    if not isinstance(margins, dict):
        _fail("Page margins must be an object.")
    for side in ("top", "right", "bottom", "left"):
        if _number(margins.get(side), f"page.marginsMm.{side}") < 0:
            _fail(f"page.marginsMm.{side} cannot be negative.")

    zones = layout.get("zones")
    if not isinstance(zones, dict):
        _fail("Zones must be an object.")
    header = _number(zones.get("headerMm"), "zones.headerMm")
    footer = _number(zones.get("footerMm"), "zones.footerMm")
    if header < 0 or footer < 0:
        _fail("Header and footer heights cannot be negative.")

    width, height = PAGE_SIZES_MM[page["sizeId"]]
    if margins["left"] + margins["right"] >= width:
        _fail("Horizontal margins must leave printable page width.")
    if margins["top"] + margins["bottom"] + header + footer > height:
        _fail("Margins and header/footer zones exceed page height.")

    pages = layout.get("pages")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 100:
        _fail("Layout must contain between 1 and 100 pages.")
    page_ids = set()
    ids = set()
    element_count = 0
    for page_entry in pages:
        if not isinstance(page_entry, dict) or not isinstance(page_entry.get("id"), str):
            _fail("Every page needs a string ID and an elements list.")
        page_id = page_entry["id"]
        if not page_id.strip() or page_id in page_ids:
            _fail(f"Page ID '{page_id}' is empty or repeated.")
        page_ids.add(page_id)
        elements = page_entry.get("elements")
        if not isinstance(elements, list):
            _fail(f"Page '{page_id}' elements must be a list.")
        for element in elements:
            element_count += 1
            if element_count > MAX_ELEMENTS:
                _fail(f"Too many elements (max {MAX_ELEMENTS}).")
            if not isinstance(element, dict):
                _fail("Every element must be an object.")
            element_id = element.get("id")
            if not isinstance(element_id, str) or not element_id.strip():
                _fail("Every element needs a non-empty string ID.")
            if element_id in ids:
                _fail(f"Duplicate element ID '{element_id}'.")
            ids.add(element_id)
            if element.get("type") not in ELEMENT_TYPES:
                _fail(f"Unknown element type for '{element_id}'.")
            for key in ("xMm", "yMm", "widthMm", "heightMm"):
                value = _number(element.get(key), f"{element_id}.{key}")
                if key in {"widthMm", "heightMm"} and not 0 < value <= MAX_GEOMETRY_MM:
                    _fail(
                        f"{element_id}.{key} must be positive and no greater than "
                        f"{MAX_GEOMETRY_MM:g}."
                    )
                if key in {"xMm", "yMm"} and not -500 <= value <= MAX_GEOMETRY_MM:
                    _fail(f"{element_id}.{key} is outside the supported range.")
            if element["type"] == "table":
                if element.get("mode") not in {"static", "dynamic"}:
                    _fail(f"Table '{element_id}' mode must be static or dynamic.")
                if element["mode"] == "dynamic" and not element.get("datasetId"):
                    _fail(f"Dynamic table '{element_id}' requires a datasetId.")
                if not isinstance(element.get("columns", element.get("cells")), list):
                    _fail(f"Table '{element_id}' needs a columns or cells list.")

    watermark = layout.get("watermark")
    if not isinstance(watermark, dict) or watermark.get("mode") not in WATERMARK_MODES:
        _fail("Watermark mode must be none, image, text or both.")

    master = layout.get("masterLetterhead")
    if master is not None:
        if not isinstance(master, dict):
            _fail("Master letterhead must be an object or null.")
        try:
            uuid.UUID(str(master.get("templateId", "")))
        except (TypeError, ValueError, AttributeError):
            _fail("Master letterhead requires a valid template ID.")
        if master.get("mode") not in {"followDraft", "pinned"}:
            _fail("Master letterhead mode must be followDraft or pinned.")
        if master["mode"] == "pinned":
            try:
                uuid.UUID(str(master.get("publishedVersionId", "")))
            except (TypeError, ValueError, AttributeError):
                _fail("Pinned master letterhead requires a published version ID.")


def convert_legacy_layout(layout):
    if not isinstance(layout, dict) or layout.get("version") != 2:
        _fail("Only version 2 layouts can be converted.")

    diagnostics = []
    old_page = layout.get("page") if isinstance(layout.get("page"), dict) else {}
    size_id = old_page.get("sizeId")
    if size_id not in PAGE_SIZES_MM:
        size_id = "A4P"
        diagnostics.append(
            {
                "code": "PAGE_SIZE_DEFAULTED",
                "message": "Unsupported page size was converted to A4 portrait.",
            }
        )

    old_zones = layout.get("zones") if isinstance(layout.get("zones"), dict) else {}

    def _number_or(val, fallback, name):
        if isinstance(val, (int, float)) and not isinstance(val, bool) and math.isfinite(val):
            return float(val)
        diagnostics.append(
            {"code": "ZONE_DEFAULTED", "message": f"{name} was reset to {fallback:g} mm."}
        )
        return float(fallback)

    header_mm = max(0.0, _number_or(old_zones.get("headerMm"), 0.0, "Header height"))
    footer_mm = max(0.0, _number_or(old_zones.get("footerMm"), 0.0, "Footer height"))

    old_pages = layout.get("pages") if isinstance(layout.get("pages"), list) else []
    page_entries = list(old_pages) if old_pages else [{"elements": []}]

    letterhead = layout.get("letterhead")
    legacy_lh_elements = (
        letterhead.get("elements")
        if isinstance(letterhead, dict) and isinstance(letterhead.get("elements"), list)
        else []
    )
    if legacy_lh_elements:
        first_page = dict(page_entries[0]) if isinstance(page_entries[0], dict) else {}
        first_elements = (
            list(first_page.get("elements", []))
            if isinstance(first_page.get("elements"), list)
            else []
        )
        first_page["elements"] = list(legacy_lh_elements) + first_elements
        page_entries[0] = first_page
        diagnostics.append(
            {
                "code": "LETTERHEAD_COPIED_AS_LOCAL_CONTENT",
                "message": (
                    "The embedded legacy letterhead was copied into page one; link a "
                    "published master for inheritance."
                ),
            }
        )

    page_width, page_height = PAGE_SIZES_MM[size_id]
    legacy_wm = layout.get("watermark") if isinstance(layout.get("watermark"), dict) else {}
    old_wm_mode = str(legacy_wm.get("mode", "none")).lower()
    if legacy_wm.get("enabled") is False or old_wm_mode not in WATERMARK_MODES:
        wm_mode = "none"
    else:
        wm_mode = old_wm_mode

    watermark = {
        "mode": wm_mode,
        "text": legacy_wm.get("text") if isinstance(legacy_wm.get("text"), str) else None,
        "opacity": (
            float(legacy_wm["opacity"]) * 100.0
            if isinstance(legacy_wm.get("opacity"), (int, float))
            and not isinstance(legacy_wm.get("opacity"), bool)
            else None
        ),
    }
    watermark = {k: v for k, v in watermark.items() if v is not None}
    if legacy_wm.get("imageUrl"):
        diagnostics.append(
            {
                "code": "WATERMARK_ASSET_RELINK_REQUIRED",
                "message": (
                    "The legacy watermark image must be relinked to an institute "
                    "asset before printing."
                ),
            }
        )

    background = (
        old_page.get("background") if isinstance(old_page.get("background"), str) else "#FFFFFF"
    )
    if isinstance(old_page.get("background"), dict) and old_page.get("background", {}).get(
        "imageUrl"
    ):
        diagnostics.append(
            {
                "code": "BACKGROUND_ASSET_RELINK_REQUIRED",
                "message": (
                    "The legacy page background image must be relinked to an institute "
                    "asset before printing."
                ),
            }
        )
        background = "#FFFFFF"

    margin_val = old_page.get("marginMm")
    margin = (
        float(margin_val)
        if isinstance(margin_val, (int, float))
        and not isinstance(margin_val, bool)
        and margin_val >= 0
        else 10.0
    )

    ids = set()
    pages = []
    for page_idx, entry in enumerate(page_entries):
        old_elements = (
            entry.get("elements", [])
            if isinstance(entry, dict) and isinstance(entry.get("elements"), list)
            else []
        )
        elements = []
        for old_el in old_elements:
            if (
                not isinstance(old_el, dict)
                or not isinstance(old_el.get("id"), str)
                or not isinstance(old_el.get("type"), str)
            ):
                diagnostics.append(
                    {
                        "code": "ELEMENT_SKIPPED",
                        "message": f"An invalid element on page {page_idx + 1} was skipped.",
                    }
                )
                continue
            el_type = old_el["type"]
            if el_type not in ELEMENT_TYPES:
                diagnostics.append(
                    {
                        "code": "ELEMENT_SKIPPED",
                        "message": f"Unsupported element {old_el['id']} was skipped.",
                        "elementId": old_el["id"],
                    }
                )
                continue
            x = old_el.get("x")
            y = old_el.get("y")
            w = old_el.get("w")
            h = old_el.get("h")
            geom = [x, y, w, h]
            if (
                not all(
                    isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
                    for v in geom
                )
                or w <= 0
                or h <= 0
            ):
                diagnostics.append(
                    {
                        "code": "ELEMENT_SKIPPED",
                        "message": f"Element {old_el['id']} has invalid geometry and was skipped.",
                        "elementId": old_el["id"],
                    }
                )
                continue

            if old_el.get("zone") == "HEADER" or y < header_mm:
                zone = "header"
            elif old_el.get("zone") == "FOOTER" or y >= page_height - footer_mm:
                zone = "footer"
            else:
                zone = "body"

            el_id = old_el["id"]
            if el_id in ids:
                el_id = f"page-{page_idx + 1}-{el_id}"
                diagnostics.append(
                    {
                        "code": "ELEMENT_ID_RENAMED",
                        "message": f"Duplicate element ID was renamed to {el_id}.",
                        "elementId": old_el["id"],
                    }
                )
            ids.add(el_id)

            if zone == "header":
                y_mm = float(y)
            elif zone == "footer":
                y_mm = float(y) - (page_height - footer_mm)
            else:
                y_mm = float(y) - header_mm

            converted = dict(old_el)
            converted.pop("x", None)
            converted.pop("y", None)
            converted.pop("w", None)
            converted.pop("h", None)
            converted.update(
                {
                    "id": el_id,
                    "type": el_type,
                    "zone": zone,
                    "xMm": float(x),
                    "yMm": float(y_mm),
                    "widthMm": float(w),
                    "heightMm": float(h),
                    "rotationDeg": (
                        float(old_el["rotationDeg"])
                        if isinstance(old_el.get("rotationDeg"), (int, float))
                        and not isinstance(old_el.get("rotationDeg"), bool)
                        else 0.0
                    ),
                }
            )
            if el_type == "table":
                cols = old_el.get("columns", []) if isinstance(old_el.get("columns"), list) else []
                converted["mode"] = "dynamic"
                converted["columns"] = [
                    {
                        **c,
                        "header": str(c.get("label", c.get("header", ""))),
                        "fieldId": str(c.get("id", c.get("fieldId", ""))),
                    }
                    for c in cols
                    if isinstance(c, dict)
                ]
            elements.append(converted)
        pages.append({"id": f"page-{page_idx + 1}", "elements": elements})

    v3_layout = {
        "version": 3,
        "page": {
            "sizeId": size_id,
            "orientation": "LANDSCAPE" if size_id == "A4L" else "PORTRAIT",
            "marginsMm": {"top": margin, "right": margin, "bottom": margin, "left": margin},
            "background": background,
        },
        "zones": {
            "headerMm": header_mm,
            "footerMm": footer_mm,
            "repeatHeader": bool(old_zones.get("repeatHeader", True)),
            "repeatFooter": bool(old_zones.get("repeatFooter", True)),
            "hideHeaderOnFirstPage": bool(old_zones.get("hideHeaderOnFirstPage", False)),
        },
        "pages": pages,
        "watermark": watermark,
    }
    validate_layout_v3(v3_layout)
    return v3_layout, diagnostics
