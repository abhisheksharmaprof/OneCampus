"""Idempotently enrich the approved Main Campus with clearly synthetic demo data."""

from __future__ import annotations

import base64
import hashlib
import io
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from PIL import Image, ImageDraw

from modules.academics.models import AcademicYear, ClassSection, ClassSubject, Room
from modules.file_storage.models import FileAsset
from modules.file_storage.services.uploads import complete_upload, initiate_upload
from modules.file_storage.storage import get_storage_provider
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.contracts import FileOwnerScope
from modules.people.models import ParentProfile, StaffProfile, Student, StudentGuardian


INSTITUTE_ID = "cfb96f97-83e3-480a-8731-1278f3e4ce12"
BRANCH_ID = "73109924-45b0-4f52-9eaf-a994ab070447"
ROOMS = (
    ("Physics Laboratory", "LAB", 24, ["Optics kits", "Basic circuits"]),
    ("Chemistry Laboratory", "LAB", 24, ["Lab benches", "Safety equipment"]),
    ("Biology Laboratory", "LAB", 24, ["Microscopes", "Specimen models"]),
    ("Computer Laboratory", "LAB", 30, ["Computers", "Projector"]),
    ("General Science Laboratory", "LAB", 24, ["Science kits", "Lab benches"]),
    ("Library", "LIBRARY", 40, ["Bookshelves", "Reading tables"]),
    ("Multipurpose Hall", "HALL", 120, ["Projector", "Sound system"]),
    ("Sports Court", "SPORTS", 40, ["Sports equipment"]),
    ("Music Room", "MUSIC", 24, ["Keyboard", "Percussion instruments"]),
    ("Art Room", "ART", 24, ["Drawing boards", "Art supplies"]),
    ("Staff Room", "OTHER", 30, ["Work desks", "Staff lockers"]),
    ("Admin Office", "OFFICE", 8, ["Work desks"]),
    ("First Aid Room", "OTHER", 4, ["First aid kit"]),
)
LAB_SUBJECTS = {
    "physics": "Physics Laboratory",
    "chemistry": "Chemistry Laboratory",
    "biology": "Biology Laboratory",
    "computer science": "Computer Laboratory",
    "computer applications": "Computer Laboratory",
    "science": "General Science Laboratory",
}
AVATAR_BACKGROUNDS = ("#E9F2FF", "#FFF1E8", "#EBF7EF", "#F5EDFF", "#FFF8DB", "#E7F7F7")
AVATAR_SHIRTS = ("#3156A3", "#0E766E", "#9D4B38", "#6B4FA1", "#35734E", "#475569")


def make_demo_avatar(seed: str) -> bytes:
    """Draw an obviously illustrated, non-photographic avatar deterministically."""
    value = int(hashlib.sha256(seed.encode()).hexdigest()[:8], 16)
    image = Image.new("RGB", (320, 320), AVATAR_BACKGROUNDS[value % len(AVATAR_BACKGROUNDS)])
    draw = ImageDraw.Draw(image)
    skin = ("#E7B995", "#CF9876", "#F0C7A1", "#A96F53")[(value >> 4) % 4]
    shirt = AVATAR_SHIRTS[(value >> 8) % len(AVATAR_SHIRTS)]
    hair = ("#332A26", "#49342B", "#202B3A", "#5D4436")[(value >> 12) % 4]
    # Simple vector-like shoulders, face, hair and facial marks; never photorealistic.
    draw.ellipse((38, 188, 282, 430), fill=shirt)
    draw.rounded_rectangle((138, 174, 182, 226), radius=18, fill=skin)
    draw.ellipse((83, 47, 237, 220), fill=skin)
    draw.pieslice((78, 33, 242, 189), 180, 360, fill=hair)
    draw.ellipse((126, 126, 137, 137), fill="#253047")
    draw.ellipse((184, 126, 195, 137), fill="#253047")
    draw.arc((139, 137, 182, 170), start=15, end=165, fill="#754A3C", width=4)
    # Small corner mark communicates demo art when the avatar is viewed closely.
    draw.rounded_rectangle((253, 264, 300, 301), radius=10, fill="#FFFFFF")
    draw.text((260, 273), "DEMO", fill="#42536C")
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def upload_demo_photo(*, actor, institute, owner_type: str, owner_id, branch_id, seed: str) -> None:
    data = make_demo_avatar(seed)
    sha256 = hashlib.sha256(data).hexdigest()
    md5 = base64.b64encode(hashlib.md5(data).digest()).decode("ascii")
    owner = FileOwnerScope(owner_type, owner_id, institute.id, branch_id, True)
    payload = {
        "category": "PROFILE_PHOTO",
        "visibility": "PRIVATE",
        "originalFileName": f"demo-avatar-{seed[:8]}.png",
        "mediaType": "image/png",
        "sizeBytes": len(data),
        "sha256": sha256,
        "contentMd5": md5,
        "branchId": str(branch_id),
    }
    initiated = initiate_upload(
        actor=actor,
        institute=institute,
        owner=owner,
        idempotency_key=f"main-campus-demo-avatar-{owner_type.lower()}-{owner_id}",
        payload=payload,
    )
    provider = get_storage_provider()
    provider.put_if_absent(
        bucket=initiated.session.staging_bucket,
        key=initiated.session.staging_key,
        body=data,
        media_type="image/png",
        content_md5=md5,
    )
    complete_upload(upload_id=initiated.session.id, actor=actor, institute=institute)


class Command(BaseCommand):
    help = "Seed Main Campus with synthetic portraits, disabled demo guardians, and room assignments."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the demo data. Without this flag, only validate and print the scope.",
        )

    def handle(self, *args, **options):
        institute = Institute.objects.filter(id=INSTITUTE_ID, name="CampusOne Test Institute").first()
        branch = Branch.objects.filter(id=BRANCH_ID, name="Main Campus", institute_id=INSTITUTE_ID).first()
        if institute is None or branch is None:
            raise CommandError("The approved Main Campus institute/branch IDs did not match.")
        if "default_room_id" not in {
            column.name for column in connection.introspection.get_table_description(connection.cursor(), "class_sections")
        }:
            raise CommandError("Apply the academics migration before seeding room assignments.")
        students = list(Student.objects.filter(institute=institute, branch=branch, is_active=True))
        staff_profiles = list(
            StaffProfile.objects.filter(
                institute=institute,
                user__institute_memberships__institute=institute,
                user__institute_memberships__branch=branch,
                user__institute_memberships__role=InstituteMembership.Role.TEACHER,
                user__institute_memberships__is_active=True,
            ).distinct()
        )
        sections = list(ClassSection.objects.filter(branch=branch).select_related("grade", "default_room"))
        if not options["apply"]:
            self.stdout.write(
                f"Validated Main Campus only: {len(students)} active students, "
                f"{len(staff_profiles)} teachers, {len(sections)} sections. "
                "Run again with --apply to seed synthetic data."
            )
            return

        actor = User.objects.filter(
            institute_memberships__institute=institute,
            institute_memberships__role=InstituteMembership.Role.INSTITUTE_ADMIN,
            institute_memberships__is_active=True,
            is_active=True,
        ).order_by("created_at").first()
        if actor is None:
            raise CommandError("An active institute administrator is required to record the uploads.")

        rooms: dict[str, Room] = {}
        for section in sections:
            name = f"Demo · {section.grade.name} {section.section_name} Classroom"
            room, _ = Room.objects.get_or_create(
                branch=branch,
                name=name,
                defaults={"institute": institute, "room_type": "CLASSROOM", "capacity": 30, "floor": 1, "equipment": ["Student desks", "Whiteboard"]},
            )
            rooms[name] = room
            if section.default_room_id is None:
                section.default_room = room
                section.save(update_fields=("default_room", "updated_at"))

        for name, room_type, capacity, equipment in ROOMS:
            room, _ = Room.objects.get_or_create(
                branch=branch,
                name=f"Demo · {name}",
                defaults={"institute": institute, "room_type": room_type, "capacity": capacity, "floor": 1, "equipment": equipment},
            )
            rooms[name] = room

        for mapping in ClassSubject.objects.filter(institute=institute, grade__sections__branch=branch).select_related("subject"):
            lab_name = LAB_SUBJECTS.get(mapping.subject.name.strip().casefold())
            if lab_name and mapping.room_id is None:
                mapping.is_lab = True
                mapping.room = rooms[lab_name]
                mapping.save(update_fields=("is_lab", "room", "updated_at"))

        parent_count = 0
        for student in students:
            if StudentGuardian.objects.filter(student=student).exists():
                continue
            suffix = student.id.hex[:12]
            email = f"demo-parent-{suffix}@example.test"
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "first_name": "Demo Guardian",
                    "last_name": f"{suffix[-4:]}",
                    "phone": "",
                    "user_type": "PARENT",
                    "is_active": False,
                    "otp_required": True,
                },
            )
            if created:
                user.set_unusable_password()
                user.save(update_fields=("password",))
            elif user.is_active or not user.otp_required or user.has_usable_password():
                user.is_active = False
                user.otp_required = True
                user.set_unusable_password()
                user.save(update_fields=("is_active", "otp_required", "password", "updated_at"))
            profile, _ = ParentProfile.objects.get_or_create(institute=institute, user=user)
            StudentGuardian.objects.get_or_create(
                parent=profile,
                student=student,
                defaults={"relationship": StudentGuardian.Relationship.GUARDIAN, "is_primary_contact": True},
            )
            membership, _ = InstituteMembership.objects.get_or_create(
                user=user,
                institute=institute,
                role=InstituteMembership.Role.PARENT,
                branch=None,
                defaults={"is_active": False},
            )
            if membership.is_active:
                membership.is_active = False
                membership.save(update_fields=("is_active", "updated_at"))
            parent_count += 1

        photo_count = 0
        for student in students:
            if FileAsset.objects.filter(
                institute=institute, owner_type=FileAsset.OwnerType.STUDENT, owner_id=student.id,
                asset_type=FileAsset.AssetType.PROFILE_PHOTO, status=FileAsset.Status.ACTIVE,
            ).exists():
                continue
            upload_demo_photo(actor=actor, institute=institute, owner_type="STUDENT", owner_id=student.id, branch_id=branch.id, seed=str(student.id))
            photo_count += 1
        for profile in staff_profiles:
            if FileAsset.objects.filter(
                institute=institute, owner_type=FileAsset.OwnerType.STAFF, owner_id=profile.id,
                asset_type=FileAsset.AssetType.PROFILE_PHOTO, status=FileAsset.Status.ACTIVE,
            ).exists():
                continue
            membership = InstituteMembership.objects.filter(
                user_id=profile.user_id, institute=institute, branch=branch,
                role=InstituteMembership.Role.TEACHER, is_active=True,
            ).first()
            if membership is None:
                continue
            upload_demo_photo(actor=actor, institute=institute, owner_type="STAFF", owner_id=profile.id, branch_id=branch.id, seed=str(profile.id))
            photo_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"Main Campus demo seed complete: {photo_count} missing portraits uploaded, "
            f"{parent_count} disabled synthetic guardian links created, "
            f"{len(rooms)} demo rooms available, {len(sections)} class sections checked."
        ))
