from django.urls import path

from .views import (
    AccountProfileImportView,
    AccountProfilePhotoView,
    AccountProfileView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    PasswordSetupView,
    SessionCreateView,
    SessionCurrentView,
    SessionOtpResendView,
    SessionOtpVerifyView,
    SessionRefreshView,
)

urlpatterns = [
    path("account", AccountProfileView.as_view(), name="account-profile"),
    path("account/photo", AccountProfilePhotoView.as_view(), name="account-profile-photo"),
    path("account/import-from-active-staff", AccountProfileImportView.as_view(), name="account-profile-import"),
    path("sessions", SessionCreateView.as_view(), name="session-create"),
    path("sessions/otp", SessionOtpVerifyView.as_view(), name="session-otp-verify"),
    path("sessions/otp/resend", SessionOtpResendView.as_view(), name="session-otp-resend"),
    path("sessions/password-setup", PasswordSetupView.as_view(), name="session-password-setup"),
    path("sessions/refresh", SessionRefreshView.as_view(), name="session-refresh"),
    path("sessions/current", SessionCurrentView.as_view(), name="session-current"),
    path("password-reset/request", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password-reset/confirm", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
]
