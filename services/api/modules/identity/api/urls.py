from django.urls import path

from .views import (
    SessionCreateView,
    SessionCurrentView,
    SessionOtpResendView,
    SessionOtpVerifyView,
    SessionRefreshView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    PasswordSetupView,
)

urlpatterns = [
    path("sessions", SessionCreateView.as_view(), name="session-create"),
    path("sessions/otp", SessionOtpVerifyView.as_view(), name="session-otp-verify"),
    path("sessions/otp/resend", SessionOtpResendView.as_view(), name="session-otp-resend"),
    path("sessions/password-setup", PasswordSetupView.as_view(), name="session-password-setup"),
    path("sessions/refresh", SessionRefreshView.as_view(), name="session-refresh"),
    path("sessions/current", SessionCurrentView.as_view(), name="session-current"),
    path("password-reset/request", PasswordResetRequestView.as_view(), name="password-reset-request"),
    path("password-reset/confirm", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
]
