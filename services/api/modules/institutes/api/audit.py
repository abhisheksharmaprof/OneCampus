from django.db.models import Q
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from platform_core.api.pagination import paginate_admin_queryset
from platform_core.models import AuditEvent

from .permissions import IsCurrentInstituteOnlyAdmin


class AuditEventSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()
    branch = serializers.SerializerMethodField()
    timestamp = serializers.DateTimeField(source="created_at")

    class Meta:
        model = AuditEvent
        fields = ("id", "timestamp", "event_type", "message", "actor", "branch", "metadata")

    def get_actor(self, value):
        if value.actor is None:
            return {"id": None, "name": "System"}
        name = value.actor.get_full_name().strip() or value.actor.email
        return {"id": str(value.actor_id), "name": name}

    def get_branch(self, value):
        if value.branch is None:
            return None
        return {"id": str(value.branch_id), "name": value.branch.name}


class AuditEventListView(APIView):
    permission_classes = (IsCurrentInstituteOnlyAdmin,)

    def get(self, request):
        AuditEvent.objects.create(
            institute=request.institute,
            actor=request.user,
            event_type="AUDIT_LOG_VIEWED",
            message="Viewed the institute audit log.",
            metadata={"path": request.path, "traceId": getattr(request, "trace_id", None)},
        )
        events = AuditEvent.objects.filter(institute=request.institute).select_related(
            "actor", "branch"
        )
        search = request.query_params.get("search", "").strip()
        event_type = request.query_params.get("eventType", "").strip()
        actor_id = request.query_params.get("actorId", "").strip()
        if search:
            events = events.filter(
                Q(message__icontains=search)
                | Q(event_type__icontains=search)
                | Q(actor__email__icontains=search)
                | Q(actor__first_name__icontains=search)
                | Q(actor__last_name__icontains=search)
            )
        if event_type:
            events = events.filter(event_type=event_type)
        if actor_id:
            events = events.filter(actor_id=actor_id)
        return Response({
            "success": True,
            "data": paginate_admin_queryset(
                request=request, queryset=events, serializer_class=AuditEventSerializer
            ),
        })


class AuditEventExportView(APIView):
    permission_classes = (IsCurrentInstituteOnlyAdmin,)

    def post(self, request):
        AuditEvent.objects.create(
            institute=request.institute,
            actor=request.user,
            event_type="AUDIT_LOG_EXPORTED",
            message="Exported the institute audit log.",
            metadata={"path": request.path, "traceId": getattr(request, "trace_id", None)},
        )
        return Response(
            {"success": True, "data": {"recorded": True}},
            status=status.HTTP_202_ACCEPTED,
        )
