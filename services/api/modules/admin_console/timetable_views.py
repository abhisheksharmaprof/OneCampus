"""
Timetable-specific views for publish/sync lifecycle management.

When a timetable is published:
  1. The target record's status is set to "PUBLISHED".
  2. All other PUBLISHED timetable records for the same institute+branch are
     transitioned to "ARCHIVED" (the "previous timetable").
  3. Staff and student timetable consumers always read the single PUBLISHED record.
"""

from django.db import transaction
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch

from .models import AdminRecord
from .serializers import AdminRecordSerializer
from .views import active_record_or_404, generic_screen_or_404

SCREEN_ID = "TT1"


class TimetablePublishView(APIView):
    """Publish a timetable record and archive any previously-published timetable.

    POST /api/v1/admin/timetable/publish
    Body: {"recordId": "<uuid>"}

    Side-effect: any other PUBLISHED record (same institute + branch + screen TT1)
    is demoted to "ARCHIVED" so that consumers always read a single published timetable.
    """

    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={200: AdminRecordSerializer})
    def post(self, request):
        screen = generic_screen_or_404(SCREEN_ID, for_write=True)

        record_id = request.data.get("recordId")
        if not record_id:
            return Response(
                {"success": False, "error": {"recordId": "This field is required."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        record = active_record_or_404(request, screen.id, record_id)
        institute = request.institute

        from django.utils import timezone

        with transaction.atomic():
            # 1. Archive any previously published timetable for the same institute + branch
            published_qs = AdminRecord.objects.filter(
                institute=institute,
                screen_id=SCREEN_ID,
                status="PUBLISHED",
                is_active=True,
            )
            if record.branch_id:
                published_qs = published_qs.filter(branch=record.branch)
            else:
                published_qs = published_qs.filter(branch__isnull=True)

            # Exclude the record being published (in case it was already PUBLISHED)
            published_qs = published_qs.exclude(id=record.id)

            archived_count = published_qs.update(
                status="ARCHIVED",
                updated_at=timezone.now(),
            )

            # 2. Set this record as published
            AdminRecord.objects.filter(id=record.id).update(
                status="PUBLISHED",
                version=F("version") + 1,
                updated_at=timezone.now(),
            )

        record.refresh_from_db()
        record = AdminRecord.objects.select_related("branch", "created_by").get(id=record.id)
        return Response({
            "success": True,
            "data": {
                "record": AdminRecordSerializer(record).data,
                "archivedCount": archived_count,
            },
        })


class TimetableUnpublishView(APIView):
    """Unpublish a timetable — move it back to DRAFT status.

    POST /api/v1/admin/timetable/unpublish
    Body: {"recordId": "<uuid>"}
    """

    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={200: AdminRecordSerializer})
    def post(self, request):
        screen = generic_screen_or_404(SCREEN_ID, for_write=True)

        record_id = request.data.get("recordId")
        if not record_id:
            return Response(
                {"success": False, "error": {"recordId": "This field is required."}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        record = active_record_or_404(request, screen.id, record_id)

        if record.status != "PUBLISHED":
            return Response(
                {"success": False, "error": "Only a published timetable can be unpublished."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.utils import timezone

        with transaction.atomic():
            AdminRecord.objects.filter(id=record.id).update(
                status="DRAFT",
                version=F("version") + 1,
                updated_at=timezone.now(),
            )

        record.refresh_from_db()
        record = AdminRecord.objects.select_related("branch", "created_by").get(id=record.id)
        return Response({"success": True, "data": AdminRecordSerializer(record).data})


class PublishedTimetableView(APIView):
    """Return the currently published timetable for the institute (optionally scoped to branch).

    GET /api/v1/admin/timetable/published?branchId=<uuid>

    Used by staff timetable views, student profiles, room occupancy displays, etc.
    """

    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        screen = generic_screen_or_404(SCREEN_ID)
        institute = request.institute
        branch_id = request.query_params.get("branchId")

        qs = AdminRecord.objects.filter(
            institute=institute,
            screen_id=SCREEN_ID,
            status="PUBLISHED",
            is_active=True,
        ).select_related("branch", "created_by").order_by("-updated_at")

        if branch_id and branch_id != "all":
            branch = get_object_or_404(Branch, id=branch_id, institute=institute)
            qs = qs.filter(branch=branch)
        # When no branch is specified, return any published timetable (branch-scoped or institute-wide).
        # The most recently published takes priority.

        record = qs.first()
        if not record:
            return Response({"success": True, "data": None})

        return Response({"success": True, "data": AdminRecordSerializer(record).data})


class StaffTimetableView(APIView):
    """Return a single teacher's timetable from the published timetable.

    GET /api/v1/admin/staff/<staff_id>/timetable?branchId=<uuid>

    Extracts the teacher's slots from the published timetable bundle's
    ``lastResult.entries`` and returns a structured weekly grid.
    """

    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request, staff_id):
        from modules.people.models import StaffProfile

        institute = request.institute
        branch_id = request.query_params.get("branchId")

        staff_profile = get_object_or_404(
            StaffProfile.objects.select_related("user"),
            id=staff_id,
            institute=institute,
        )
        user_id = str(staff_profile.user_id)

        # Determine the staff member's branch for timetable matching
        memberships = list(
            staff_profile.user.institute_memberships.filter(
                institute=institute, is_active=True
            ).select_related("branch")
        )
        staff_branch = memberships[0].branch if memberships else None

        # Find the published timetable — prefer branch-scoped match first,
        # then fall back to institute-wide (no branch) timetables
        qs = AdminRecord.objects.filter(
            institute=institute,
            screen_id=SCREEN_ID,
            status="PUBLISHED",
            is_active=True,
        ).order_by("-updated_at")

        if branch_id and branch_id != "all":
            branch = get_object_or_404(Branch, id=branch_id, institute=institute)
            timetable_record = qs.filter(branch=branch).first()
        elif staff_branch:
            # Try branch-specific timetable first, then institute-wide
            timetable_record = qs.filter(branch=staff_branch).first() or qs.filter(branch__isnull=True).first()
        else:
            timetable_record = qs.filter(branch__isnull=True).first()
        if not timetable_record:
            return Response({"success": True, "data": {"teacherId": user_id, "slots": [], "message": "No published timetable found."}})

        bundle = (timetable_record.data or {}).get("bundle", {})
        last_result = bundle.get("lastResult") or {}
        entries = last_result.get("entries", [])
        config = bundle.get("config", {})
        periods_list = config.get("periods", [])
        working_days = config.get("workingDays", ["MON", "TUE", "WED", "THU", "FRI", "SAT"])
        classes_map = {c.get("id"): c for c in bundle.get("classes", [])}
        subjects_map = {s.get("id"): s for s in bundle.get("subjects", [])}
        rooms_map = {r.get("id"): r for r in bundle.get("rooms", [])}

        # Filter entries for this teacher
        teacher_entries = [e for e in entries if e.get("teacherId") == user_id]

        # Build structured slots grouped by day and period
        teaching_periods = [p for p in periods_list if p.get("type") != "break"]
        slots = []
        for entry in teacher_entries:
            day = entry.get("day", "")
            period_number = entry.get("period")
            # Combined lessons span several sections (classIds); older saved
            # bundles only carry a single classId — normalize both shapes.
            class_ids = entry.get("classIds") or ([entry.get("classId")] if entry.get("classId") else [])
            if not isinstance(class_ids, list):
                # Malformed bundle (e.g. a bare string id) — wrap rather than
                # iterating it character by character below.
                class_ids = [class_ids]
            class_names = [classes_map.get(cid, {}).get("name", "") for cid in class_ids]
            subject_info = subjects_map.get(entry.get("subjectId", ""), {})
            room_info = rooms_map.get(entry.get("roomId", ""), {})

            period_def = next((p for p in teaching_periods if p.get("number") == period_number), None)

            slots.append({
                "day": day,
                "period": period_number,
                "startTime": period_def.get("start") if period_def else None,
                "endTime": period_def.get("end") if period_def else None,
                "className": " / ".join(name for name in class_names if name),
                "subjectName": subject_info.get("name", ""),
                "roomName": room_info.get("name", ""),
                "classId": class_ids[0] if class_ids else "",
                "classIds": class_ids,
                "subjectId": entry.get("subjectId", ""),
                "roomId": entry.get("roomId", ""),
            })

        # Sort by day order then period
        day_order = {day: idx for idx, day in enumerate(working_days)}
        slots.sort(key=lambda s: (day_order.get(s["day"], 99), s["period"]))

        return Response({
            "success": True,
            "data": {
                "teacherId": user_id,
                "teacherName": staff_profile.user.get_full_name() or staff_profile.user.email,
                "workingDays": working_days,
                "periods": teaching_periods,
                "slots": slots,
                "timetableRecordId": str(timetable_record.id),
                "timetableTitle": timetable_record.title,
                "timetableUpdatedAt": timetable_record.updated_at.isoformat() if timetable_record.updated_at else None,
            },
        })