"""Bounded academic expressions and deterministic class ranking."""

import ast
from decimal import ROUND_HALF_UP, Decimal, DecimalException

from rest_framework.exceptions import ValidationError

VARIABLES = {"SUM", "MAX_SUM", "COUNT", "AVG", "MIN", "MAX", "CGPA", "CREDITS"}


def expression(expr, variables=None):
    if not isinstance(expr, str) or not expr.strip() or len(expr) > 240:
        raise ValidationError("Use a formula of 1–240 characters.")
    try:
        tree = ast.parse(expr, mode="eval")
    except (SyntaxError, ValueError, RecursionError):
        raise ValidationError("Invalid formula syntax.") from None
    if sum(1 for _ in ast.walk(tree)) > 100:
        raise ValidationError("Formula is too complex.")

    def run(node):
        if isinstance(node, ast.Expression):
            return run(node.body)
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            val = Decimal(str(node.value))
        elif isinstance(node, ast.Name) and node.id in VARIABLES:
            val = Decimal(str((variables or {}).get(node.id, 1)))
        elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            val = run(node.operand) * (-1 if isinstance(node.op, ast.USub) else 1)
        elif isinstance(node, ast.BinOp) and isinstance(
            node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)
        ):
            a, b = run(node.left), run(node.right)
            if isinstance(node.op, ast.Add):
                val = a + b
            elif isinstance(node.op, ast.Sub):
                val = a - b
            elif isinstance(node.op, ast.Mult):
                val = a * b
            else:
                val = a / b
        elif (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id == "ROUND"
            and not node.keywords
            and len(node.args) in (1, 2)
        ):
            a = run(node.args[0])
            places = run(node.args[1]) if len(node.args) == 2 else Decimal(2)
            if places != int(places) or not 0 <= places <= 4:
                raise ValidationError("ROUND precision must be an integer from 0 to 4.")
            val = a.quantize(Decimal(1).scaleb(-int(places)), rounding=ROUND_HALF_UP)
        else:
            raise ValidationError(
                "Use numeric constants, supported variables, + − * /, parentheses, and ROUND only."
            )
        if not val.is_finite() or abs(val) > Decimal("1000000000000"):
            raise ValidationError("Formula result is outside the supported range.")
        return val

    try:
        return run(tree)
    except (DecimalException, OverflowError, ValueError, RecursionError):
        raise ValidationError("Formula has an invalid calculation or division by zero.") from None


def validate_engine(rules):
    choices = {
        "aggregateMode": ("all", "best_n", "fixed", "imported"),
        "percentageMode": ("standard", "weighted", "cgpa_95", "custom"),
        "gpaMode": ("average", "credit", "us4", "percentage"),
        "rankMethod": ("competition", "dense", "unique"),
        "rankBasis": ("percentage", "total", "gpa"),
        "rankEligibility": ("all", "passed"),
        "rankFormat": ("ordinal", "hash", "of_total"),
    }
    for key, values in choices.items():
        if key in rules and rules[key] not in values:
            raise ValidationError(f"Invalid {key}.")
    for key, low, high in [("bestN", 1, 60), ("fixedCount", 1, 60), ("compartment", 0, 2)]:
        if key in rules and (type(rules[key]) is not int or not low <= rules[key] <= high):
            raise ValidationError(f"{key} must be an integer from {low} to {high}.")
    for key, high in [("fixedMaximum", 60000000), ("grace", 100), ("overallPass", 100)]:
        if key in rules:
            decimal_value(rules[key], key, high)
    if rules.get("aggregateMode") == "fixed" and Decimal(str(rules.get("fixedMaximum", 0))) <= 0:
        raise ValidationError("Fixed maximum must be greater than zero.")
    if "requireEverySubject" in rules and type(rules["requireEverySubject"]) is not bool:
        raise ValidationError("Subject pass rule must be true or false.")
    if rules.get("percentageMode") == "custom":
        # Check syntax with sample values; per-student arithmetic errors remain explicit.
        expression(
            rules.get("formula"),
            {
                "SUM": 80,
                "MAX_SUM": 100,
                "COUNT": 1,
                "AVG": 80,
                "MIN": 0,
                "MAX": 80,
                "CGPA": 8,
                "CREDITS": 1,
            },
        )
    formula = rules.get("formula", "")
    if not isinstance(formula, str) or len(formula) > 240:
        raise ValidationError("Formula must be text of at most 240 characters.")
    if rules.get("gpaMode") == "percentage" and (
        rules.get("percentageMode") == "cgpa_95"
        or rules.get("percentageMode") == "custom"
        and "CGPA" in formula
    ):
        raise ValidationError("Percentage-based GPA cannot feed back into percentage.")
    options = rules.get("subjects", {})
    if not isinstance(options, dict) or len(options) > 60:
        raise ValidationError("Subject options must be an object with at most 60 subjects.")
    for key, option in options.items():
        if not isinstance(option, dict) or not isinstance(key, str):
            raise ValidationError("Invalid subject options.")
        decimal_value(option.get("credits", 1), "Credits", 100)
        if type(option.get("include", True)) is not bool:
            raise ValidationError("Include in total must be true or false.")
        for field, limit in [("code", 30), ("name", 120)]:
            if not isinstance(option.get(field, ""), str) or len(option.get(field, "")) > limit:
                raise ValidationError(f"Subject {field} is too long.")
    divisions = rules.get("divisions", [75, 60, 45, 33])
    if not isinstance(divisions, list) or len(divisions) != 4:
        raise ValidationError("Define four division thresholds.")
    vals = [decimal_value(x, "Division threshold", 100) for x in divisions]
    if vals != sorted(vals, reverse=True):
        raise ValidationError(
            "Division thresholds must descend from distinction to third division."
        )
    for grade in rules["grades"]:
        decimal_value(grade.get("points", 0), "Grade points", 10)
        if len(str(grade.get("remark", ""))) > 200:
            raise ValidationError("Grade remark must be at most 200 characters.")


def decimal_value(value, label, high):
    try:
        n = Decimal(str(value))
        if not n.is_finite() or n < 0 or n > high or n.as_tuple().exponent < -2:
            raise ValueError
        return n
    except (DecimalException, ValueError, TypeError):
        raise ValidationError(
            f"{label} must be a nonnegative number up to {high}, with at most two decimals."
        ) from None


def grade_point(percent, rules):
    for grade in sorted(rules["grades"], key=lambda g: Decimal(str(g["minimum"])), reverse=True):
        if percent >= Decimal(str(grade["minimum"])):
            return Decimal(str(grade.get("points", Decimal(str(grade["minimum"])) / 10)))
    return Decimal(0)


def rank_results(results, rules):
    basis = rules.get("rankBasis", "percentage")
    eligible = [
        r
        for r in results
        if not r["missing"]
        and r.get(basis) is not None
        and Decimal(r["maximum"]) > 0
        and (rules.get("rankEligibility", "all") != "passed" or r["result"] == "Pass")
    ]

    def metric(r):
        return Decimal(r[basis])

    ordered = sorted(
        eligible,
        key=lambda r: (
            -metric(r),
            -max((Decimal(x["score"] or 0) for x in r["rows"]), default=Decimal(0)),
            -Decimal(r["total"]),
            str(r["candidateId"]),
        ),
    )
    last, dense, previous = None, 0, 0
    ranks = {}
    for index, result in enumerate(ordered):
        value = metric(result)
        if value != last:
            dense += 1
        method = rules.get("rankMethod", "competition")
        position = (
            index + 1
            if method == "unique"
            else dense
            if method == "dense"
            else (index + 1 if value != last else previous)
        )
        previous, last = position, value
        fmt = rules.get("rankFormat", "of_total")
        suffix = (
            "th"
            if 10 <= position % 100 <= 20
            else {1: "st", 2: "nd", 3: "rd"}.get(position % 10, "th")
        )
        display = (
            f"#{position}"
            if fmt == "hash"
            else f"{position}{suffix}"
            if fmt == "ordinal"
            else f"{position} of {len(ordered)}"
        )
        ranks[result["candidateId"]] = {
            "position": position,
            "cohort": len(ordered),
            "display": display,
            "policy": f"Class section; {method}; {basis}; {rules.get('rankEligibility', 'all')}",
        }
    return ranks


def enrich_results(results, rules):
    ranks = rank_results(results, rules)
    stats = {}
    for result in results:
        for row in result["rows"]:
            if row["score"] is not None and Decimal(row["maximum"]) > 0:
                values = stats.setdefault(row["subjectId"], [])
                values.append(Decimal(row["score"]))
    aggregates = {
        key: {
            "classAverage": str(
                (sum(vals) / len(vals)).quantize(Decimal(".01"), rounding=ROUND_HALF_UP)
            ),
            "classHighest": str(max(vals)),
        }
        for key, vals in stats.items()
    }
    for result in results:
        result["rank"] = ranks.get(result["candidateId"])
        for row in result["rows"]:
            row.update(
                aggregates.get(row["subjectId"], {"classAverage": None, "classHighest": None})
            )
    return results
