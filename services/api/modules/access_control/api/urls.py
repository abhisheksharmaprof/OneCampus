from django.urls import path

from .views import (
    AssignmentListCreateView,
    AssignmentRevokeView,
    PermissionCatalogView,
    RoleCloneView,
    RoleDetailView,
    RoleListCreateView,
)

app_name = "access_control"

urlpatterns = [
    path("permission-catalog", PermissionCatalogView.as_view(), name="permission-catalog"),
    path("permission-catalog/", PermissionCatalogView.as_view()),
    path("roles", RoleListCreateView.as_view(), name="role-list-create"),
    path("roles/", RoleListCreateView.as_view()),
    path("roles/<str:role_id>", RoleDetailView.as_view(), name="role-detail"),
    path("roles/<str:role_id>/", RoleDetailView.as_view()),
    path("roles/<str:role_id>/clone", RoleCloneView.as_view(), name="role-clone"),
    path("role-assignments", AssignmentListCreateView.as_view(), name="assignment-list-create"),
    path("role-assignments/", AssignmentListCreateView.as_view()),
    path(
        "role-assignments/<str:assignment_id>/revoke",
        AssignmentRevokeView.as_view(),
        name="assignment-revoke",
    ),
    path(
        "role-assignments/<str:assignment_id>/revoke/",
        AssignmentRevokeView.as_view(),
    ),
]
