from django.urls import path

from .views import (
    AcademicOperationDetailView,
    AcademicOperationListCreateView,
    AcademicYearDetailView,
    AcademicYearListCreateView,
    AcademicYearSetCurrentView,
    AcademicTermDetailView,
    AcademicTermListCreateView,
    ClassSubjectDetailView,
    ClassSubjectListCreateView,
    ClassSectionDetailView,
    ClassSectionListCreateView,
    GradeDetailView,
    GradeListCreateView,
    StudentEnrollmentDetailView,
    StudentEnrollmentListCreateView,
    SubjectDetailView,
    SubjectListCreateView,
    SubjectTeacherAssignmentDetailView,
    SubjectTeacherAssignmentListCreateView,
    RoomDetailView,
    RoomListCreateView,
)

app_name = "academics"

urlpatterns = [
    path("operations", AcademicOperationListCreateView.as_view(), name="operation-list"),
    path("operations/<uuid:operation_id>", AcademicOperationDetailView.as_view(), name="operation-detail"),
    path("rooms", RoomListCreateView.as_view(), name="room-list"),
    path("rooms/<uuid:room_id>", RoomDetailView.as_view(), name="room-detail"),
    path("academic-years", AcademicYearListCreateView.as_view(), name="academic-year-list"),
    path(
        "academic-years/<uuid:year_id>",
        AcademicYearDetailView.as_view(),
        name="academic-year-detail",
    ),
    path(
        "academic-years/<uuid:year_id>/set-current",
        AcademicYearSetCurrentView.as_view(),
        name="academic-year-set-current",
    ),
    path("academic-terms", AcademicTermListCreateView.as_view(), name="academic-term-list"),
    path("academic-terms/<uuid:term_id>", AcademicTermDetailView.as_view(), name="academic-term-detail"),
    path("classes", GradeListCreateView.as_view(), name="class-list"),
    path("classes/<uuid:grade_id>", GradeDetailView.as_view(), name="class-detail"),
    path("subjects", SubjectListCreateView.as_view(), name="subject-list"),
    path("subjects/<uuid:subject_id>", SubjectDetailView.as_view(), name="subject-detail"),
    path("class-subjects", ClassSubjectListCreateView.as_view(), name="class-subject-list"),
    path("class-subjects/<uuid:curriculum_id>", ClassSubjectDetailView.as_view(), name="class-subject-detail"),
    path("sections", ClassSectionListCreateView.as_view(), name="section-list"),
    path(
        "sections/<uuid:section_id>",
        ClassSectionDetailView.as_view(),
        name="section-detail",
    ),
    path(
        "section-subject-teachers",
        SubjectTeacherAssignmentListCreateView.as_view(),
        name="section-subject-teacher-list",
    ),
    path(
        "section-subject-teachers/<uuid:assignment_id>",
        SubjectTeacherAssignmentDetailView.as_view(),
        name="section-subject-teacher-detail",
    ),
    path("enrollments", StudentEnrollmentListCreateView.as_view(), name="enrollment-list"),
    path(
        "enrollments/<uuid:enrollment_id>",
        StudentEnrollmentDetailView.as_view(),
        name="enrollment-detail",
    ),
]
