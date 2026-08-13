"""Seeded preset templates. Layout JSON v2 authored via small builders.

Coordinates are millimetres on the page's physical size (A4P=210x297, A4L=297x210,
CR80=86x54, A4P_HALF_TOP/BOTTOM=210x148.5).

Contract: each category's list must contain EXACTLY ONE preset with is_default=True —
the per-category default unique constraint is what makes concurrent seeding safe.
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
    _text(12, 274, 186, 6, "{{school_name}} · {{school_address}}", size=8, align="center", color=SOFT),
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
            _text(140, 8, 58, 18, "FEE INVOICE\n#{{invoice_no}}", size=12, bold=True, align="right", color="#FFFFFF"),
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
        _col("c5", "Amount", dtype="number", width=24, align="right"),
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
            _image(94, 8, 22, 22),
            _text(12, 32, 186, 7, "{{school_name}}", size=14, bold=True, align="center", color=BRAND),
            _text(12, 39, 186, 5, "{{school_address}} · GSTIN {{school_gstin}}", size=8, align="center", color=SOFT),
            _divider(12, 48, 186, BRAND),
            *_RECEIPT_CORE,
            _qr(12, 108, 18),
        ], header=50, footer=12),
    },
]

PRESETS: dict[str, list[dict]] = {
    "FEE_INVOICE": PRESET_FEE_INVOICE,
    "FEE_RECEIPT": PRESET_FEE_RECEIPT,
}
