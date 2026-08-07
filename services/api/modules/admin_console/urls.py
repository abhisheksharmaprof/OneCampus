from django.urls import path

from .timetable_views import (
    PublishedTimetableView,
    StaffTimetableView,
    TimetablePublishView,
    TimetableUnpublishView,
)
from .views import (
    AdminRecordCreateView,
    AdminRecordDetailView,
    ScreenCatalogView,
    ScreenDetailView,
)

app_name = "admin_console"

urlpatterns = [
    path("screens", ScreenCatalogView.as_view(), name="screen-catalog"),
    path("screens/<str:screen_id>", ScreenDetailView.as_view(), name="screen-detail"),
    path(
        "screens/<str:screen_id>/records",
        AdminRecordCreateView.as_view(),
        name="record-create",
    ),
    path(
        "screens/<str:screen_id>/records/<uuid:record_id>",
        AdminRecordDetailView.as_view(),
        name="record-detail",
    ),
    # Timetable lifecycle endpoints
    path("timetable/publish", TimetablePublishView.as_view(), name="timetable-publish"),
    path("timetable/unpublish", TimetableUnpublishView.as_view(), name="timetable-unpublish"),
    path("timetable/published", PublishedTimetableView.as_view(), name="timetable-published"),
    path(
        "staff/<uuid:staff_id>/timetable",
        StaffTimetableView.as_view(),
        name="staff-timetable",
    ),
]
