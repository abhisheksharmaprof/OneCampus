from django.urls import path

from . import studio, views

urlpatterns = [
    path("studio/branding", studio.StudioBrandingView.as_view()),
    path("studio/workspaces", studio.StudioWorkspaceListView.as_view()),
    path("studio/workspaces/<uuid:workspace_id>", studio.StudioWorkspaceDetailView.as_view()),
    path("studio/exams/<uuid:exam_id>/source", studio.StudioExamSourceView.as_view()),
    path("documents/<uuid:document_id>/verify", views.VerifyDocumentView.as_view()),
    path("exams/<uuid:exam_id>/formula-preview", views.FormulaPreviewView.as_view()),
    path("exams/<uuid:exam_id>/settings", views.ExamSettingsView.as_view()),
    path("legacy/<uuid:operation_id>/migrate", views.LegacyMigrateView.as_view()),
    path("bootstrap", views.BootstrapView.as_view()),
    path("exams", views.ExamListView.as_view()),
    path("exams/<uuid:exam_id>", views.ExamDetailView.as_view()),
    path("exams/<uuid:exam_id>/marks", views.MarksView.as_view()),
    path("exams/<uuid:exam_id>/sheets/<uuid:sheet_id>/review", views.ReviewView.as_view()),
    path("exams/<uuid:exam_id>/candidates/<uuid:candidate_id>", views.CandidateView.as_view()),
    path("exams/<uuid:exam_id>/imports", views.ImportView.as_view()),
    path("exams/<uuid:exam_id>/imports/<uuid:job_id>/commit", views.ImportCommitView.as_view()),
    path("exams/<uuid:exam_id>/history", views.HistoryView.as_view()),
    path("preview", views.PreviewView.as_view()),
    path("reports", views.ReportsView.as_view()),
    path("batches", views.BatchListView.as_view()),
    path("batches/<uuid:batch_id>", views.BatchDetailView.as_view()),
    path("batches/<uuid:batch_id>/download", views.DownloadView.as_view()),
    path("legacy", views.LegacyView.as_view()),
]
