from django.urls import path

from .platform import PublicInstituteConfigView, SlugAvailabilityView
from .views import InstituteApplicationView, InstituteOnboardingView

urlpatterns = [
    path("applications", InstituteApplicationView.as_view(), name="institute-application"),
    path("registrations", InstituteOnboardingView.as_view(), name="institute-onboarding"),
    path("public/<slug:slug>", PublicInstituteConfigView.as_view(), name="public-institute-config"),
    path("slug-availability", SlugAvailabilityView.as_view(), name="slug-availability"),
]
