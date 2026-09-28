from django.urls import path

from modules.documents.api.views import (
    DocumentTemplateDetailView,
    DocumentTemplateListCreateView,
    DocumentTemplatePublishView,
    IdCardPreflightView,
)

urlpatterns = [
    path("templates", DocumentTemplateListCreateView.as_view(), name="admin-document-templates"),
    path("id-cards/preflight", IdCardPreflightView.as_view(), name="admin-id-card-preflight"),
    path(
        "templates/<uuid:template_id>/publish",
        DocumentTemplatePublishView.as_view(),
        name="admin-document-template-publish",
    ),
    path(
        "templates/<uuid:template_id>",
        DocumentTemplateDetailView.as_view(),
        name="admin-document-template-detail",
    ),
]
