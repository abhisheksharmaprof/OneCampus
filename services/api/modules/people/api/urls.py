from django.urls import path

from .views import StudentDetailView, StudentListCreateView

urlpatterns = [
    path("students", StudentListCreateView.as_view(), name="admin-students"),
    path("students/<uuid:student_id>", StudentDetailView.as_view(), name="admin-student-detail"),
]
