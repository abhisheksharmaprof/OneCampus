from django.urls import path

from .api import (
    StaffInvitationResendView,
    StaffInvitationValidateView,
    StaffPasswordSetupView,
)

urlpatterns = [
    path(
        "admin/staff/<uuid:staff_id>/invitation/resend",
        StaffInvitationResendView.as_view(),
        name="admin-staff-invitation-resend",
    ),
    path(
        "staff-invitations/validate",
        StaffInvitationValidateView.as_view(),
        name="staff-invitation-validate",
    ),
    path(
        "staff-invitations/setup",
        StaffPasswordSetupView.as_view(),
        name="staff-invitation-setup",
    ),
]
