"""One paginated renderer for previews and immutable issued marksheets."""

import base64
import io
from decimal import Decimal
from xml.sax.saxutils import escape

from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Circle, Drawing, Polygon, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from .appearance import number_words


def render_marksheet(snapshot):
    out = io.BytesIO()
    config = snapshot["config"]
    appearance = config.get("appearance", {})
    design = snapshot["design"]
    comprehensive = design in ("comprehensive", "university")
    compact = design == "compact"
    comparison = len(snapshot["results"]) > 1
    default_columns = (
        ["score", "maximum"]
        + (["percentage"] if comprehensive else [])
        + ["status"]
        + (["grade"] if config["showGrades"] else [])
    )
    column_ids = appearance.get("columns", default_columns)
    section_ids = appearance.get(
        "sections",
        ["total", "percentage", "grade", "remarks"] + (["gpa"] if design == "university" else []),
    )
    hidden = set(appearance.get("hiddenSubjects", []))
    page = landscape(A4) if (comparison and comprehensive) or len(column_ids) > 8 else A4
    width = page[0] - 30 * mm
    school = {**snapshot["school"]}
    for key, source in [("name", "schoolName"), ("address", "address"), ("logo", "logo")]:
        if appearance.get(source):
            school[key] = appearance[source]
    brand = colors.HexColor(appearance.get("accent") or school["color"])
    font = {"sans": "Helvetica", "serif": "Times-Roman", "mono": "Courier"}.get(
        appearance.get("typography", "sans"), "Helvetica"
    )
    bold = {"Helvetica": "Helvetica-Bold", "Times-Roman": "Times-Bold", "Courier": "Courier-Bold"}[
        font
    ]
    document = SimpleDocTemplate(
        out,
        pagesize=page,
        rightMargin=15 * mm,
        leftMargin=15 * mm,
        topMargin=16 * mm,
        bottomMargin=19 * mm,
        title=config["title"],
        author=school["name"],
    )
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        style.fontName = bold if style.name.startswith("Heading") or style.name == "Title" else font
    styles.add(
        ParagraphStyle(
            name="School",
            fontName=bold,
            fontSize=13 if compact else 18,
            leading=23,
            textColor=brand,
            alignment=0 if design in ("modern", "compact") else TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallCentered",
            fontName=font,
            fontSize=8,
            leading=12,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#526079"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="Cell", fontName=font, fontSize=7 if len(column_ids) > 8 else 8.5, leading=11
        )
    )
    styles.add(
        ParagraphStyle(
            name="CellHead", fontName=bold, fontSize=7.5, leading=10, textColor=colors.white
        )
    )

    def p(text, style="Cell"):
        if isinstance(text, Drawing):
            return text
        return Paragraph(escape(str(text)).replace("\n", "<br/>"), styles[style])

    def table(headers, rows, widths=None):
        t = Table(
            [[p(h, "CellHead") for h in headers]] + [[p(v) for v in row] for row in rows],
            colWidths=widths,
            repeatRows=1,
            hAlign="LEFT",
        )
        t.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), brand),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [colors.white, colors.HexColor("#f4f6fa")],
                    ),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        return t

    story = []
    crest = appearance.get("crest", "school")
    if crest == "school" and school.get("logo"):
        story += [
            Image(
                io.BytesIO(base64.b64decode(school["logo"])),
                width=17 * mm,
                height=17 * mm,
                kind="proportional",
            ),
            Spacer(1, 2 * mm),
        ]
    elif crest not in ("school", "none"):
        d = Drawing(50, 48)
        if crest in ("shield", "royal"):
            d.add(
                Polygon(
                    [4, 43, 46, 43, 43, 18, 25, 3, 7, 18],
                    strokeColor=brand,
                    fillColor=colors.HexColor("#f3f5fa"),
                )
            )
        else:
            d.add(Circle(25, 25, 21, strokeColor=brand, fillColor=colors.HexColor("#f3f5fa")))
        d.add(
            String(
                25,
                22,
                {"shield": "S", "laurel": "L", "stem": "U", "royal": "R"}[crest],
                fontName=bold,
                fontSize=18,
                textAnchor="middle",
                fillColor=brand,
            )
        )
        d.hAlign = "CENTER"
        story += [d, Spacer(1, 2 * mm)]
    story += [p(school["name"], "School")]
    if appearance.get("subtitle"):
        story.append(p(appearance["subtitle"], "SmallCentered"))
    story += [
        p(school.get("address", ""), "SmallCentered"),
        Spacer(1, 3 * mm),
        p(config["title"], "Heading2"),
        p(
            f"{appearance.get('session') or snapshot['academicYear']} | "
            f"{snapshot['branch']} | Issued {config['issueDate']}",
            "SmallCentered",
        ),
        Spacer(1, 5 * mm),
    ]
    student = snapshot["student"]
    info = [
        [p(f"Student: {student['name']}"), p(f"Class: {snapshot['class']}")],
        [p(f"Admission: {student['admission']}"), p(f"Roll: {student['roll']}")],
    ]
    if config.get("showGuardian", True):
        info.append(
            [
                p(f"Guardian: {student.get('guardian') or '—'}"),
                p(f"Mother: {student.get('mother') or '—'}"),
            ]
        )
    if student.get("dob"):
        info.append([p(f"Date of birth: {student['dob']}"), p("")])
    info.append([p("Draft preview" if snapshot["draft"] else "Approved results"), p("")])
    details = Table(info, colWidths=[width * 0.62, width * 0.38])
    details.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0f4fa")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story += [details, Spacer(1, 5 * mm)]
    if comparison and comprehensive:
        results = snapshot["results"]
        ids = list(
            dict.fromkeys(
                row["subjectId"]
                for result in results
                for row in result["rows"]
                if row["subjectId"] not in hidden
            )
        )
        rows = []
        for id_ in ids:
            first = next(
                row for result in results for row in result["rows"] if row["subjectId"] == id_
            )
            cells = [first["subject"]]
            for result in results:
                row = next((r for r in result["rows"] if r["subjectId"] == id_), None)
                cells.append("—" if row is None else f"{row['score'] or '—'} / {row['maximum']}")
            rows.append(cells)
        story += [
            table(
                ["Subject"] + [r["exam"] for r in results],
                rows,
                [width * 0.26] + [width * 0.74 / len(results)] * len(results),
            ),
            Spacer(1, 5 * mm),
        ]
    labels = {
        "serial": "S.No",
        "code": "Code",
        "score": "Marks",
        "maximum": "Maximum",
        "passing": "Passing",
        "percentage": "%",
        "status": "Result",
        "grade": "Grade",
        "gradePoint": "GP",
        "credits": "Credits / CP",
        "classStats": "Class Avg / High",
        "bars": "Score",
        "words": "In words",
    }
    for result in snapshot["results"]:
        story.append(p(result["exam"], "Heading3"))
        headers = ["Subject"] + [labels[key] for key in column_ids]
        rows = []
        visible = [row for row in result["rows"] if row["subjectId"] not in hidden]

        def cells(row, index):
            score = row["score"] if row["score"] is not None else "Missing"
            if len(row["components"]) == 1 and row["components"][0]["status"] != "PRESENT":
                score = row["components"][0]["status"].replace("_", " ").title()
            pct = Decimal(row["percentage"] or 0)
            bar = Drawing(35, 9)
            bar.add(Rect(0, 1, 35, 6, fillColor=colors.HexColor("#e4e8ef"), strokeColor=None))
            bar.add(
                Rect(
                    0, 1, float(max(0, min(100, pct))) * 0.35, 6, fillColor=brand, strokeColor=None
                )
            )
            values = {
                "serial": index,
                "code": row.get("code", ""),
                "score": score,
                "maximum": row["maximum"],
                "passing": row.get("passMarks", "—"),
                "percentage": row["percentage"] or "—",
                "status": row["result"],
                "grade": row["grade"],
                "gradePoint": row.get("gradePoint") or "—",
                "credits": (
                    f"{row.get('credits', '1')} / "
                    f"{Decimal(row.get('credits', '1')) * Decimal(row.get('gradePoint') or 0):.2f}"
                ),
                "classStats": (
                    f"{row.get('classAverage') or '—'} / {row.get('classHighest') or '—'}"
                ),
                "bars": bar,
                "words": number_words(row["score"]) if row["score"] is not None else "—",
            }
            name = row["subject"] + (" (Additional)" if row.get("included") is False else "")
            return [name] + [values[key] for key in column_ids]

        for index, row in enumerate(visible, 1):
            rows.append(cells(row, index))
            if config["showComponents"]:
                for c in row["components"]:
                    vals = {
                        "score": c["score"]
                        if c["score"] is not None
                        else c["status"].replace("_", " ").title(),
                        "maximum": c["maximum"],
                        "passing": c.get("passMarks", ""),
                        "status": c["status"].title(),
                    }
                    rows.append([f"  {c['name']}"] + [vals.get(key, "") for key in column_ids])
        widths = (
            [width]
            if not column_ids
            else [width * 0.27] + [width * 0.73 / len(column_ids)] * len(column_ids)
        )
        story.append(table(headers, rows, widths))
        summary = []
        if "total" in section_ids:
            summary.append(f"Total: {result['total']} / {result['maximum']}")
        if "percentage" in section_ids:
            summary.append(f"Percentage: {result['percentage'] or '—'}%")
        summary.append(f"Result: {result['result']}")
        if "grade" in section_ids and config["showGrades"]:
            summary.append(f"Grade: {result['grade']}")
        if "gpa" in section_ids:
            summary.append(f"GPA / SGPA: {result.get('gpa') or '—'}")
        if "division" in section_ids:
            summary.append(f"Division: {result.get('division') or '—'}")
        story += [Spacer(1, 3 * mm), p("    ".join(summary), "Normal")]
        if Decimal(result.get("grace", "0")):
            story.append(
                p(
                    f"Grace awarded: {result['grace']} marks "
                    "(included above; original scores retained)."
                )
            )
        if result.get("formulaError"):
            story.append(p(f"Calculation error: {result['formulaError']}"))
        if config.get("showRank") or "rank" in section_ids:
            rank = result.get("rank")
            story.append(
                p(
                    f"Class rank: {rank.get('display') or str(rank['position'])} ({rank['policy']})"
                    if rank
                    else "Class rank: not eligible"
                )
            )
        if "words" in section_ids:
            story.append(p(f"Total in words: {number_words(result['total'])}"))
        if "remarks" in section_ids and result.get("remark"):
            story.append(p(f"Remarks: {result['remark']}"))
        if "graph" in section_ids and visible:
            d = Drawing(width, len(visible) * 18 + 15)
            for index, row in enumerate(visible):
                y = len(visible) * 18 - index * 18
                d.add(String(0, y, row["subject"][:25], fontName=font, fontSize=8))
                d.add(
                    Rect(
                        width * 0.3,
                        y - 1,
                        width * 0.55 * float(Decimal(row["percentage"] or 0)) / 100,
                        8,
                        fillColor=brand,
                        strokeColor=None,
                    )
                )
                d.add(
                    String(
                        width * 0.88, y, f"{row['percentage'] or '—'}%", fontName=font, fontSize=8
                    )
                )
            story += [Spacer(1, 4 * mm), d]
        story.append(Spacer(1, 5 * mm))
    summary = snapshot.get("summary")
    if summary:
        label = "Weighted final result" if config["mode"] == "weighted" else "Consolidated result"
        story.append(
            p(
                f"{label}: {summary['percentage'] or '—'}% | "
                f"{summary['result']} | Grade {summary['grade']}",
                "Heading3",
            )
        )
    if config.get("showAttendance"):
        a = snapshot.get("attendance")
        text = (
            f"Daily attendance: {a['present']} present / {a['recorded']} recorded days "
            "(late counts as present)."
            if a
            else "No daily attendance recorded for this date range."
        )
        story.append(p(f"{text} {config['attendanceStart']} to {config['attendanceEnd']}"))
    if student.get("attendanceText"):
        story.append(p(f"Imported attendance: {student['attendanceText']} (source spreadsheet)"))
    if "legend" in section_ids:
        rules = snapshot.get("rules", [{}])[-1]
        legend = " | ".join(
            f"{g['label']}: ≥{g['minimum']}% · GP "
            f"{g.get('points', Decimal(str(g['minimum'])) / 10)}"
            for g in sorted(
                rules.get("grades", []), key=lambda g: Decimal(str(g["minimum"])), reverse=True
            )
        )
        story += [p("Grade scale", "Heading4"), p(legend)]
    if "qr" in section_ids:
        reference = snapshot.get("documentId")
        if reference:
            qr = QrCodeWidget(f"CampusOne result {reference}")
            x1, y1, x2, y2 = qr.getBounds()
            size = 50
            d = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0])
            d.add(qr)
            story += [
                Spacer(1, 4 * mm),
                d,
                p(f"Document reference: {reference}"),
                p("Verify this reference in the school’s authenticated Marks & Grades workspace."),
            ]
        else:
            story.append(p("Document reference QR is assigned when this report is generated."))
    if config["showSignatures"] and not compact:
        sig = Table(
            [
                [
                    p(config["teacherLabel"], "SmallCentered"),
                    p(config["principalLabel"], "SmallCentered"),
                ]
            ],
            colWidths=[width / 2] * 2,
        )
        sig.setStyle(
            TableStyle(
                [("LINEABOVE", (0, 0), (-1, -1), 0.5, brand), ("TOPPADDING", (0, 0), (-1, -1), 8)]
            )
        )
        story.append(KeepTogether([Spacer(1, 17 * mm), sig]))
    if config["footer"]:
        story += [Spacer(1, 5 * mm), p(config["footer"], "SmallCentered")]

    def footer(canvas, doc):
        canvas.saveState()
        frame = appearance.get(
            "frame",
            "double" if design == "classic" else "ornate" if design == "royal" else "minimal",
        )
        canvas.setStrokeColor(brand)
        if frame != "minimal":
            canvas.setLineWidth(1 if frame == "solid" else 0.5)
            canvas.rect(9 * mm, 14 * mm, page[0] - 18 * mm, page[1] - 25 * mm)
            if frame in ("double", "ornate"):
                canvas.rect(10.5 * mm, 15.5 * mm, page[0] - 21 * mm, page[1] - 28 * mm)
        if design == "modern":
            canvas.setFillColor(brand)
            canvas.rect(0, page[1] - 4 * mm, page[0], 4 * mm, stroke=0, fill=1)
        if snapshot["draft"] or "watermark" in section_ids:
            canvas.saveState()
            canvas.setFillColor(colors.Color(0.5, 0.5, 0.5, alpha=0.09))
            canvas.setFont(bold, 50)
            canvas.translate(page[0] / 2, page[1] / 2)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, "DRAFT" if snapshot["draft"] else school["name"][:24])
            canvas.restoreState()
        canvas.setFont(font, 8)
        canvas.setFillColor(colors.HexColor("#63718a"))
        if doc.page > 1:
            canvas.drawString(
                15 * mm,
                page[1] - 9 * mm,
                f"{student['name']} | {snapshot['class']} | Roll {student['roll']}"[:120],
            )
        canvas.drawString(15 * mm, 9 * mm, school["name"][:80])
        canvas.drawRightString(page[0] - 15 * mm, 9 * mm, f"Page {doc.page}")
        canvas.restoreState()

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return out.getvalue()
