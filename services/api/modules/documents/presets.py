"""Seeded preset templates. Layout JSON v2 authored via small builders.

Coordinates are millimetres on the page's physical size (A4P=210x297, A4L=297x210,
CR80=86x54, A4P_HALF_TOP/BOTTOM=210x148.5).

Contract: each category's list must contain EXACTLY ONE preset with is_default=True —
the per-category default unique constraint is what makes concurrent seeding safe.

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
        _col("c4", "Amount", dtype="number", width=24, align="right"),
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

PRESETS: dict[str, list[dict]] = {
    "FEE_INVOICE": PRESET_FEE_INVOICE,
    "FEE_RECEIPT": PRESET_FEE_RECEIPT,
    "MARKSHEET": PRESET_MARKSHEET,
    "ID_CARD": PRESET_ID_CARD,
    "CERTIFICATE": PRESET_CERTIFICATE,
}
