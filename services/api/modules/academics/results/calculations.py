from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from rest_framework.exceptions import ValidationError

from .engine import expression, grade_point, validate_engine


def number(value, label="Marks", *, minimum=Decimal("0"), maximum=None):
    try:
        parsed = Decimal(str(value))
        if (
            not parsed.is_finite()
            or parsed < minimum
            or (maximum is not None and parsed > maximum)
            or parsed.as_tuple().exponent < -2
        ):
            raise InvalidOperation
        return parsed
    except (InvalidOperation, ValueError, TypeError):
        raise ValidationError(
            f"{label} must be a valid number with at most two decimal places, from {minimum}"
            + (f" to {maximum}." if maximum is not None else ".")
        ) from None


def validate_rules(rules):
    if (
        not isinstance(rules, dict)
        or type(rules.get("decimals", 2)) is not int
        or rules.get("decimals", 2) not in (0, 1, 2)
    ):
        raise ValidationError("Choose 0, 1, or 2 decimal places.")
    grades = rules.get("grades", [])
    if not isinstance(grades, list) or not grades or len(grades) > 20:
        raise ValidationError("Define between 1 and 20 grade boundaries.")
    boundaries = []
    for grade in grades:
        if (
            not isinstance(grade, dict)
            or not str(grade.get("label", "")).strip()
            or len(str(grade["label"])) > 20
        ):
            raise ValidationError("Each grade needs a label of at most 20 characters.")
        boundaries.append(number(grade.get("minimum"), "Grade boundary", maximum=Decimal(100)))
    if len(set(boundaries)) != len(boundaries) or min(boundaries) != 0:
        raise ValidationError("Grade boundaries must be unique and include zero.")
    validate_engine(rules)
    return rules


def grade_for(percentage, rules):
    if percentage is None:
        return "—"
    for grade in sorted(rules["grades"], key=lambda g: Decimal(str(g["minimum"])), reverse=True):
        if percentage >= Decimal(str(grade["minimum"])):
            return grade["label"]
    return "—"


def summarize(exam, candidate, mark_map):
    rows = []
    total = Decimal(0)
    maximum = Decimal(0)
    missing = 0
    failed = False
    grace_left = Decimal(str(exam.rules.get("grace", 0)))
    for subject in exam.subjects.all():
        if str(subject.subject_id) in candidate.excluded_subject_ids:
            continue
        components = []
        earned = Decimal(0)
        possible = Decimal(0)
        incomplete = False
        subject_failed = False
        grace_used = Decimal(0)
        pass_total = Decimal(0)
        for component in subject.components.all():
            mark = mark_map.get((str(candidate.id), str(component.id)))
            status = mark.status if mark else "MISSING"
            score = mark.score if mark else None
            if status == "MISSING":
                missing += 1
                incomplete = True
            grace = Decimal(0)
            if status == "PRESENT" and score is not None and score < component.pass_marks:
                deficit = component.pass_marks - score
                if deficit <= grace_left:
                    grace = deficit
                    grace_left -= deficit
                    grace_used += deficit
            final_score = score + grace if score is not None else None
            if status not in ("EXEMPT", "NOT_APPLICABLE"):
                possible += component.maximum
                pass_total += component.pass_marks
                earned += final_score or Decimal(0)
                if status == "ABSENT" or (
                    final_score is not None and final_score < component.pass_marks
                ):
                    subject_failed = True
            components.append(
                {
                    "name": component.name,
                    "score": str(score) if score is not None else None,
                    "maximum": str(component.maximum),
                    "status": status,
                    "grace": str(grace),
                    "passMarks": str(component.pass_marks),
                }
            )
        percentage = earned / possible * 100 if possible and not incomplete else None
        option = exam.rules.get("subjects", {}).get(str(subject.subject_id), {})
        rows.append(
            {
                "subjectId": str(subject.subject_id),
                "subject": option.get("name") or subject.subject.name,
                "code": option.get("code", ""),
                "credits": str(option.get("credits", 1)),
                "included": option.get("include", True),
                "passMarks": str(pass_total),
                "grace": str(grace_used),
                "gradePoint": str(grade_point(percentage, exam.rules))
                if percentage is not None
                else None,
                "score": None if incomplete else str(earned),
                "maximum": str(possible),
                "percentage": str(percentage.quantize(Decimal(".01"), rounding=ROUND_HALF_UP))
                if percentage is not None
                else None,
                "grade": grade_for(percentage, exam.rules),
                "result": "Incomplete"
                if incomplete
                else "Exempt"
                if not possible
                else "Needs improvement"
                if subject_failed
                else "Pass",
                "components": components,
            }
        )
    counted = [r for r in rows if r["included"] and Decimal(r["maximum"]) > 0]
    if exam.rules.get("aggregateMode") == "best_n":
        chosen = sorted(counted, key=lambda r: Decimal(r["percentage"] or -1), reverse=True)[
            : exam.rules.get("bestN", 5)
        ]
        for row in rows:
            row["included"] = row in chosen
        counted = chosen
    total = sum((Decimal(r["score"] or 0) for r in counted), Decimal(0))
    maximum = sum((Decimal(r["maximum"]) for r in counted), Decimal(0))
    count = len(counted)
    mode = exam.rules.get("aggregateMode", "all")
    if mode == "fixed":
        maximum = Decimal(str(exam.rules["fixedMaximum"]))
        count = exam.rules.get("fixedCount", count)
    if mode == "imported":
        imported = getattr(candidate, "profile", {}).get("importedTotal")
        if imported in (None, ""):
            missing += 1
        else:
            total = Decimal(str(imported))
            if total > maximum:
                raise ValidationError("Imported total exceeds the eligible maximum.")
    credits = sum((Decimal(r["credits"]) for r in counted), Decimal(0))
    credit_points = sum(
        (Decimal(r["credits"]) * Decimal(r["gradePoint"] or 0) for r in counted), Decimal(0)
    )
    gpa = (
        sum((Decimal(r["gradePoint"] or 0) for r in counted), Decimal(0)) / len(counted)
        if counted
        else Decimal(0)
    )
    if exam.rules.get("gpaMode") == "credit":
        gpa = credit_points / credits if credits else Decimal(0)
    elif exam.rules.get("gpaMode") == "us4":
        gpa = gpa * Decimal(".4")
    percent = total / maximum * 100 if maximum and not missing else None
    formula_error = (
        "Credit-based GPA requires positive subject credits."
        if maximum and exam.rules.get("gpaMode") == "credit" and not credits
        else None
    )
    variables = {
        "SUM": total,
        "MAX_SUM": maximum,
        "COUNT": count,
        "AVG": total / count if count else 0,
        "MIN": min((Decimal(r["score"] or 0) for r in counted), default=Decimal(0)),
        "MAX": max((Decimal(r["score"] or 0) for r in counted), default=Decimal(0)),
        "CGPA": gpa,
        "CREDITS": credits,
    }
    if percent is not None:
        pct_mode = exam.rules.get("percentageMode", "standard")
        if pct_mode == "weighted":
            if not credits:
                formula_error = "Credit-weighted percentage requires positive credits."
            else:
                percent = (
                    sum(Decimal(r["percentage"] or 0) * Decimal(r["credits"]) for r in counted)
                    / credits
                )
        elif pct_mode == "cgpa_95":
            percent = gpa * Decimal("9.5")
        elif pct_mode == "custom":
            try:
                percent = expression(exam.rules["formula"], variables)
            except ValidationError as exc:
                formula_error = str(exc.detail)
        if not 0 <= percent <= 100:
            formula_error = "Calculated percentage must be between 0 and 100."
    if formula_error:
        percent = None
        missing += 1
    if exam.rules.get("gpaMode") == "percentage":
        gpa = percent / 10 if percent is not None else Decimal(0)
    failed_count = sum(r["result"] == "Needs improvement" for r in counted)
    failed = (exam.rules.get("requireEverySubject", True) and failed_count > 0) or (
        percent is not None and percent < Decimal(str(exam.rules.get("overallPass", 0)))
    )
    outcome = (
        "Incomplete"
        if missing
        else "Exempt"
        if not maximum
        else "Needs improvement"
        if failed
        else "Pass"
    )
    if (
        outcome == "Needs improvement"
        and percent >= Decimal(str(exam.rules.get("overallPass", 0)))
        and 0 < failed_count <= exam.rules.get("compartment", 0)
    ):
        outcome = "Compartment"
    thresholds = exam.rules.get("divisions", [75, 60, 45, 33])
    division = "Unclassified"
    if outcome == "Pass":
        division = next(
            (
                name
                for name, threshold in zip(
                    ["Distinction", "First division", "Second division", "Third division"],
                    thresholds,
                    strict=True,
                )
                if percent >= Decimal(str(threshold))
            ),
            "Pass class",
        )
    precision = Decimal(1).scaleb(-exam.rules.get("decimals", 2))
    grade_rule = next(
        (
            g
            for g in sorted(
                exam.rules["grades"], key=lambda g: Decimal(str(g["minimum"])), reverse=True
            )
            if percent is not None and percent >= Decimal(str(g["minimum"]))
        ),
        {},
    )
    return {
        "examId": str(exam.id),
        "exam": exam.name,
        "rows": rows,
        "total": str(total),
        "maximum": str(maximum),
        "percentage": str(percent.quantize(precision, rounding=ROUND_HALF_UP))
        if percent is not None
        else None,
        "grade": grade_for(percent, exam.rules),
        "result": outcome,
        "missing": missing,
        "remark": candidate.remark or grade_rule.get("remark", ""),
        "gpa": str(gpa.quantize(Decimal(".01"), rounding=ROUND_HALF_UP))
        if not missing and maximum
        else None,
        "credits": str(credits),
        "creditPoints": str(credit_points),
        "subjectCount": count,
        "division": division,
        "grace": str(sum(Decimal(r["grace"]) for r in rows)),
        "formulaVariables": {k: str(v) for k, v in variables.items()},
        "formulaError": formula_error,
    }
