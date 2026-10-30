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


def test_rejects_overflow_negative_dimensions_and_duplicates():
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(pages=[{"elements": [text_el(x=10 ** 400)]}]), category="FEE_INVOICE")
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(pages=[{"elements": [text_el(w=-5)]}]), category="FEE_INVOICE")
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(pages=[{"elements": [text_el(h=0)]}]), category="FEE_INVOICE")
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(pages=[{"elements": [text_el("dup"), text_el("dup")]}]), category="FEE_INVOICE")


def test_rejects_wrong_typed_page_settings():
    with pytest.raises(serializers.ValidationError):
        validate_layout(minimal_layout(zones="hello"), category="FEE_INVOICE")
    bad_margin = minimal_layout()
    bad_margin["page"]["marginMm"] = "abc"
    with pytest.raises(serializers.ValidationError):
        validate_layout(bad_margin, category="FEE_INVOICE")


def test_v3_accepts_multiple_tables_and_zero_height_zones():
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4P",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 0, "right": 10, "bottom": 0, "left": 10},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "page-1", "elements": [
            {
                "id": "static", "type": "table", "xMm": 10, "yMm": 10,
                "widthMm": 80, "heightMm": 20, "mode": "static", "cells": [],
            },
            {
                "id": "dynamic", "type": "table", "xMm": 10, "yMm": 40,
                "widthMm": 80, "heightMm": 20, "mode": "dynamic",
                "datasetId": "marks", "columns": [],
            },
        ]}],
        "watermark": {"mode": "none"},
    }

    validate_layout(layout, category="MARKSHEET")


def test_v3_rejects_non_finite_geometry_with_element_path():
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4P",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "p1", "elements": [{
            "id": "bad", "type": "text", "xMm": float("nan"), "yMm": 0,
            "widthMm": 10, "heightMm": 5,
        }]}],
        "watermark": {"mode": "none"},
    }

    with pytest.raises(serializers.ValidationError, match="bad.xMm"):
        validate_layout(layout, category="MARKSHEET")


def test_v3_rejects_page_size_orientation_mismatch():
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4L",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "p1", "elements": []}],
        "watermark": {"mode": "none"},
    }

    with pytest.raises(serializers.ValidationError, match="orientation.*size"):
        validate_layout(layout, category="MARKSHEET")


def test_v3_rejects_element_type_without_renderer_support():
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4P",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "p1", "elements": [{
            "id": "unknown", "type": "video", "xMm": 0, "yMm": 0,
            "widthMm": 10, "heightMm": 10,
        }]}],
        "watermark": {"mode": "none"},
    }

    with pytest.raises(serializers.ValidationError, match="Unknown element type"):
        validate_layout(layout, category="MARKSHEET")


def test_v3_preserves_two_authored_card_sides():
    layout = {
        "version": 3,
        "page": {
            "sizeId": "CR80",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "front", "elements": []}, {"id": "back", "elements": []}],
        "watermark": {"mode": "none"},
    }

    validate_layout(layout, category="ID_CARD")


def test_v3_rejects_malformed_master_binding():
    layout = {
        "version": 3,
        "page": {
            "sizeId": "A4P",
            "orientation": "PORTRAIT",
            "marginsMm": {"top": 0, "right": 0, "bottom": 0, "left": 0},
        },
        "zones": {"headerMm": 0, "footerMm": 0},
        "pages": [{"id": "p1", "elements": []}],
        "watermark": {"mode": "none"},
        "masterLetterhead": {"templateId": "bad-id", "mode": "latest"},
    }

    with pytest.raises(serializers.ValidationError, match="[Mm]aster letterhead"):
        validate_layout(layout, category="MARKSHEET")
