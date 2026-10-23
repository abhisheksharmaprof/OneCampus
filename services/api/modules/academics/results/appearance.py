"""Validated report presentation options; no executable HTML or canvas code."""

import base64
import io
import re

from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

COLUMNS = {
    "serial",
    "code",
    "maximum",
    "passing",
    "score",
    "percentage",
    "grade",
    "gradePoint",
    "credits",
    "classStats",
    "bars",
    "status",
    "words",
}
SECTIONS = {
    "total",
    "percentage",
    "gpa",
    "grade",
    "rank",
    "division",
    "words",
    "graph",
    "remarks",
    "legend",
    "qr",
    "watermark",
}


def validate_appearance(value, subject_ids):
    if not isinstance(value, dict):
        raise ValidationError("Template appearance must be an object.")
    allowed = {
        "design",
        "accent",
        "typography",
        "frame",
        "crest",
        "schoolName",
        "subtitle",
        "address",
        "session",
        "logo",
        "columns",
        "sections",
        "hiddenSubjects",
    }
    if set(value) - allowed:
        raise ValidationError("Unsupported template appearance setting.")
    result = {}
    for key, choices in {
        "design": ["classic", "modern", "university", "royal"],
        "typography": ["sans", "serif", "mono"],
        "frame": ["double", "ornate", "solid", "minimal"],
        "crest": ["school", "shield", "laurel", "stem", "royal", "none"],
    }.items():
        if key in value:
            if value[key] not in choices:
                raise ValidationError(f"Invalid template {key}.")
            result[key] = value[key]
    for key in ("schoolName", "subtitle", "address", "session", "accent"):
        if key in value:
            if not isinstance(value[key], str) or len(value[key]) > (
                300 if key == "address" else 160
            ):
                raise ValidationError(f"Invalid {key}.")
            result[key] = value[key].strip()
    if result.get("accent") and not re.fullmatch(r"#[0-9a-fA-F]{6}", result["accent"]):
        raise ValidationError("Choose a six-digit hex accent colour.")
    for key, permitted in [
        ("columns", COLUMNS),
        ("sections", SECTIONS),
        ("hiddenSubjects", subject_ids),
    ]:
        if key in value:
            val = value[key]
            if (
                not isinstance(val, list)
                or any(not isinstance(x, str) for x in val)
                or len(set(val)) != len(val)
                or not set(val).issubset(permitted)
            ):
                raise ValidationError(f"Invalid template {key}.")
            result[key] = val
    if value.get("logo"):
        if not isinstance(value["logo"], str) or len(value["logo"]) > 700000:
            raise ValidationError("Choose a logo smaller than 500 KB.")
        try:
            raw = base64.b64decode(value["logo"], validate=True)
            with Image.open(io.BytesIO(raw)) as im:
                if im.width * im.height > 16000000:
                    raise ValueError
                im.thumbnail((500, 500))
                output = io.BytesIO()
                im.convert("RGBA").save(output, format="PNG")
            result["logo"] = base64.b64encode(output.getvalue()).decode()
        except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
            raise ValidationError("Choose a valid PNG, JPEG, or WebP logo.") from None
    return result


def number_words(value):
    from decimal import Decimal

    n = Decimal(str(value))
    integer = int(n)
    if integer < 0 or integer > 999999999:
        return str(value)
    ones = [
        "zero",
        "one",
        "two",
        "three",
        "four",
        "five",
        "six",
        "seven",
        "eight",
        "nine",
        "ten",
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen",
        "sixteen",
        "seventeen",
        "eighteen",
        "nineteen",
    ]
    tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]

    def words(x):
        if x < 20:
            return ones[x]
        if x < 100:
            return tens[x // 10] + ("-" + ones[x % 10] if x % 10 else "")
        if x < 1000:
            return ones[x // 100] + " hundred" + (" " + words(x % 100) if x % 100 else "")
        for unit, label in [(1000000, "million"), (1000, "thousand")]:
            if x >= unit:
                return words(x // unit) + " " + label + (" " + words(x % unit) if x % unit else "")

    fraction = str(n).partition(".")[2].rstrip("0")
    return words(integer).capitalize() + (
        " point " + " ".join(ones[int(x)] for x in fraction) if fraction else ""
    )
