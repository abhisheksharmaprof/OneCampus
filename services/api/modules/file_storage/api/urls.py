from django.urls import path

from .views import FileUploadCompleteView, FileUploadInitiateView

urlpatterns = [
    path("file-uploads", FileUploadInitiateView.as_view(), name="file-upload-initiate"),
    path(
        "file-uploads/<uuid:upload_id>/complete",
        FileUploadCompleteView.as_view(),
        name="file-upload-complete",
    ),
]
