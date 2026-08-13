from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from platform_core.api.health import HealthView, ReadinessView

urlpatterns = [
    path("django-admin/", admin.site.urls),
    path("api/v1/health", HealthView.as_view(), name="health"),
    path("api/v1/ready", ReadinessView.as_view(), name="readiness"),
    path("api/v1/identity/", include("modules.identity.api.urls")),
    path("api/v1/institute-onboarding/", include("modules.institutes.api.urls")),
    path("api/v1/admin/", include("modules.institutes.api.admin_urls")),
    path("api/v1/admin/", include("modules.access_control.api.urls")),
    path("api/v1/admin/", include("modules.admin_console.urls")),
    path("api/v1/admin/academics/", include("modules.academics.api.urls")),
    path("api/v1/admin/documents/", include("modules.documents.api.urls")),
    path("api/v1/admin/", include("modules.file_storage.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
