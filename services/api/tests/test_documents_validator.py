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
