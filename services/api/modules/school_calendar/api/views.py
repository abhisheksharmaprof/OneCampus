import http.client
import ipaddress
import ssl
import socket
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlsplit

import holidays
from dateutil.rrule import rrulestr
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import URLValidator
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from icalendar import Calendar
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


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, address, timeout):
        super().__init__(host, port=443, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        raw_socket = socket.create_connection((self.address, self.port), self.timeout)
        self.sock = self._context.wrap_socket(raw_socket, server_hostname=self.host)


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


class HolidaySyncSerializer(serializers.Serializer):
    country = serializers.CharField(max_length=2, required=False, default="IN")
    year = serializers.IntegerField(required=False)
    subdivision = serializers.CharField(max_length=16, required=False, allow_blank=True)
    icalUrl = serializers.CharField(required=False, allow_blank=True)
    branchId = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if bool(attrs.get("icalUrl")) == bool(attrs.get("year")):
            raise serializers.ValidationError(
                "Provide either a year for national holidays or an iCal URL."
            )
        if attrs.get("year") and not 1900 <= attrs["year"] <= 2100:
            raise serializers.ValidationError({"year": "Year must be between 1900 and 2100."})
        return attrs


def _public_ical_content(url):
    validator = URLValidator(schemes=("https",))
    try:
        validator(url)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(
            {"icalUrl": "Enter a valid public HTTPS iCal URL."}
        ) from exc
    parsed = urlsplit(url)
    if parsed.port not in (None, 443) or parsed.username or parsed.password or not parsed.hostname:
        raise serializers.ValidationError(
            {"icalUrl": "Only public HTTPS calendar URLs are allowed."}
        )
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise serializers.ValidationError(
            {"icalUrl": "The calendar host could not be reached."}
        ) from exc
    if not addresses or any(
        not ipaddress.ip_address(item[4][0]).is_global for item in addresses
    ):
        raise serializers.ValidationError(
            {"icalUrl": "Only publicly accessible calendar URLs are allowed."}
        )
    address = addresses[0][4][0]
    connection = _PinnedHTTPSConnection(parsed.hostname, address, timeout=10)
    try:
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        connection.request("GET", path, headers={"User-Agent": "CampusOne calendar sync"})
        response = connection.getresponse()
        if response.status != 200:
            raise serializers.ValidationError(
                {"icalUrl": "The calendar feed could not be retrieved."}
            )
        content = response.read(5_000_001)
    except (OSError, TimeoutError, http.client.HTTPException, ssl.SSLError) as exc:
        raise serializers.ValidationError(
            {"icalUrl": "Could not retrieve the calendar feed."}
        ) from exc
    finally:
        connection.close()
    if len(content) > 5_000_000:
        raise serializers.ValidationError({"icalUrl": "Calendar feed exceeds the 5 MB limit."})
    return content


def _ical_events(content):
    current_year = date.today().year
    try:
        calendar = Calendar.from_ical(content)
    except (ValueError, TypeError) as exc:
        raise serializers.ValidationError(
            {"icalUrl": "The URL did not return a valid iCalendar feed."}
        ) from exc
    range_start = datetime(current_year, 1, 1, tzinfo=UTC)
    range_end = datetime(current_year + 3, 12, 31, 23, 59, tzinfo=UTC)
    result = []
    for component in calendar.walk("VEVENT"):
        start_prop = component.get("DTSTART")
        end_prop = component.get("DTEND")
        if not start_prop:
            continue
        start_value = start_prop.dt
        if isinstance(start_value, datetime):
            if start_value.tzinfo:
                start_value = start_value.astimezone(UTC)
            start_value = start_value.date()
        if not isinstance(start_value, date):
            continue
        end_value = end_prop.dt if end_prop else start_value
        if isinstance(end_value, datetime):
            if end_value.tzinfo:
                end_value = end_value.astimezone(UTC)
            end_value = end_value.date()
        if not isinstance(end_value, date):
            continue
        # RFC5545 DTEND is exclusive for all-day events.
        if isinstance(start_prop.dt, date) and not isinstance(start_prop.dt, datetime) and end_prop:
            end_value -= timedelta(days=1)
        rule = component.get("RRULE")
        if rule:
            rule_value = rule.to_ical().decode("utf-8")
            try:
                occurrences = rrulestr(rule_value, dtstart=start_value)
                starts = occurrences.between(range_start, range_end, inc=True)
            except (ValueError, TypeError, OverflowError):
                continue
        else:
            starts = [start_value]
        duration = end_value - start_value
        title = str(component.get("SUMMARY") or "Holiday").strip()[:250]
        for occurrence in starts:
            if isinstance(occurrence, datetime):
                occurrence = occurrence.date()
            if not current_year <= occurrence.year <= current_year + 3:
                continue
            result.append((title, occurrence, occurrence + duration))
    return result


class HolidaySyncView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(
        request=HolidaySyncSerializer,
        responses={status.HTTP_200_OK: EventSerializer(many=True)},
    )
    def post(self, request):
        serializer = HolidaySyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        branch = None
        if values.get("branchId"):
            branch = get_object_or_404(
                Branch, id=values["branchId"], institute=request.institute, is_active=True
            )

        if values.get("icalUrl"):
            candidates = _ical_events(_public_ical_content(values["icalUrl"]))
            source = "ical"
        else:
            try:
                calendar_holidays = holidays.country_holidays(
                    values.get("country", "IN").upper(),
                    subdiv=values.get("subdivision") or None,
                    years=values["year"],
                    observed=True,
                )
            except (NotImplementedError, ValueError) as exc:
                raise serializers.ValidationError(
                    {"country": "Unsupported country or subdivision."}
                ) from exc
            candidates = [
                (name, holiday_date, holiday_date)
                for holiday_date, name in calendar_holidays.items()
            ]
            # India restricted holidays are optional holidays rather than gazetted ones.
            if values.get("country", "IN").upper() == "IN" and not values.get("subdivision"):
                from holidays.countries.india import India

                restricted = India(years=values["year"], categories=("optional",))
                candidates.extend(
                    (name, holiday_date, holiday_date)
                    for holiday_date, name in restricted.items()
                )
            source = f"national:{values.get('country', 'IN').upper()}"

        existing = AcademicCalendarEvent.objects.filter(
            institute=request.institute,
            event_type=AcademicCalendarEvent.EventType.HOLIDAY,
            starts_on__in={start for _, start, _ in candidates},
        ).values_list("title", "starts_on")
        existing_keys = {(title.casefold(), starts_on) for title, starts_on in existing}
        additions = []
        seen = set()
        for title, starts_on, ends_on in candidates:
            key = (title.casefold(), starts_on)
            if key in existing_keys or key in seen:
                continue
            seen.add(key)
            additions.append(AcademicCalendarEvent(
                institute=request.institute, branch=branch, title=title,
                event_type=AcademicCalendarEvent.EventType.HOLIDAY,
                starts_on=starts_on, ends_on=max(starts_on, ends_on),
            ))
        created = AcademicCalendarEvent.objects.bulk_create(additions)
        if created:
            audit_mutation(
                request=request, verb="Imported", target_label=f"{len(created)} calendar holidays",
                target_type="calendar_event", extra_meta={"source": source, "count": len(created)},
            )
        return Response({
            "success": True,
            "data": {
                "count": len(created),
                "added": EventSerializer(created, many=True).data,
            },
        })
