from __future__ import annotations

from modules.file_storage.models import FileAsset
from modules.institutes.models import InstituteMembership


def visible_file_assets(*, request):
    queryset = FileAsset.objects.filter(institute=request.institute).select_related(
        "branch", "uploaded_by"
    )
    membership = request.institute_membership
    if membership.role == InstituteMembership.Role.BRANCH_ADMIN:
        queryset = queryset.filter(branch_id=membership.branch_id)
    filters = {
        "owner_type": request.query_params.get("ownerType"),
        "owner_id": request.query_params.get("ownerId"),
        "asset_type": request.query_params.get("category") or request.query_params.get("assetType"),
        "status": request.query_params.get("state"),
        "visibility": request.query_params.get("visibility"),
    }
    for field, value in filters.items():
        if value:
            queryset = queryset.filter(**{field: value})
    return queryset.order_by("-created_at", "-id")
