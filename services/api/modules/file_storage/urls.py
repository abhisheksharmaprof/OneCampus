from django.urls import path

from .api import (
    FileAssetDetailView,
    FileAssetListCreateView,
    InstituteDocumentUploadView,
    InstituteLogoUploadView,
    StaffDocumentUploadView,
    StaffPhotoUploadView,
    StudentDocumentUploadView,
    StudentPhotoUploadView,
    TeacherDocumentUploadView,
    TeacherPhotoUploadView,
)

urlpatterns = [
    path("files", FileAssetListCreateView.as_view(), name="file-assets"),
    path("files/<uuid:asset_id>", FileAssetDetailView.as_view(), name="file-asset-detail"),
    path(
        "students/<uuid:owner_id>/photo",
        StudentPhotoUploadView.as_view(),
        name="student-photo-upload",
    ),
    path(
        "students/<uuid:owner_id>/documents",
        StudentDocumentUploadView.as_view(),
        name="student-document-upload",
    ),
    path("staff/<uuid:owner_id>/photo", StaffPhotoUploadView.as_view(), name="staff-photo-upload"),
    path(
        "staff/<uuid:owner_id>/documents",
        StaffDocumentUploadView.as_view(),
        name="staff-document-upload",
    ),
    path(
        "teachers/<uuid:owner_id>/photo",
        TeacherPhotoUploadView.as_view(),
        name="teacher-photo-upload",
    ),
    path(
        "teachers/<uuid:owner_id>/documents",
        TeacherDocumentUploadView.as_view(),
        name="teacher-document-upload",
    ),
    path("institute/logo", InstituteLogoUploadView.as_view(), name="institute-logo-upload"),
    path(
        "institute/documents",
        InstituteDocumentUploadView.as_view(),
        name="institute-document-upload",
    ),
]
