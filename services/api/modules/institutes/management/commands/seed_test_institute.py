from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from modules.academics.models import (
    AcademicYear,
    ClassSection,
    ClassSubject,
    Grade,
    StudentEnrollment,
    Subject,
    SubjectTeacherAssignment,
)
from modules.identity.models import User
from modules.institutes.models import (
    Branch,
    Institute,
    InstituteAssociation,
    InstituteMembership,
)
from modules.people.models import StaffProfile, Student

CLASS_SUBJECTS = {
    "Nursery": [
        "English",
        "Mathematics",
        "Environmental Studies",
        "General Knowledge",
        "Art & Craft",
        "Music",
        "Physical Education",
    ],
    "LKG": [
        "English",
        "Mathematics",
        "Environmental Studies",
        "General Knowledge",
        "Art & Craft",
        "Music",
        "Physical Education",
    ],
    "UKG": [
        "English",
        "Hindi",
        "Mathematics",
        "Environmental Studies",
        "General Knowledge",
        "Art & Craft",
        "Music",
        "Physical Education",
    ],
    **{
        f"Class {grade}": [
            "English",
            "Hindi",
            "Mathematics",
            "Environmental Studies",
            "Computer Science",
            "General Knowledge",
            "Art & Craft",
            "Music",
            "Physical Education",
        ]
        for grade in range(1, 6)
    },
    **{
        f"Class {grade}": [
            "English",
            "Hindi",
            "Mathematics",
            "Science",
            "Social Science",
            "Computer Science",
            "Sanskrit",
            "Art & Craft",
            "Physical Education",
        ]
        for grade in range(6, 9)
    },
    **{
        f"Class {grade}": [
            "English",
            "Hindi",
            "Mathematics",
            "Science",
            "Social Science",
            "Computer Applications",
            "Physical Education",
        ]
        for grade in (9, 10)
    },
    "Class 11": [
        "English",
        "Physics",
        "Chemistry",
        "Mathematics",
        "Biology",
        "Computer Science",
        "Economics",
        "Accountancy",
        "Business Studies",
        "History",
        "Political Science",
        "Geography",
        "Physical Education",
    ],
    "Class 12": [
        "English",
        "Physics",
        "Chemistry",
        "Mathematics",
        "Biology",
        "Computer Science",
        "Economics",
        "Accountancy",
        "Business Studies",
        "History",
        "Political Science",
        "Geography",
        "Physical Education",
    ],
}

SUBJECT_CODES = {
    name: f"{index:03d}"
    for index, name in enumerate(
        sorted({subject for subjects in CLASS_SUBJECTS.values() for subject in subjects}), start=1
    )
}

TEACHER_NAMES = [
    ("Aarav", "Sharma"),
    ("Aditi", "Verma"),
    ("Arjun", "Mehta"),
    ("Ananya", "Iyer"),
    ("Vikram", "Kapoor"),
    ("Priya", "Nair"),
    ("Rohan", "Gupta"),
    ("Sneha", "Reddy"),
    ("Karan", "Joshi"),
    ("Neha", "Malhotra"),
    ("Rahul", "Bansal"),
    ("Ishita", "Saxena"),
    ("Aditya", "Chopra"),
    ("Meera", "Pillai"),
    ("Nikhil", "Desai"),
    ("Kavya", "Rao"),
    ("Siddharth", "Mishra"),
    ("Pooja", "Sethi"),
    ("Manish", "Arora"),
    ("Ritu", "Agarwal"),
    ("Varun", "Singh"),
    ("Simran", "Kaur"),
    ("Abhishek", "Das"),
    ("Divya", "Menon"),
    ("Harsh", "Patel"),
    ("Nandini", "Kulkarni"),
    ("Mohit", "Bhatt"),
    ("Sakshi", "Yadav"),
    ("Vivek", "Tiwari"),
    ("Tanya", "Suri"),
]


class Command(BaseCommand):
    help = "Create or update a complete, repeatable test institute dataset."

    def add_arguments(self, parser):
        parser.add_argument("--institute-code", default="CAMPUSONE-TEST")
        parser.add_argument("--teacher-password", default="TestTeacher123!")
        parser.add_argument("--admin-password", default="TestAdmin123!")

    @transaction.atomic
    def handle(self, *args, **options):
        institute, _ = Institute.objects.get_or_create(
            code=options["institute_code"].strip().upper(),
            defaults={
                "name": "CampusOne Test Institute",
                "display_name": "CampusOne Test Institute",
                "institute_type": "School",
                "medium_of_instruction": "English",
            },
        )
        branch, _ = Branch.objects.get_or_create(
            institute=institute,
            code="MAIN",
            defaults={"name": "Main Campus", "is_head_office": True},
        )
        # These are autonomous institutes at distinct locations.  They are
        # linked as peers for discovery only; none of their records join the
        # test institute's tenant scope.
        peer_specs = (
            {
                "code": "CAMPUSONE-NOIDA",
                "name": "Horizon Public School, Noida",
                "display_name": "Horizon Noida",
                "city": "Noida",
                "state": "Uttar Pradesh",
                "primary_email": "office@horizon-noida.test",
                "primary_phone": "+91 120 400 1200",
            },
            {
                "code": "CAMPUSONE-PUNE",
                "name": "Riverdale Learning Academy, Pune",
                "display_name": "Riverdale Pune",
                "city": "Pune",
                "state": "Maharashtra",
                "primary_email": "hello@riverdale-pune.test",
                "primary_phone": "+91 20 4100 8800",
            },
        )
        for peer_defaults in peer_specs:
            peer, _ = Institute.objects.get_or_create(
                code=peer_defaults["code"], defaults=peer_defaults
            )
            Branch.objects.get_or_create(
                institute=peer,
                code="MAIN",
                defaults={"name": "Main Campus", "is_head_office": True},
            )
            InstituteAssociation.link(institute, peer)
        year, _ = AcademicYear.objects.get_or_create(
            institute=institute,
            name="2026-27",
            defaults={
                "start_date": date(2026, 4, 1),
                "end_date": date(2027, 3, 31),
                "is_current": True,
            },
        )
        if not year.is_current:
            AcademicYear.objects.filter(institute=institute, is_current=True).update(
                is_current=False
            )
            year.is_current = True
            year.save(update_fields=("is_current", "updated_at"))

        teacher_specs = [
            (f"teacher{index:02d}@campusone-test.local", first_name, last_name, index)
            for index, (first_name, last_name) in enumerate(TEACHER_NAMES, start=1)
        ]
        account_emails = [email for email, _, _, _ in teacher_specs] + [
            "admin@campusone-test.local"
        ]
        users = {user.email: user for user in User.objects.filter(email__in=account_emails)}
        new_users = []
        for email, first_name, last_name, _ in teacher_specs:
            if email not in users:
                user = User(
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    user_type="teacher",
                )
                user.set_password(options["teacher_password"])
                new_users.append(user)
        if "admin@campusone-test.local" not in users:
            admin = User(
                email="admin@campusone-test.local",
                first_name="Test",
                last_name="Administrator",
                user_type="admin",
            )
            admin.set_password(options["admin_password"])
            new_users.append(admin)
        User.objects.bulk_create(new_users, batch_size=100)
        users.update({user.email: user for user in User.objects.filter(email__in=account_emails)})

        teachers = [users[email] for email, _, _, _ in teacher_specs]
        existing_profiles = set(
            StaffProfile.objects.filter(institute=institute, user__in=teachers).values_list(
                "user_id", flat=True
            )
        )
        StaffProfile.objects.bulk_create(
            [
                StaffProfile(
                    institute=institute,
                    user=users[email],
                    employee_code=f"T{index:03d}",
                    invite_pending=False,
                )
                for email, _, _, index in teacher_specs
                if users[email].id not in existing_profiles
            ],
            batch_size=100,
        )
        existing_memberships = set(
            InstituteMembership.objects.filter(
                institute=institute, branch=branch, role=InstituteMembership.Role.TEACHER
            ).values_list("user_id", flat=True)
        )
        InstituteMembership.objects.bulk_create(
            [
                InstituteMembership(
                    user=users[email],
                    institute=institute,
                    branch=branch,
                    role=InstituteMembership.Role.TEACHER,
                    is_active=True,
                )
                for email, _, _, _ in teacher_specs
                if users[email].id not in existing_memberships
            ],
            batch_size=100,
        )
        admin = users["admin@campusone-test.local"]
        if not InstituteMembership.objects.filter(
            user=admin,
            institute=institute,
            branch__isnull=True,
            role=InstituteMembership.Role.INSTITUTE_ADMIN,
        ).exists():
            InstituteMembership.objects.create(
                user=admin,
                institute=institute,
                branch=None,
                role=InstituteMembership.Role.INSTITUTE_ADMIN,
                is_active=True,
            )

        subjects = {}
        for name, code in SUBJECT_CODES.items():
            subjects[name], _ = Subject.objects.get_or_create(
                institute=institute, name=name, defaults={"subject_code": f"SUB-{code}"}
            )

        class_subject_rows = []
        section_rows = []
        for class_number, (class_name, subject_names) in enumerate(CLASS_SUBJECTS.items(), start=1):
            grade, _ = Grade.objects.get_or_create(
                institute=institute, name=class_name, defaults={"sort_order": class_number}
            )
            section, _ = ClassSection.objects.get_or_create(
                branch=branch,
                grade=grade,
                academic_year=year,
                section_name="All Students",
                defaults={
                    "class_teacher": teachers[(class_number - 1) % len(teachers)],
                    "max_strength": 10,
                },
            )
            for subject_order, subject_name in enumerate(subject_names, start=1):
                class_subject_rows.append(
                    ClassSubject(
                        institute=institute,
                        grade=grade,
                        subject=subjects[subject_name],
                        sort_order=subject_order,
                        periods_per_week=4,
                    )
                )
            section_rows.append((class_number, section, subject_names))

        existing_class_subjects = {
            (row.grade_id, row.subject_id): row
            for row in ClassSubject.objects.filter(institute=institute)
        }
        ClassSubject.objects.bulk_create(
            [
                row
                for row in class_subject_rows
                if (row.grade_id, row.subject_id) not in existing_class_subjects
            ],
            batch_size=100,
        )

        for class_number, section, subject_names in section_rows:
            for subject_order, subject_name in enumerate(subject_names, start=1):
                subject = subjects[subject_name]
                if SubjectTeacherAssignment.objects.filter(
                    class_sections=section, subject=subject
                ).exists():
                    continue
                assignment = SubjectTeacherAssignment.objects.create(
                    subject=subject,
                    teacher=teachers[(subject_order + class_number - 2) % len(teachers)],
                )
                assignment.class_sections.add(section)

        student_rows = []
        enrollment_keys = []
        class_names = list(CLASS_SUBJECTS.keys())
        for class_number, section, _ in section_rows:
            for student_number in range(1, 11):
                admission_number = f"TEST-{class_number:02d}-{student_number:02d}"
                # The first three entries are Nursery/LKG/UKG. Naming students
                # from the loop number made Class 3 students appear as
                # "Class6 Student" even though their enrollment was correct.
                class_name = class_names[class_number - 1]
                student_label = class_name.replace(" ", "")
                student_rows.append(
                    Student(
                        institute=institute,
                        branch=branch,
                        admission_number=admission_number,
                        first_name=f"{student_label} Student",
                        last_name=f"{student_number:02d}",
                    )
                )
                enrollment_keys.append((admission_number, section, f"{student_number:02d}"))

        admissions = [row.admission_number for row in student_rows]
        existing_students = {
            row.admission_number: row
            for row in Student.objects.filter(institute=institute, admission_number__in=admissions)
        }
        Student.objects.bulk_create(
            [row for row in student_rows if row.admission_number not in existing_students],
            batch_size=100,
        )
        existing_students.update(
            {
                row.admission_number: row
                for row in Student.objects.filter(
                    institute=institute,
                    admission_number__in=admissions,
                )
            }
        )
        # Keep an existing test institute idempotent while repairing labels
        # created by older versions of this seed command.
        for class_number, section, _ in section_rows:
            class_name = class_names[class_number - 1]
            student_label = class_name.replace(" ", "")
            for student_number in range(1, 11):
                student = existing_students[f"TEST-{class_number:02d}-{student_number:02d}"]
                student.first_name = f"{student_label} Student"
                student.last_name = f"{student_number:02d}"
        Student.objects.bulk_update(list(existing_students.values()), ["first_name", "last_name"])
        existing_enrollments = set(
            StudentEnrollment.objects.filter(
                academic_year=year, student__in=existing_students.values()
            ).values_list("student_id", "class_section_id")
        )
        StudentEnrollment.objects.bulk_create(
            [
                StudentEnrollment(
                    student=existing_students[admission_number],
                    class_section=section,
                    academic_year=year,
                    roll_number=roll_number,
                )
                for admission_number, section, roll_number in enrollment_keys
                if (existing_students[admission_number].id, section.id) not in existing_enrollments
            ],
            batch_size=100,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Test institute ready: {institute.code}; "
                f"classes={len(CLASS_SUBJECTS)}, teachers={len(teachers)}, "
                f"students={len(student_rows)}."
            )
        )
        self.stdout.write("Admin: admin@campusone-test.local / TestAdmin123!")
        self.stdout.write("Teacher passwords: TestTeacher123!")
