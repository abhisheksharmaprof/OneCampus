from django.urls import path

from modules.admissions.api.views import EnquiryListCreateView
from modules.attendance.api.views import (
    AttendanceOverviewView,
    AttendanceSettingsView,
    AttendanceReportsView,
    BulkAttendanceView,
    StaffAttendanceView,
    AttendanceReminderView,
    DailyRosterView,
    LeaveApplicationListView,
    LeaveApproveView,
    LeaveBalancesView,
    LeaveHistoryView,
    LeaveRejectView,
    LeaveTypesView,
    LeaveTypeDetailView,
    LowAttendanceAlertsView,
    LowAttendanceNotifyView,
    AttendanceNotificationActionView,
)
from modules.finance.api.views import (
    FeeInvoiceBulkGenerateView,
    FeeInvoiceDetailView,
    FeeInvoiceListCreateView,
    FeePaymentListCreateView,
    FinanceRecordListCreateView,
)
from modules.finance.api.templates_views import (
    InvoiceTemplateDetailView,
    InvoiceTemplateListCreateView,
)
from modules.finance.api.plans_views import FeePlanDetailView, FeePlanListCreateView
from modules.people.api.parents import ParentListCreateView, ParentStudentLinkView
from modules.people.api.staff import StaffDetailView, StaffListCreateView
from modules.people.api.views import StudentBulkDeleteView, StudentDetailView, StudentListCreateView
from modules.school_calendar.api.views import CalendarEventListCreateView
from .audit import AuditEventExportView, AuditEventListView

from .admin_views import (
    BranchDetailView,
    BranchListCreateView,
    CreatePeerInstituteView,
    CurrentInstituteView,
    InstituteAssociationListCreateView,
    LinkPeerInstituteView,
    PeerInstituteListView,
)
from .platform import PlatformInstituteListView, PlatformRegistrationApproveView, PlatformRegistrationListView, PlatformRegistrationRejectView
from .dashboard import AdminDashboardView

urlpatterns = [
    path("platform/registrations", PlatformRegistrationListView.as_view(), name="platform-registration-list"),
    path("platform/registrations/<uuid:institute_id>/approve", PlatformRegistrationApproveView.as_view(), name="platform-registration-approve"),
    path("platform/registrations/<uuid:institute_id>/reject", PlatformRegistrationRejectView.as_view(), name="platform-registration-reject"),
    path("platform/institutes", PlatformInstituteListView.as_view(), name="platform-institute-list"),
    path("dashboard", AdminDashboardView.as_view(), name="admin-dashboard"),
    path("audit-log", AuditEventListView.as_view(), name="admin-audit-log"),
    path("audit-log/export", AuditEventExportView.as_view(), name="admin-audit-log-export"),
    path("students", StudentListCreateView.as_view(), name="admin-students"),
    path("students/bulk-delete", StudentBulkDeleteView.as_view(), name="admin-students-bulk-delete"),
    path("students/<uuid:student_id>", StudentDetailView.as_view(), name="admin-student-detail"),
    path("staff", StaffListCreateView.as_view(), name="admin-staff"),
    path("staff/<uuid:staff_id>", StaffDetailView.as_view(), name="admin-staff-detail"),
    path("parents", ParentListCreateView.as_view(), name="admin-parents"),
    path(
        "parents/<uuid:parent_id>/students",
        ParentStudentLinkView.as_view(),
        name="admin-parent-student-link",
    ),
    path("enquiries", EnquiryListCreateView.as_view(), name="admin-enquiries"),
    path("attendance/overview", AttendanceOverviewView.as_view(), name="admin-attendance-overview"),
    path("attendance/daily-roster", DailyRosterView.as_view(), name="admin-attendance-daily-roster"),
    path("attendance/bulk", BulkAttendanceView.as_view(), name="admin-attendance-bulk"),
    path("attendance/staff", StaffAttendanceView.as_view(), name="admin-attendance-staff"),
    path("attendance/reminders", AttendanceReminderView.as_view(), name="admin-attendance-reminders"),
    path("attendance/leaves", LeaveApplicationListView.as_view(), name="admin-attendance-leaves"),
    path("attendance/leaves/<uuid:application_id>/approve", LeaveApproveView.as_view(), name="admin-attendance-leave-approve"),
    path("attendance/leaves/<uuid:application_id>/reject", LeaveRejectView.as_view(), name="admin-attendance-leave-reject"),
    path("attendance/leaves/<uuid:application_id>/history", LeaveHistoryView.as_view(), name="admin-attendance-leave-history"),
    path("attendance/notifications/<uuid:notification_id>/<str:action>", AttendanceNotificationActionView.as_view(), name="admin-attendance-notification-action"),
    path("attendance/alerts", LowAttendanceAlertsView.as_view(), name="admin-attendance-alerts"),
    path("attendance/alerts/<uuid:student_id>/notify", LowAttendanceNotifyView.as_view(), name="admin-attendance-alert-notify"),
    path("attendance/reports", AttendanceReportsView.as_view(), name="admin-attendance-reports"),
    path("attendance/settings", AttendanceSettingsView.as_view(), name="admin-attendance-settings"),
    path("attendance/leave-types", LeaveTypesView.as_view(), name="admin-attendance-leave-types"),
    path("attendance/leave-types/<uuid:type_id>", LeaveTypeDetailView.as_view(), name="admin-attendance-leave-type-detail"),
    path("attendance/leave-balances", LeaveBalancesView.as_view(), name="admin-attendance-leave-balances"),
    path("attendance/leave-quotas", LeaveBalancesView.as_view(), name="admin-attendance-leave-quotas"),
    path("fees/invoices", FeeInvoiceListCreateView.as_view(), name="admin-fee-invoices"),
    path(
        "fees/invoices/bulk-generate",
        FeeInvoiceBulkGenerateView.as_view(),
        name="admin-fee-invoices-bulk-generate",
    ),
    path(
        "fees/invoices/<uuid:invoice_id>",
        FeeInvoiceDetailView.as_view(),
        name="admin-fee-invoice-detail",
    ),
    path("fees/payments", FeePaymentListCreateView.as_view(), name="admin-fee-payments"),
    path("fees/templates", InvoiceTemplateListCreateView.as_view(), name="admin-fee-templates"),
    path(
        "fees/templates/<uuid:template_id>",
        InvoiceTemplateDetailView.as_view(),
        name="admin-fee-template-detail",
    ),
    path("fees/plans", FeePlanListCreateView.as_view(), name="admin-fee-plans"),
    path("fees/plans/<uuid:plan_id>", FeePlanDetailView.as_view(), name="admin-fee-plan-detail"),
    path("finance/records", FinanceRecordListCreateView.as_view(), name="admin-finance-records"),
    path("calendar/events", CalendarEventListCreateView.as_view(), name="admin-calendar-events"),
    path("institute", CurrentInstituteView.as_view(), name="admin-current-institute"),
    path("branches", BranchListCreateView.as_view(), name="admin-branch-list-create"),
    path("branches/<uuid:branch_id>", BranchDetailView.as_view(), name="admin-branch-detail"),
    path("peer-institutes", PeerInstituteListView.as_view(), name="admin-peer-institute-list"),
    path("peer-institutes/create", CreatePeerInstituteView.as_view(), name="admin-peer-institute-create"),
    path("peer-institutes/link", LinkPeerInstituteView.as_view(), name="admin-peer-institute-link"),
    path(
        "institute-associations",
        InstituteAssociationListCreateView.as_view(),
        name="admin-institute-association-list-create",
    ),
]
