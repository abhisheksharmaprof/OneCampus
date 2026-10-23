import hmac
import json
import uuid
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import AcademicYear, ClassSection, Grade, Subject
from modules.access_control.models import Role
from modules.admissions.models import Enquiry
from modules.attendance.models import StudentAttendance
from modules.finance.models import FeeInvoice, FeePayment
from modules.identity.services import resolve_session_context
from modules.institutes.models import Branch, Institute
from modules.people.models import ParentProfile, StaffProfile, Student
from modules.school_calendar.models import AcademicCalendarEvent


def _json(value):
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (Decimal, uuid.UUID)):
        return str(value)
    raise TypeError(f"Cannot encode {type(value).__name__}")


def _authenticated_institute(request):
    """Resolve a verified API key or a current admin-web institute session."""
    token = request.auth
    if token and token.get("client") == "admin-web" and token.get("membership_id"):
        context = resolve_session_context(user=request.user, client=token.get("client"), membership_id=token["membership_id"], include_inactive_institute=False)
        membership = getattr(context, "membership", None) if context else None
        if membership and membership.role == "INSTITUTE_ADMIN":
            request.institute = membership.institute
            return membership.institute
        return None

    expected = getattr(settings, "MCP_API_KEY", "")
    supplied = request.headers.get("X-API-Key", "")
    if expected and supplied and hmac.compare_digest(supplied, expected):
        institute_id = request.headers.get("X-Institute-ID") or request.query_params.get("institute_id", "")
        return Institute.objects.filter(id=institute_id, is_active=True).first()
    return None


def _tools():
    common = {"type": "object", "properties": {}, "additionalProperties": False}
    return [
        {"name": "get_school_overview", "description": "Institute name, active branches, student/staff totals, and current academic year.", "inputSchema": common},
        {"name": "list_students", "description": "Search active students by name or grade.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "grade": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}, "additionalProperties": False}},
        {"name": "list_staff", "description": "List institute teachers and staff by name.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}, "additionalProperties": False}},
        {"name": "list_parents", "description": "Search parents and guardians by name or contact.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}, "additionalProperties": False}},
        {"name": "list_admissions_enquiries", "description": "List student admission enquiries and pipeline leads.", "inputSchema": {"type": "object", "properties": {"status": {"type": "string"}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}, "additionalProperties": False}},
        {"name": "get_attendance_summary", "description": "Student attendance status counts for a date (defaults to today).", "inputSchema": {"type": "object", "properties": {"date": {"type": "string", "format": "date"}}, "additionalProperties": False}},
        {"name": "get_academic_structure", "description": "List classes, sections, grades, and subjects taught in the institute.", "inputSchema": common},
        {"name": "get_calendar_events", "description": "Scheduled events and holidays, optionally bounded by dates.", "inputSchema": {"type": "object", "properties": {"from": {"type": "string", "format": "date"}, "to": {"type": "string", "format": "date"}}, "additionalProperties": False}},
        {"name": "get_finance_summary", "description": "Fee collection, invoice dues, and active fee plan summary.", "inputSchema": common},
        {"name": "list_roles_and_permissions", "description": "List configured access control roles and governance policies.", "inputSchema": common},
    ]


def _tool_result(institute, name, arguments):
    if name == "get_school_overview":
        branches = Branch.objects.filter(institute=institute, is_active=True)
        year = AcademicYear.objects.filter(institute=institute, is_current=True).first()
        return {"institute": institute.name, "branches": list(branches.values("id", "name", "code")), "studentCount": Student.objects.filter(institute=institute, is_active=True).count(), "staffCount": StaffProfile.objects.filter(institute=institute).count(), "academicYear": year.name if year else None}
    if name == "list_students":
        qs = Student.objects.filter(institute=institute, is_active=True).select_related("branch")
        query = arguments.get("query", "").strip()
        if query:
            qs = qs.filter(Q(first_name__icontains=query) | Q(last_name__icontains=query) | Q(admission_number__icontains=query))
        grade = arguments.get("grade", "").strip()
        if grade:
            qs = qs.filter(academic_enrollments__class_section__grade__name__icontains=grade, academic_enrollments__academic_year__is_current=True).distinct()
        return list(qs.values("id", "first_name", "last_name", "admission_number", "branch__name")[:arguments.get("limit", 50)])
    if name == "list_staff":
        qs = StaffProfile.objects.filter(institute=institute).select_related("user")
        query = arguments.get("query", "").strip()
        if query:
            qs = qs.filter(Q(user__first_name__icontains=query) | Q(user__last_name__icontains=query) | Q(user__email__icontains=query))
        return list(qs.values("id", "user__first_name", "user__last_name", "employee_code", "department")[:arguments.get("limit", 50)])
    if name == "list_parents":
        qs = ParentProfile.objects.filter(institute=institute).select_related("user")
        query = arguments.get("query", "").strip()
        if query:
            qs = qs.filter(Q(user__first_name__icontains=query) | Q(user__last_name__icontains=query) | Q(user__email__icontains=query) | Q(user__phone__icontains=query))
        return list(qs.values("id", "user__first_name", "user__last_name", "user__email", "user__phone")[:arguments.get("limit", 50)])
    if name == "list_admissions_enquiries":
        qs = Enquiry.objects.filter(institute=institute)
        status_val = arguments.get("status", "").strip()
        if status_val:
            qs = qs.filter(status=status_val)
        return list(qs.values("id", "guardian_name", "contact_email", "status", "created_at")[:arguments.get("limit", 50)])
    if name == "get_academic_structure":
        grades = list(Grade.objects.filter(institute=institute).values("id", "name", "sort_order"))
        sections = list(ClassSection.objects.filter(grade__institute=institute).values("id", "section_name", "grade__name", "branch__name", "max_strength"))
        subjects = list(Subject.objects.filter(institute=institute).values("id", "name", "subject_code"))
        return {"grades": grades, "sections": sections, "subjects": subjects}
    if name == "list_roles_and_permissions":
        roles = list(Role.objects.filter(institute=institute).values("id", "name", "description", "is_system_role", "is_active"))
        return {"roles": roles}
    if name == "get_attendance_summary":
        attendance_date = date.fromisoformat(arguments["date"]) if arguments.get("date") else timezone.localdate()
        qs = StudentAttendance.objects.filter(institute=institute, date=attendance_date)
        counts = {row["status"]: row["count"] for row in qs.values("status").annotate(count=Count("id"))}
        return {"date": attendance_date.isoformat(), "total": sum(counts.values()), "byStatus": counts}
    if name == "get_calendar_events":
        qs = AcademicCalendarEvent.objects.filter(institute=institute)
        if arguments.get("from"):
            qs = qs.filter(ends_on__gte=date.fromisoformat(arguments["from"]))
        if arguments.get("to"):
            qs = qs.filter(starts_on__lte=date.fromisoformat(arguments["to"]))
        return list(qs.values("id", "title", "event_type", "starts_on", "ends_on", "branch__name")[:200])
    if name == "get_finance_summary":
        invoices = FeeInvoice.objects.filter(institute=institute).exclude(status="CANCELLED")
        payments = FeePayment.objects.filter(institute=institute)
        collected = payments.aggregate(total=Sum("amount"))["total"] or Decimal("0")
        open_invoices = invoices.filter(status__in=("ISSUED", "PARTIALLY_PAID"))
        paid_by_invoice = {
            row["invoice_id"]: row["total"]
            for row in payments.filter(invoice__in=open_invoices)
            .values("invoice_id")
            .annotate(total=Sum("amount"))
        }
        outstanding = sum(
            (
                invoice["total"] - paid_by_invoice.get(invoice["id"], Decimal("0"))
                for invoice in open_invoices.values("id", "total")
            ),
            Decimal("0"),
        )
        return {"collectedTotal": str(collected), "pendingDues": str(outstanding), "invoiceCount": invoices.count(), "openInvoiceCount": open_invoices.count()}
    raise ValueError("Unknown tool")


class MCPView(APIView):
    permission_classes = (AllowAny,)

    @staticmethod
    def _error(request_id, code, message):
        return Response({"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}})

    def post(self, request):
        data = request.data
        request_id = data.get("id") if isinstance(data, dict) else None
        if not isinstance(data, dict) or data.get("jsonrpc") != "2.0" or not isinstance(data.get("method"), str):
            return self._error(request_id, -32600, "Invalid Request")
        method, params = data["method"], data.get("params") or {}
        if not isinstance(params, dict):
            return self._error(request_id, -32602, "Invalid params")
        if method == "initialize":
            return Response({"jsonrpc": "2.0", "id": request_id, "result": {"protocolVersion": params.get("protocolVersion", "2025-06-18"), "capabilities": {"tools": {}, "resources": {}}, "serverInfo": {"name": "campusone-mcp-server", "version": "1.0.0"}}})
        if method == "notifications/initialized":
            return Response(status=202)

        institute = _authenticated_institute(request)
        if institute is None:
            return Response({"jsonrpc": "2.0", "id": request_id, "error": {"code": -32001, "message": "Authentication or institute access denied"}}, status=401)
        try:
            if method == "tools/list":
                result = {"tools": _tools()}
            elif method == "tools/call":
                name, arguments = params.get("name"), params.get("arguments") or {}
                if not isinstance(arguments, dict):
                    return self._error(request_id, -32602, "Invalid params")
                tool = next((item for item in _tools() if item["name"] == name), None)
                if not tool:
                    return self._error(request_id, -32602, "Unknown tool")
                schema = tool["inputSchema"]
                if set(arguments) - set(schema["properties"]):
                    return self._error(request_id, -32602, "Invalid params")
                if "limit" in arguments and (not isinstance(arguments["limit"], int) or isinstance(arguments["limit"], bool) or not 1 <= arguments["limit"] <= 100):
                    return self._error(request_id, -32602, "Invalid params")
                result = {"content": [{"type": "text", "text": json.dumps(_tool_result(institute, name, arguments), default=_json)}], "isError": False}
            elif method == "resources/list":
                result = {"resources": [{"uri": "campusone://institute/profile", "name": "Institute profile", "mimeType": "application/json"}, {"uri": "campusone://calendar/holidays", "name": "Academic year holidays", "mimeType": "application/json"}]}
            elif method == "resources/read":
                uri = params.get("uri")
                if uri == "campusone://institute/profile":
                    payload = {"id": str(institute.id), "name": institute.name, "slug": institute.slug, "instituteType": institute.institute_type, "mediumOfInstruction": institute.medium_of_instruction, "country": institute.country, "city": institute.city, "state": institute.state, "brandColor": institute.brand_color, "branches": list(Branch.objects.filter(institute=institute, is_active=True).values("id", "name", "code"))}
                elif uri == "campusone://calendar/holidays":
                    year = AcademicYear.objects.filter(institute=institute, is_current=True).first()
                    events = AcademicCalendarEvent.objects.filter(institute=institute, event_type="HOLIDAY")
                    if year:
                        events = events.filter(starts_on__gte=year.start_date, starts_on__lte=year.end_date)
                    payload = list(events.values("title", "starts_on", "ends_on"))
                else:
                    return self._error(request_id, -32602, "Unknown resource")
                result = {"contents": [{"uri": uri, "mimeType": "application/json", "text": json.dumps(payload, default=_json)}]}
            else:
                return self._error(request_id, -32601, "Method not found")
            return Response({"jsonrpc": "2.0", "id": request_id, "result": result})
        except (TypeError, ValueError, KeyError):
            return self._error(request_id, -32602, "Invalid params")
