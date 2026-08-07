"""Seed two independently-operated, associated Indian school demo tenants.

This command deliberately uses only tenant-owned records.  The relationship
between the two schools is an InstituteAssociation for discovery; it does not
make either school a parent of the other or share their operational data.
"""

from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth.hashers import make_password
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
from modules.admin_console.models import AdminRecord
from modules.admin_console.registry import SCREENS
from modules.admissions.models import Enquiry
from modules.attendance.models import AttendanceSettings, StaffAttendance, StudentAttendance
from modules.finance.models import FeeInvoice, FeePayment
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteAssociation, InstituteMembership
from modules.people.models import ParentProfile, StaffProfile, Student, StudentGuardian
from modules.school_calendar.models import AcademicCalendarEvent

SCHOOLS = (
    {
        "code": "CAMPUSONE-NOIDA",
        "name": "Horizon Public School, Noida",
        "display_name": "Horizon Public School",
        "city": "Noida",
        "state": "Uttar Pradesh",
        "address": "B-47, Sector 62",
        "postal_code": "201309",
        "email": "office@horizon-noida.test",
        "phone": "+91 120 400 1200",
        "website": "https://horizon-noida.example.test",
        "principal": "Dr. Meenakshi Sethi",
        "branch_name": "Sector 62 Campus",
        "branch_code": "SEC62",
        "grades": ("Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6"),
    },
    {
        "code": "CAMPUSONE-PUNE",
        "name": "Riverdale Learning Academy, Pune",
        "display_name": "Riverdale Learning Academy",
        "city": "Pune",
        "state": "Maharashtra",
        "address": "Survey No. 18, Baner Road",
        "postal_code": "411045",
        "email": "hello@riverdale-pune.test",
        "phone": "+91 20 4100 8800",
        "website": "https://riverdale-pune.example.test",
        "principal": "Mrs. Kavita Deshmukh",
        "branch_name": "Baner Campus",
        "branch_code": "BANER",
        "grades": ("Class 1", "Class 2", "Class 3", "Class 4", "Class 5", "Class 6"),
    },
)

SUBJECTS = ("English", "Hindi", "Mathematics", "Science", "Social Science", "Computer Science")
STUDENT_FIRST_NAMES = (
    "Aarav",
    "Ananya",
    "Vihaan",
    "Myra",
    "Arjun",
    "Kavya",
    "Ishaan",
    "Diya",
    "Reyansh",
    "Aadhya",
    "Krish",
    "Navya",
)
LAST_NAMES = (
    "Sharma",
    "Verma",
    "Singh",
    "Gupta",
    "Iyer",
    "Nair",
    "Reddy",
    "Patel",
    "Kulkarni",
    "Kaur",
    "Mishra",
    "Das",
)
TEACHERS = (
    ("Anjali", "Sharma"),
    ("Rohit", "Mehra"),
    ("Pallavi", "Iyer"),
    ("Nitin", "Gupta"),
    ("Shreya", "Nair"),
    ("Amit", "Kulkarni"),
    ("Divya", "Reddy"),
    ("Sandeep", "Bhat"),
    ("Neha", "Saxena"),
    ("Vivek", "Patil"),
    ("Pooja", "Malhotra"),
    ("Karthik", "Rao"),
)


class Command(BaseCommand):
    help = "Create repeatable, realistic demo data for two independent associated institutes."

    def add_arguments(self, parser):
        parser.add_argument("--password", default="DemoSchool123!")

    @transaction.atomic
    def handle(self, *args, **options):
        self._password_hash = make_password(options["password"])
        # This command owns its two demo tenants.  It intentionally does not call
        # the broad legacy seed, keeping a clean local demo fast and deterministic.
        schools = []
        for spec in SCHOOLS:
            schools.append(self._seed_school(spec, options["password"]))
        InstituteAssociation.link(schools[0][0], schools[1][0])
        self.stdout.write(self.style.SUCCESS("Realistic demo data is ready for Noida and Pune."))
        self.stdout.write("Demo account password: DemoSchool123!")

    def _seed_school(self, spec, password):
        institute, _ = Institute.objects.get_or_create(
            code=spec["code"], defaults={"name": spec["name"]}
        )
        for field, value in {
            "name": spec["name"],
            "display_name": spec["display_name"],
            "institute_type": "Co-educational School",
            "board_affiliation": "CBSE",
            "board_affiliation_number": "2134XX",
            "udise_code": "0912XXXXXXX",
            "establishment_year": 2008,
            "medium_of_instruction": "English",
            "registered_entity_type": "Educational Trust",
            "registration_number": "TRUST/2008/184",
            "address_line_1": spec["address"],
            "city": spec["city"],
            "state": spec["state"],
            "country": "India",
            "postal_code": spec["postal_code"],
            "primary_email": spec["email"],
            "primary_phone": spec["phone"],
            "website_url": spec["website"],
            "contact_name": spec["principal"],
            "contact_designation": "Principal",
            "contact_phone": spec["phone"],
            "contact_email": spec["email"],
            "onboarding_status": Institute.OnboardingStatus.APPROVED,
        }.items():
            setattr(institute, field, value)
        institute.save()
        # The baseline command creates a Main Campus.  This demo campus replaces
        # it as the head office without ever treating it as a child branch.
        Branch.objects.filter(institute=institute, code="MAIN").exclude(
            code=spec["branch_code"]
        ).update(is_head_office=False)
        branch, _ = Branch.objects.update_or_create(
            institute=institute,
            code=spec["branch_code"],
            defaults={
                "name": spec["branch_name"],
                "is_head_office": True,
                "address_line_1": spec["address"],
                "city": spec["city"],
                "state": spec["state"],
                "country": "India",
                "postal_code": spec["postal_code"],
                "phone": spec["phone"],
                "email": spec["email"],
                "branch_admin_name": spec["principal"],
            },
        )
        # The baseline Main Campus record is retained for backward-compatible login tests.
        year, _ = AcademicYear.objects.get_or_create(
            institute=institute,
            name="2026-27",
            defaults={
                "start_date": date(2026, 4, 1),
                "end_date": date(2027, 3, 31),
                "is_current": True,
            },
        )
        AcademicYear.objects.filter(institute=institute).exclude(pk=year.pk).update(
            is_current=False
        )
        if not year.is_current:
            year.is_current = True
            year.save(update_fields=("is_current", "updated_at"))
        admin = self._user(
            f"principal@{spec['code'].lower()}.test",
            *spec["principal"].replace("Dr. ", "").replace("Mrs. ", "").split(maxsplit=1),
            "admin",
            password,
        )
        InstituteMembership.objects.get_or_create(
            user=admin,
            institute=institute,
            branch=None,
            role=InstituteMembership.Role.INSTITUTE_ADMIN,
            defaults={"is_active": True},
        )
        teachers = self._staff(institute, branch, spec["code"], password)
        subjects = {
            name: Subject.objects.get_or_create(
                institute=institute, name=name, defaults={"subject_code": f"SUB-{index:02d}"}
            )[0]
            for index, name in enumerate(SUBJECTS, 1)
        }
        sections = self._academics(institute, branch, year, spec["grades"], subjects, teachers)
        students = self._students(institute, branch, year, sections, spec["code"])
        self._parents(institute, students, spec["code"], password)
        self._attendance(institute, branch, students, teachers)
        self._finance(institute, branch, students)
        self._calendar(institute, branch)
        self._enquiries(institute, branch, spec["code"])
        AttendanceSettings.objects.update_or_create(
            institute=institute,
            defaults={
                "low_attendance_threshold": Decimal("75.0"),
                "enable_parent_notifications": True,
                "enable_auto_alerts": True,
                "consecutive_absent_threshold": 3,
                "enabled_capture_modes": ["manual", "biometric"],
            },
        )
        self._admin_records(institute, branch, admin, spec, sections, students)
        return institute, branch

    def _user(self, email, first, last, user_type, password):
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": first,
                "last_name": last,
                "user_type": user_type,
                "phone": "+91 98765 43210",
            },
        )
        if created and password:
            user.password = self._password_hash
            user.save(update_fields=("password",))
        return user

    def _staff(self, institute, branch, code, password):
        users = []
        for index, (first, last) in enumerate(TEACHERS, 1):
            user = self._user(
                f"{code.lower()}.teacher{index:02d}@example.test", first, last, "teacher", password
            )
            users.append(user)
            StaffProfile.objects.update_or_create(
                institute=institute,
                user=user,
                defaults={
                    "employee_code": f"{code[-4:]}-T{index:03d}",
                    "invite_pending": False,
                    "available_days": ["MON", "TUE", "WED", "THU", "FRI"],
                    "available_periods": [1, 2, 3, 4, 5, 6],
                    "max_periods_per_day": 6,
                    "max_periods_per_week": 30,
                    "availability_start_time": time(8, 0),
                    "availability_end_time": time(15, 0),
                },
            )
            InstituteMembership.objects.get_or_create(
                user=user,
                institute=institute,
                branch=branch,
                role=InstituteMembership.Role.TEACHER,
                defaults={"is_active": True},
            )
        return users

    def _academics(self, institute, branch, year, grade_names, subjects, teachers):
        sections = []
        for index, grade_name in enumerate(grade_names, 1):
            grade, _ = Grade.objects.get_or_create(
                institute=institute, name=grade_name, defaults={"sort_order": index}
            )
            for subject_index, subject in enumerate(subjects.values(), 1):
                ClassSubject.objects.get_or_create(
                    institute=institute,
                    grade=grade,
                    subject=subject,
                    defaults={
                        "sort_order": subject_index,
                        "periods_per_week": 5 if subject.name in {"English", "Mathematics"} else 3,
                        "default_max_marks": Decimal("100"),
                    },
                )
            section, _ = ClassSection.objects.get_or_create(
                branch=branch,
                grade=grade,
                academic_year=year,
                section_name="A",
                defaults={
                    "class_teacher": teachers[(index - 1) % len(teachers)],
                    "max_strength": 36,
                },
            )
            sections.append(section)
            for subject_index, subject in enumerate(subjects.values()):
                SubjectTeacherAssignment.objects.get_or_create(
                    class_section=section,
                    subject=subject,
                    defaults={"teacher": teachers[(index + subject_index - 1) % len(teachers)]},
                )
        return sections

    def _students(self, institute, branch, year, sections, code):
        students = []
        for section_index, section in enumerate(sections, 1):
            for student_index, first_name in enumerate(STUDENT_FIRST_NAMES, 1):
                last_name = LAST_NAMES[(student_index + section_index - 2) % len(LAST_NAMES)]
                admission = f"{code[-4:]}-26-{section_index:02d}{student_index:02d}"
                student, _ = Student.objects.update_or_create(
                    institute=institute,
                    admission_number=admission,
                    defaults={
                        "branch": branch,
                        "first_name": first_name,
                        "last_name": last_name,
                        "father_name": f"Rakesh {last_name}",
                        "mother_name": f"Sunita {last_name}",
                        "sr_number": f"SR-{admission}",
                        "date_of_birth": date(
                            2014 - section_index,
                            (student_index % 12) + 1,
                            min(student_index + 5, 28),
                        ),
                        "gender": "Female" if student_index % 2 == 0 else "Male",
                        "social_category": "General",
                        "religion": "Hindu",
                        "mother_tongue": "Hindi",
                        "rural_urban": "Urban",
                        "habitation_locality": f"{branch.city if hasattr(branch, 'city') else ''}",
                        "date_of_admission": date(2026, 4, 1),
                        "previous_class": f"Class {max(section_index - 1, 0)}",
                        "medium_of_instruction": "English",
                        "mobile_number": f"+91 98{section_index:02d}{student_index:06d}",
                        "email_address": f"{admission.lower()}@student.example.test",
                        "is_active": True,
                    },
                )
                StudentEnrollment.objects.get_or_create(
                    student=student,
                    academic_year=year,
                    defaults={"class_section": section, "roll_number": f"{student_index:02d}"},
                )
                students.append(student)
        return students

    def _parents(self, institute, students, code, password):
        for student in students:
            email = f"parent.{student.admission_number.lower()}@example.test"
            parent = self._user(
                email, student.father_name.split()[0], student.last_name, "parent", None
            )
            profile, _ = ParentProfile.objects.get_or_create(institute=institute, user=parent)
            StudentGuardian.objects.get_or_create(
                parent=profile,
                student=student,
                defaults={
                    "relationship": StudentGuardian.Relationship.FATHER,
                    "is_primary_contact": True,
                },
            )
            InstituteMembership.objects.get_or_create(
                user=parent,
                institute=institute,
                branch=student.branch,
                role=InstituteMembership.Role.PARENT,
                defaults={"is_active": True},
            )

    def _attendance(self, institute, branch, students, teachers):
        first_day = date(2026, 6, 1)
        school_days = [
            first_day + timedelta(days=offset)
            for offset in range(30)
            if (first_day + timedelta(days=offset)).weekday() != 6
        ]
        student_ids = [student.id for student in students]
        teacher_ids = [teacher.id for teacher in teachers]
        existing_student_keys = set(
            StudentAttendance.objects.filter(
                institute=institute,
                branch=branch,
                student_id__in=student_ids,
                date__in=school_days,
                period_id__isnull=True,
            ).values_list("student_id", "date")
        )
        existing_staff_keys = set(
            StaffAttendance.objects.filter(
                institute=institute,
                branch=branch,
                user_id__in=teacher_ids,
                date__in=school_days,
            ).values_list("user_id", "date")
        )
        student_records = []
        staff_records = []
        for offset in range(30):
            day = first_day + timedelta(days=offset)
            if day.weekday() == 6:
                continue
            for index, student in enumerate(students):
                status = (
                    "ABSENT"
                    if (index + offset) % 19 == 0
                    else ("LATE" if (index + offset) % 13 == 0 else "PRESENT")
                )
                if (student.id, day) not in existing_student_keys:
                    student_records.append(
                        StudentAttendance(
                            institute=institute,
                            branch=branch,
                            student=student,
                            date=day,
                            status=status,
                            capture_mode="biometric" if day.weekday() < 5 else "manual",
                            remark="Medical leave informed by parent" if status == "ABSENT" else "",
                        )
                    )
            for index, teacher in enumerate(teachers):
                status = "LATE" if (index + offset) % 17 == 0 else "PRESENT"
                if (teacher.id, day) not in existing_staff_keys:
                    staff_records.append(
                        StaffAttendance(
                            institute=institute,
                            branch=branch,
                            user=teacher,
                            date=day,
                            status=status,
                            remark="Traffic delay" if status == "LATE" else "",
                        )
                    )
        StudentAttendance.objects.bulk_create(student_records, batch_size=1000)
        StaffAttendance.objects.bulk_create(staff_records, batch_size=500)

    def _finance(self, institute, branch, students):
        for index, student in enumerate(students, 1):
            amount = Decimal("38500.00") + Decimal((index % 3) * 2500)
            invoice, _ = FeeInvoice.objects.get_or_create(
                institute=institute,
                branch=branch,
                student=student,
                due_date=date(2026, 6, 10),
                defaults={"amount": amount},
            )
            if index % 7:
                FeePayment.objects.get_or_create(
                    invoice=invoice, amount=amount if index % 5 else amount / 2
                )

    def _calendar(self, institute, branch):
        events = (
            ("International Yoga Day", "EVENT", date(2026, 6, 21), date(2026, 6, 21)),
            ("Monsoon Break", "HOLIDAY", date(2026, 6, 29), date(2026, 6, 30)),
            ("Quarterly Assessment", "EXAM", date(2026, 7, 20), date(2026, 7, 24)),
            ("Parent Teacher Meeting", "PTM", date(2026, 7, 25), date(2026, 7, 25)),
        )
        for title, event_type, starts_on, ends_on in events:
            AcademicCalendarEvent.objects.update_or_create(
                institute=institute,
                branch=branch,
                title=title,
                defaults={"event_type": event_type, "starts_on": starts_on, "ends_on": ends_on},
            )

    def _enquiries(self, institute, branch, code):
        for index, status in enumerate(
            ("ENQUIRY", "VISIT_SCHEDULED", "APPLIED", "ENROLLED", "LOST"), 1
        ):
            Enquiry.objects.get_or_create(
                institute=institute,
                branch=branch,
                guardian_name=f"{('Sanjay', 'Ritu', 'Farhan', 'Lakshmi', 'Manpreet')[index - 1]} {('Arora', 'Nair', 'Khan', 'Iyer', 'Kaur')[index - 1]}",
                defaults={
                    "contact_email": f"enquiry{index}.{code.lower()}@example.test",
                    "status": status,
                },
            )

    def _admin_records(self, institute, branch, admin, spec, sections, students):
        section_payload = [
            {
                "class": section.grade.name,
                "section": section.section_name,
                "teacher": section.class_teacher.get_full_name(),
                "students": 12,
            }
            for section in sections
        ]
        common = {
            "institute": spec["display_name"],
            "branch": branch.name,
            "city": spec["city"],
            "academicYear": "2026-27",
        }
        special = {
            "TT1": {
                "periods": [
                    {
                        "day": day,
                        "period": p,
                        "start": f"{8 + p:02d}:00",
                        "subject": SUBJECTS[(p - 1) % len(SUBJECTS)],
                    }
                    for day in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday")
                    for p in range(1, 7)
                ],
                "sections": section_payload,
            },
            "FN1": {
                "feeHeads": ["Tuition", "Annual charges", "Activity fee"],
                "termFee": "₹38,500–₹43,500",
            },
            "FN2": {"invoices": len(students), "collectionMonth": "June 2026", "currency": "INR"},
            "AC4": {
                "assessment": "Quarterly Assessment",
                "startsOn": "2026-07-20",
                "maximumMarks": 100,
            },
            "AO1": {"routes": ["Sector 62–Indirapuram", "Baner–Aundh"], "vehicles": 4},
            "AO2": {"books": 4280, "activeIssues": 164},
            "AO3": {"available": False, "note": "Day school; hostel services are not offered."},
            "RG5": {
                "associatedInstitutes": [
                    other["display_name"] for other in SCHOOLS if other["code"] != spec["code"]
                ]
            },
        }
        for screen in SCREENS:
            data = {
                **common,
                **special.get(screen.id, {}),
                "screenTitle": screen.title,
                "updatedForDemo": True,
            }
            AdminRecord.objects.update_or_create(
                institute=institute,
                branch=branch,
                screen_id=screen.id,
                title=f"{screen.title} · {branch.name}",
                defaults={
                    "record_type": "demo_configuration",
                    "status": "active",
                    "data": data,
                    "created_by": admin,
                    "is_active": True,
                },
            )
