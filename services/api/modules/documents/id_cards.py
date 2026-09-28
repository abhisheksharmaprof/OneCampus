import hashlib
import json
import math
import re

from modules.academics.models import StudentEnrollment
from modules.file_storage.models import FileAsset
from modules.file_storage.services import FileStorageError, read_url
from modules.file_storage.storage.base import StorageError
from modules.file_storage.storage.r2 import R2StorageProvider
from modules.people.models import Student

TOKEN_PATTERN = re.compile(r"\{\{\s*([^{}]+?)\s*\}\}")
STUDENT_FIELDS = {
    "student_name",
    "student_id",
    "class_section",
    "roll_no",
    "academic_year",
    "school_name",
    "school_address",
    "school_phone",
    "school_email",
}
IMAGE_SOURCES = {"institute-logo", "student-photo"}


def layout_issues(layout):
    if layout.get("page", {}).get("sizeId") != "CR80" or len(layout.get("pages", [])) != 2:
        return ["Student cards require two CR80 sides."]
    width = layout["page"].get("widthMm", 86)
    height = layout["page"].get("heightMm", 54)
    if width != 86 or height != 54:
        return ["Student card geometry must be 86 × 54 mm."]
    issues = []
    for page in layout["pages"]:
        if not page["elements"]:
            issues.append("Both card sides need content.")
        for element in page["elements"]:
            geometry = [element[key] for key in ("x", "y", "w", "h")]
            if not all(math.isfinite(value) for value in geometry):
                issues.append("Card geometry must be finite.")
            elif (
                element["x"] < 0
                or element["y"] < 0
                or element["x"] + element["w"] > 86
                or element["y"] + element["h"] > 54
            ):
                issues.append("Elements must fit within the 86 × 54 mm card.")
            if element["type"] == "text":
                content = element.get("content")
                style = element.get("style")
                if not isinstance(content, str) or not isinstance(style, dict):
                    issues.append("Text requires content and a style.")
                    continue
                font_size = style.get("fontSize")
                if (
                    not isinstance(font_size, (int, float))
                    or isinstance(font_size, bool)
                    or not math.isfinite(font_size)
                    or not 1 <= font_size <= 100
                ):
                    issues.append("Text needs a valid font size.")
                for token in TOKEN_PATTERN.findall(content):
                    if token not in STUDENT_FIELDS:
                        issues.append(f"Unsupported student field: {token}.")
                if "{{" in TOKEN_PATTERN.sub("", element.get("content", "")):
                    issues.append("Invalid field syntax in text.")
            elif element["type"] == "image":
                if element.get("src") not in IMAGE_SOURCES:
                    issues.append(
                        "Only institute logos and student photos are allowed on live cards."
                    )
            elif element["type"] == "qr":
                if element.get("encode") != "document-number":
                    issues.append("Student cards only support internal identifier QR codes.")
            elif element["type"] in {"table", "totals"}:
                issues.append("Tables and totals are not available for student cards.")
            elif element["type"] == "signature":
                label = element.get("label")
                if not isinstance(label, str) or "{{" in label:
                    issues.append("Signatures require a static text label.")
    background = layout.get("page", {}).get("background")
    if not isinstance(background, str):
        issues.append("External card backgrounds are not supported.")
    watermark = layout.get("watermark", {})
    if watermark.get("enabled"):
        if watermark.get("mode") != "text":
            issues.append("Only static text watermarks are supported on student cards.")
        if not isinstance(watermark.get("text"), str) or "{{" in watermark.get("text", ""):
            issues.append("Watermarks require static text.")
    if layout.get("zones", {}).get("hideHeaderOnFirstPage"):
        issues.append("Card sides cannot hide header elements.")
    return list(dict.fromkeys(issues))


def required_fields(layout):
    return {
        token
        for page in layout["pages"]
        for element in page["elements"]
        if element["type"] == "text"
        for token in TOKEN_PATTERN.findall(element.get("content", ""))
    } | {"student_name", "student_id", "school_name"}


def asset_read_url(asset):
    if asset.storage_provider == "R2":
        return (
            R2StorageProvider()
            .create_read_grant(
                bucket=asset.container_name,
                key=asset.blob_name,
                expires_in=300,
                content_disposition="inline",
            )
            .url
        )
    if asset.storage_provider == "AZURE":
        return read_url(asset)
    raise FileStorageError("Unsupported image storage provider.")


def resolve_id_cards(request, version, student_ids):
    layout = version.layout
    issues = layout_issues(layout)
    institute = request.institute
    queryset = Student.objects.filter(institute=institute, id__in=student_ids).select_related(
        "branch"
    )
    if request.institute_membership.branch_id:
        queryset = queryset.filter(branch_id=request.institute_membership.branch_id)
    students = {str(student.id): student for student in queryset}
    enrollments = {
        str(enrollment.student_id): enrollment
        for enrollment in StudentEnrollment.objects.filter(
            student_id__in=[student.id for student in students.values()],
            left_at__isnull=True,
            academic_year__is_current=True,
            academic_year__institute=institute,
            class_section__branch__institute=institute,
        ).select_related("class_section__grade", "academic_year")
    }
    photos = {}
    logo = (
        FileAsset.objects.filter(
            institute=institute,
            owner_type=FileAsset.OwnerType.INSTITUTE,
            owner_id=institute.id,
            asset_type=FileAsset.AssetType.LOGO,
            status=FileAsset.Status.ACTIVE,
        )
        .order_by("-created_at")
        .first()
    )
    logo_url = None
    if logo:
        try:
            logo_url = asset_read_url(logo)
        except (FileStorageError, StorageError):
            pass
    photo_assets = FileAsset.objects.filter(
        institute=institute,
        owner_type=FileAsset.OwnerType.STUDENT,
        owner_id__in=[student.id for student in students.values()],
        asset_type=FileAsset.AssetType.PROFILE_PHOTO,
        status=FileAsset.Status.ACTIVE,
    ).order_by("-created_at")
    for asset in photo_assets:
        photos.setdefault(str(asset.owner_id), asset)

    school_address = ", ".join(
        filter(
            None,
            [
                institute.address_line_1,
                institute.address_line_2,
                ", ".join(filter(None, [institute.city, institute.state, institute.postal_code])),
                institute.country,
            ],
        )
    )
    school = {
        "school_name": institute.display_name or institute.name,
        "school_address": school_address,
        "school_phone": institute.primary_phone,
        "school_email": institute.primary_email,
    }
    needs_logo = any(
        element["type"] == "image" and element.get("src") == "institute-logo"
        for page in layout["pages"]
        for element in page["elements"]
    )
    needs_photo = any(
        element["type"] == "image" and element.get("src") == "student-photo"
        for page in layout["pages"]
        for element in page["elements"]
    )
    fields = required_fields(layout)
    rows = []
    for student_id in student_ids:
        student = students.get(str(student_id))
        if not student or not student.is_active or not student.branch.is_active:
            rows.append(
                {
                    "studentId": str(student_id),
                    "issues": ["Student is missing, inactive or outside your branch."],
                    "missingPhoto": False,
                }
            )
            continue
        enrollment = enrollments.get(str(student_id))
        roll = (
            enrollment.roll_number
            if enrollment and not enrollment.roll_number.startswith("PENDING-")
            else ""
        )
        tokens = {
            **school,
            "student_name": student.full_name,
            "student_id": student.admission_number,
            "class_section": (
                f"{enrollment.class_section.grade.name} · {enrollment.class_section.section_name}"
                if enrollment
                else ""
            ),
            "roll_no": roll,
            "academic_year": enrollment.academic_year.name if enrollment else "",
        }
        student_issues = [
            f"Missing {field.replace('_', ' ')}."
            for field in sorted(fields)
            if not tokens.get(field, "").strip()
        ]
        if issues:
            student_issues.extend(issues)
        if needs_logo and not logo_url:
            student_issues.append(
                "Upload an accessible institute logo or remove its image element."
            )
        asset = photos.get(str(student_id))
        photo_url = None
        if asset and needs_photo:
            try:
                photo_url = asset_read_url(asset)
            except (FileStorageError, StorageError):
                student_issues.append("Student photo is unavailable.")
        rows.append(
            {
                "studentId": str(student_id),
                "name": student.full_name,
                "admissionNumber": student.admission_number,
                "branchName": student.branch.name,
                "issues": student_issues,
                "missingPhoto": needs_photo and not asset,
                "tokens": tokens,
                "images": {"student-photo": photo_url, "institute-logo": logo_url},
                "sourceRevision": ":".join(
                    [
                        str(student.updated_at),
                        str(student.branch.updated_at),
                        str(enrollment.updated_at) if enrollment else "",
                        str(asset.id) if asset and needs_photo else "",
                        str(asset.updated_at) if asset and needs_photo else "",
                        str(logo.id) if logo and needs_logo else "",
                        str(logo.updated_at) if logo and needs_logo else "",
                    ]
                ),
            }
        )
    return rows


def batch_fingerprint(version, rows):
    snapshot = {
        "version": str(version.id),
        "students": [{key: value for key, value in row.items() if key != "images"} for row in rows],
    }
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
