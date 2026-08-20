from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


class FileOwnerNotFound(LookupError):
    pass


@dataclass(frozen=True, slots=True)
class FileOwnerScope:
    owner_type: str
    owner_id: UUID
    institute_id: UUID
    branch_id: UUID | None
    active: bool


def resolve_file_owner(*, owner_type: str, owner_id: UUID, institute_id: UUID) -> FileOwnerScope:
    """Public, metadata-only owner lookup used by the file domain."""
    normalized = owner_type.upper()
    if normalized == "STUDENT":
        from modules.people.models import Student

        owner = Student.objects.filter(id=owner_id, institute_id=institute_id).first()
        if owner:
            return FileOwnerScope(
                normalized, owner.id, owner.institute_id, owner.branch_id, owner.is_active
            )
    elif normalized in {"STAFF", "TEACHER"}:
        from modules.institutes.models import InstituteMembership
        from modules.people.models import StaffProfile

        owner = StaffProfile.objects.filter(id=owner_id, institute_id=institute_id).first()
        if owner:
            membership = (
                InstituteMembership.objects.filter(
                    user_id=owner.user_id,
                    institute_id=institute_id,
                    is_active=True,
                    branch_id__isnull=False,
                )
                .order_by("created_at")
                .first()
            )
            return FileOwnerScope(
                "STAFF",
                owner.id,
                owner.institute_id,
                membership.branch_id if membership else None,
                True,
            )
    elif normalized == "INSTITUTE":
        from modules.institutes.models import Institute

        owner = Institute.objects.filter(id=owner_id).filter(id=institute_id).first()
        if owner:
            return FileOwnerScope(normalized, owner.id, owner.id, None, True)
    elif normalized in {"CLASS", "SUBJECT", "TERM"}:
        from modules.academics.models import AcademicTerm, Grade, Subject

        model = {"CLASS": Grade, "SUBJECT": Subject, "TERM": AcademicTerm}[normalized]
        lookup = {"id": owner_id}
        if normalized == "TERM":
            lookup["academic_year__institute_id"] = institute_id
        else:
            lookup["institute_id"] = institute_id
        owner = model.objects.filter(**lookup).first()
        if owner:
            resolved_institute_id = (
                owner.academic_year.institute_id if normalized == "TERM" else owner.institute_id
            )
            return FileOwnerScope(
                normalized,
                owner.id,
                resolved_institute_id,
                getattr(owner, "branch_id", None),
                getattr(owner, "is_active", True),
            )
    raise FileOwnerNotFound("The file owner does not exist in this scope.")


def is_linked_guardian(*, user_id: UUID, student_id: UUID, institute_id: UUID) -> bool:
    from modules.people.models import StudentGuardian

    return StudentGuardian.objects.filter(
        parent__user_id=user_id,
        parent__institute_id=institute_id,
        student_id=student_id,
        student__institute_id=institute_id,
        student__is_active=True,
    ).exists()
