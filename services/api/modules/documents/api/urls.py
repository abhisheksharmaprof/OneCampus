from django.urls import path

from modules.documents.api.views import (
    DocumentTemplateDetailView,
    DocumentTemplateListCreateView,
)

urlpatterns = [
    path("templates", DocumentTemplateListCreateView.as_view(), name="admin-document-templates"),
    path(
        "templates/<uuid:template_id>",
        DocumentTemplateDetailView.as_view(),
        name="admin-document-template-detail",
    ),
]
