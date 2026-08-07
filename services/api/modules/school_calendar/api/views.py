from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from modules.school_calendar.models import AcademicCalendarEvent
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset


class EventSerializer(serializers.ModelSerializer):
    branchId = serializers.UUIDField(source="branch_id", read_only=True)
    eventType = serializers.CharField(source="event_type")
    startsOn = serializers.DateField(source="starts_on")
    endsOn = serializers.DateField(source="ends_on")

    class Meta:
        model = AcademicCalendarEvent
        fields = ("id", "title", "eventType", "branchId", "startsOn", "endsOn")


class EventWriteSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=250, trim_whitespace=True)
    eventType = serializers.ChoiceField(choices=AcademicCalendarEvent.EventType.choices)
    branchId = serializers.UUIDField(required=False, allow_null=True)
    startsOn = serializers.DateField()
    endsOn = serializers.DateField()

    def validate(self, attrs):
        if attrs["endsOn"] < attrs["startsOn"]:
            raise serializers.ValidationError(
                {"endsOn": ["End date cannot be before the start date."]}
            )
        return attrs


class CalendarEventListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: EventSerializer(many=True)})
    def get(self, request):
        events = AcademicCalendarEvent.objects.filter(institute=request.institute)
        branch_id = request.query_params.get("branchId")
        if branch_id:
            get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)
            events = events.filter(branch_id=branch_id)
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=events, serializer_class=EventSerializer
                ),
            }
        )

    @extend_schema(
        request=EventWriteSerializer,
        responses={status.HTTP_201_CREATED: EventSerializer},
    )
    def post(self, request):
        serializer = EventWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch = None
        if serializer.validated_data.get("branchId"):
            branch = get_object_or_404(
                Branch,
                id=serializer.validated_data["branchId"],
                institute=request.institute,
                is_active=True,
            )
        event = AcademicCalendarEvent.objects.create(
            institute=request.institute,
            branch=branch,
            title=serializer.validated_data["title"],
            event_type=serializer.validated_data["eventType"],
            starts_on=serializer.validated_data["startsOn"],
            ends_on=serializer.validated_data["endsOn"],
        )
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"calendar event '{event.title}'",
            target_type="calendar_event",
            target_id=event.id,
            extra_meta={"eventType": event.event_type},
        )
        return Response(
            {"success": True, "data": EventSerializer(event).data}, status=status.HTTP_201_CREATED
        )
