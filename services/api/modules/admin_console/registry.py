"""Canonical backend registry for every non-auth institute-admin screen.

The IDs mirror ``apps/institute-admin-web/src/adminNavigation.ts``.  Screens with a
dedicated API remain in the catalog so clients can render one navigation model, but
only screens whose ``dataSource`` is ``adminRecords`` use this module's record API.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ScreenDefinition:
    id: str
    title: str
    section: str
    path: str
    icon: str
    data_source: str = "adminRecords"
    description: str = ""
    read_only: bool = False

    @property
    def breadcrumb(self):
        return self.title if self.section == self.title else f"{self.section} / {self.title}"

    @property
    def supports_records(self):
        return self.data_source == "adminRecords"

    def as_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "section": self.section,
            "path": self.path,
            "breadcrumb": self.breadcrumb,
            "icon": self.icon,
            "dataSource": self.data_source,
            "supportsRecords": self.supports_records,
            "description": self.description,
            "readOnly": self.read_only,
        }


def _s(id, title, section, path, icon, data_source="adminRecords", description="", read_only=False):
    return ScreenDefinition(id, title, section, path, icon, data_source, description, read_only)


SCREENS = (
    _s("H1", "Dashboard", "Dashboard", "/dashboard", "dashboard", "dashboard"),
    _s("BR1", "Branches List", "Branches", "/branches", "institute", "branches"),
    _s(
        "BR2",
        "Branch Detail",
        "Branches",
        "/branches/detail",
        "institute",
        description="Create, edit and review a branch.",
    ),
    _s("ST1", "Staff Directory", "Staff & HR", "/staff", "people", "staff"),
    _s("ST2", "Staff Profile", "Staff & HR", "/staff/profile", "people"),
    _s("ST3", "Staff Leave Approvals", "Staff & HR", "/staff/leave-approvals", "people"),
    _s("RP1", "Roles List", "Roles & Permissions", "/roles", "roles", "accessControl"),
    _s("RP2", "Role Builder", "Roles & Permissions", "/roles/builder", "roles", "accessControl"),
    _s("SD1", "Student Directory", "Students", "/students", "people", "students"),
    _s("SD2", "Student Profile", "Students", "/students/profile", "people"),
    _s("SD3", "Bulk Import & ID Cards", "Students", "/students/import", "people"),
    _s(
        "AD1",
        "Admissions Dashboard & Funnel",
        "Admissions & CRM",
        "/admissions",
        "admissions",
        "admissions",
    ),
    _s(
        "AD2",
        "Enquiries Inbox",
        "Admissions & CRM",
        "/admissions/enquiries",
        "admissions",
        "enquiries",
    ),
    _s(
        "AD3",
        "Enquiry Detail",
        "Admissions & CRM",
        "/admissions/enquiries/detail",
        "admissions",
    ),
    _s("AD4", "Application Form Builder", "Admissions & CRM", "/admissions/forms", "admissions"),
    _s(
        "AD5",
        "Visit & Entrance Test Scheduler",
        "Admissions & CRM",
        "/admissions/scheduler",
        "admissions",
    ),
    _s(
        "AD6",
        "Counselor Assignment & Workload",
        "Admissions & CRM",
        "/admissions/counselors",
        "admissions",
    ),
    _s(
        "AC1",
        "Academic Year & Calendar",
        "Academics",
        "/academics/calendar",
        "academics",
        "calendar",
    ),
    _s("AC2", "Classes, Sections & Subjects", "Academics", "/academics/structure", "academics", "academics"),
    _s("AC3", "Grading Scale Configuration", "Academics", "/academics/grading-scales", "academics"),
    _s("AC4", "Assessments & Exams", "Academics", "/academics/assessments", "academics"),
    _s("AC5", "Common Test Builder", "Academics", "/academics/common-tests", "academics"),
    _s("AC6", "Report Cards", "Academics", "/academics/report-cards", "academics"),
    _s("AC7", "Syllabus Oversight", "Academics", "/academics/syllabus", "academics", read_only=True),
    _s("AT1", "Attendance Dashboard", "Attendance", "/attendance", "attendance", "attendance"),
    _s("AT2", "Low-Attendance Alerts & Policy", "Attendance", "/attendance/alerts", "attendance"),
    _s("AT3", "Staff Attendance", "Attendance", "/attendance/staff", "attendance"),
    _s("FN1", "Fee Structure Builder", "Fees & Finance", "/fees/structure", "fees"),
    _s(
        "FN2",
        "Collection Dashboard & Invoices",
        "Fees & Finance",
        "/fees/collections",
        "fees",
        "finance",
    ),
    _s("FN3", "Defaulter Reports", "Fees & Finance", "/fees/defaulters", "fees"),
    _s("FN4", "Refunds & Withdrawals", "Fees & Finance", "/fees/refunds", "fees"),
    _s(
        "CM1", "Circulars & Broadcast", "Communication", "/communication/circulars", "communication"
    ),
    _s("CM2", "Message Templates", "Communication", "/communication/templates", "communication"),
    _s("TT1", "Timetable Builder", "Timetable", "/timetable", "calendar"),
    _s("TT2", "Substitute Management", "Timetable", "/timetable/substitutes", "calendar"),
    _s(
        "RG1",
        "Point Categories & Activity Types",
        "Recognition & Leaderboard",
        "/recognition/points",
        "gamification",
    ),
    _s(
        "RG2",
        "Batch (Badge) Definitions",
        "Recognition & Leaderboard",
        "/recognition/badges",
        "gamification",
    ),
    _s(
        "RG3",
        "Leaderboard Settings",
        "Recognition & Leaderboard",
        "/recognition/settings",
        "gamification",
    ),
    _s(
        "RG4",
        "Institute Leaderboard View",
        "Recognition & Leaderboard",
        "/recognition/leaderboard",
        "gamification",
        read_only=True,
    ),
    _s(
        "RG5",
        "Cross-Institute Partnerships",
        "Recognition & Leaderboard",
        "/recognition/partnerships",
        "gamification",
    ),
    _s("RA1", "Reports Hub", "Reports & Analytics", "/reports", "reports"),
    _s("RA2", "Custom Report Builder", "Reports & Analytics", "/reports/builder", "reports"),
    _s("AO1", "Transport", "Transport / Library / Hostel", "/operations/transport", "network"),
    _s("AO2", "Library", "Transport / Library / Hostel", "/operations/library", "network"),
    _s("AO3", "Hostel", "Transport / Library / Hostel", "/operations/hostel", "network"),
    _s(
        "SE1",
        "Institute Profile & Branding",
        "Settings",
        "/settings/profile",
        "subscription",
        "institute",
    ),
    _s(
        "SE2", "Academic & Regional Configuration", "Settings", "/settings/academic", "subscription"
    ),
    _s("SE3", "Subscription & Billing", "Settings", "/settings/billing", "subscription"),
    _s("SE4", "Data Privacy & Consent", "Settings", "/settings/privacy", "subscription"),
    _s("SE5", "Notification Channels", "Settings", "/settings/notifications", "subscription"),
    _s("AL1", "Audit Log", "Audit Log", "/audit-log", "audit", read_only=True),
    _s("NT1", "Notifications", "Notifications", "/notifications", "communication", read_only=True),
    _s("PR1", "My Account", "My Account", "/account", "people"),
    _s("HP1", "Help & Support", "Help & Support", "/help", "reports"),
)

SCREENS_BY_ID = {screen.id: screen for screen in SCREENS}
SCREEN_IDS = tuple(SCREENS_BY_ID)
SCREEN_ID_CHOICES = tuple((screen.id, screen.title) for screen in SCREENS)


def get_screen(screen_id):
    return SCREENS_BY_ID.get(str(screen_id).strip().upper())
