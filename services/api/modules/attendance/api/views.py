from calendar import monthrange
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from modules.academics.models import AcademicYear, ClassSection, StudentEnrollment
from modules.school_calendar.models import AcademicCalendarEvent
from modules.attendance.models import (
    AttendanceAuditLog,
    AttendanceNotification,
    AttendanceSettings,
    LeaveApplication,
    LeaveApplicationHistory,
    LeaveBalance,
    LeaveType,
    StaffAttendance,
    StudentAttendance,
)
from modules.institutes.api.permissions import IsAttendanceLeaveReviewer, IsCurrentInstituteAdmin
from modules.institutes.models import Branch, InstituteMembership
from modules.people.models import Student, StudentGuardian


def _branch(request, branch_id):
    if not branch_id:
        return None
    return get_object_or_404(Branch, id=branch_id, institute=request.institute, is_active=True)


def _date_range(month):
    try:
        year, month_number = (int(value) for value in month.split("-"))
        start = date(year, month_number, 1)
        return start, date(year, month_number, monthrange(year, month_number)[1])
    except (TypeError, ValueError):
        raise serializers.ValidationError({"month": "Use YYYY-MM format."})


class AttendanceSerializer(serializers.ModelSerializer):
    studentId = serializers.UUIDField(source="student_id", read_only=True)
    studentName = serializers.SerializerMethodField()
    captureMode = serializers.CharField(source="capture_mode", read_only=True)
    periodLabel = serializers.CharField(source="period_label", read_only=True)
    subjectId = serializers.UUIDField(source="subject_id", read_only=True, allow_null=True)

    class Meta:
        model = StudentAttendance
        fields = ("id", "studentId", "studentName", "date", "status", "captureMode", "periodLabel", "subjectId", "remark")

    def get_studentName(self, value):
        return value.student.full_name


class AttendanceWriteSerializer(serializers.Serializer):
    studentId = serializers.UUIDField()
    date = serializers.DateField(required=False)
    status = serializers.ChoiceField(choices=StudentAttendance.Status.choices)
    captureMode = serializers.ChoiceField(choices=StudentAttendance.CaptureMode.choices, required=False)
    periodId = serializers.UUIDField(required=False, allow_null=True)
    periodLabel = serializers.CharField(max_length=80, required=False, allow_blank=True)
    subjectId = serializers.UUIDField(required=False, allow_null=True)
    remark = serializers.CharField(max_length=500, required=False, allow_blank=True)


class BulkAttendanceSerializer(serializers.Serializer):
    date = serializers.DateField()
    classSectionId = serializers.UUIDField(required=False, allow_null=True)
    periodId = serializers.UUIDField(required=False, allow_null=True)
    periodLabel = serializers.CharField(max_length=80, required=False, allow_blank=True)
    subjectId = serializers.UUIDField(required=False, allow_null=True)
    captureMode = serializers.ChoiceField(choices=StudentAttendance.CaptureMode.choices, required=False)
    records = serializers.ListField(child=serializers.DictField(), allow_empty=False)


def _approved_leave_ids(*, institute, student_ids, selected_date):
    return set(
        LeaveApplication.objects.filter(
            institute=institute,
            applicant_type=LeaveApplication.ApplicantType.STUDENT,
            student_id__in=student_ids,
            status=LeaveApplication.Status.APPROVED,
            start_date__lte=selected_date,
            end_date__gte=selected_date,
        ).values_list("student_id", flat=True)
    )


def _queue_absence_notifications(*, institute, student, actor, date_value):
    settings, _ = AttendanceSettings.objects.get_or_create(institute=institute)
    recipients = {}
    if settings.enable_parent_notifications:
        parents = StudentGuardian.objects.filter(student=student, parent__institute=institute).select_related("parent__user")
        for link in parents:
            recipients[link.parent.user_id] = link.parent.user
    enrollment = StudentEnrollment.objects.filter(
        student=student, left_at__isnull=True
    ).select_related("class_section__class_teacher").first()
    if settings.notify_class_teacher and enrollment and enrollment.class_section.class_teacher_id:
        teacher = enrollment.class_section.class_teacher
        recipients[teacher.id] = teacher
    if settings.notify_branch_admin:
        admins = InstituteMembership.objects.filter(
            institute=institute, branch=student.branch, role=InstituteMembership.Role.BRANCH_ADMIN, is_active=True
        ).select_related("user")
        for membership in admins:
            recipients[membership.user_id] = membership.user
    for recipient in recipients.values():
        AttendanceNotification.objects.create(
            institute=institute,
            student=student,
            user=recipient,
            notification_type=AttendanceNotification.NotificationType.ABSENCE,
            channel="in_app",
            payload={"studentId": str(student.id), "date": date_value.isoformat(), "message": f"{student.full_name} was marked absent."},
        )


def _validate_attendance_settings(*, institute, data):
    settings, _ = AttendanceSettings.objects.get_or_create(institute=institute)
    enabled_modes = settings.enabled_capture_modes or [StudentAttendance.CaptureMode.MANUAL]
    capture_mode = data.get("captureMode") or StudentAttendance.CaptureMode.MANUAL
    if capture_mode not in enabled_modes:
        raise serializers.ValidationError({"captureMode": ["This capture mode is disabled in Attendance Settings."]})
    if not settings.period_wise_enabled and (data.get("periodId") or data.get("periodLabel") or data.get("subjectId")):
        raise serializers.ValidationError({"periodLabel": ["Period or subject-wise attendance is disabled in Attendance Settings."]})
    return settings


def _write_attendance(*, request, student, data, selected_date):
    _validate_attendance_settings(institute=request.institute, data=data)
    existing = StudentAttendance.objects.filter(student=student, date=selected_date, period_id=data.get("periodId")).first()
    previous_status = existing.status if existing else ""
    record, _ = StudentAttendance.objects.update_or_create(
        student=student,
        date=selected_date,
        period_id=data.get("periodId"),
        defaults={
            "institute": request.institute,
            "branch": student.branch,
            "status": data["status"],
            "capture_mode": data.get("captureMode", "manual"),
            "period_label": data.get("periodLabel", ""),
            "subject_id": data.get("subjectId"),
            "remark": data.get("remark", ""),
        },
    )
    if previous_status and previous_status != record.status:
        action = "corrected"
    else:
        action = "marked"
    AttendanceAuditLog.objects.create(
        attendance=record,
        institute=request.institute,
        actor=request.user,
        action=action,
        previous_status=previous_status,
        next_status=record.status,
        note=record.remark,
    )
    if record.status == StudentAttendance.Status.ABSENT and previous_status != record.status:
        _queue_absence_notifications(institute=request.institute, student=student, actor=request.user, date_value=selected_date)
    return record


def _roster(request, selected_date):
    branch = _branch(request, request.query_params.get("branchId"))
    students = Student.objects.filter(institute=request.institute, is_active=True).select_related("branch")
    if branch:
        students = students.filter(branch=branch)
    search = request.query_params.get("search", "").strip()
    if search:
        students = students.filter(
            Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(admission_number__icontains=search)
        )
    class_id = request.query_params.get("classId")
    section_id = request.query_params.get("sectionId")
    enrollments = StudentEnrollment.objects.filter(
        student_id__in=students.values("id"), left_at__isnull=True
    ).select_related("class_section__grade", "class_section__branch")
    if class_id:
        enrollments = enrollments.filter(class_section__grade_id=class_id)
    if section_id:
        enrollments = enrollments.filter(class_section_id=section_id)
    enrollment_by_student = {item.student_id: item for item in enrollments}
    if class_id or section_id:
        students = students.filter(id__in=enrollment_by_student)
    attendance = {
        item.student_id: item
        for item in StudentAttendance.objects.filter(
            institute=request.institute, date=selected_date, student_id__in=students.values("id")
        )
    }
    approved_leaves = LeaveApplication.objects.filter(
        institute=request.institute,
        applicant_type=LeaveApplication.ApplicantType.STUDENT,
        student_id__in=students.values("id"),
        status=LeaveApplication.Status.APPROVED,
        start_date__lte=selected_date,
        end_date__gte=selected_date,
    ).values("student_id", "id")
    leave_ids = {item["student_id"]: str(item["id"]) for item in approved_leaves}
    result = []
    for student in students.order_by("first_name", "last_name", "admission_number"):
        enrollment = enrollment_by_student.get(student.id)
        record = attendance.get(student.id)
        on_leave = student.id in leave_ids
        result.append(
            {
                "id": str(record.id) if record else f"roster-{student.id}",
                "studentId": str(student.id),
                "firstName": student.first_name,
                "lastName": student.last_name,
                "admissionNumber": student.admission_number,
                "rollNumber": enrollment.roll_number if enrollment else None,
                "classId": str(enrollment.class_section.grade_id) if enrollment else "",
                "sectionId": str(enrollment.class_section_id) if enrollment else "",
                "className": enrollment.class_section.grade.name if enrollment else "",
                "sectionName": enrollment.class_section.section_name if enrollment else "",
                "status": "ON_LEAVE" if on_leave else (record.status if record else "NOT_MARKED"),
                "remark": record.remark if record else "",
                "captureMode": record.capture_mode if record else "manual",
                "leaveApplicationId": leave_ids.get(student.id),
                "autoPrefilled": on_leave,
            }
        )
    return result


class DailyRosterView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        selected_date = request.query_params.get("date") or timezone.localdate()
        return Response({"success": True, "data": _roster(request, selected_date)})


class BulkAttendanceView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request):
        serializer = BulkAttendanceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        root_data = {
            "captureMode": serializer.validated_data.get("captureMode"),
            "periodId": serializer.validated_data.get("periodId"),
            "periodLabel": serializer.validated_data.get("periodLabel", ""),
            "subjectId": serializer.validated_data.get("subjectId"),
        }
        _validate_attendance_settings(institute=request.institute, data=root_data)
        selected_date = serializer.validated_data["date"]
        updated = 0
        for raw in serializer.validated_data["records"]:
            item = AttendanceWriteSerializer(data={**raw, "date": selected_date, "captureMode": raw.get("captureMode") or serializer.validated_data.get("captureMode") or "manual", "periodId": serializer.validated_data.get("periodId"), "periodLabel": serializer.validated_data.get("periodLabel", ""), "subjectId": serializer.validated_data.get("subjectId")})
            item.is_valid(raise_exception=True)
            student = get_object_or_404(
                Student, id=item.validated_data["studentId"], institute=request.institute, is_active=True
            )
            leave_exists = LeaveApplication.objects.filter(
                institute=request.institute,
                student=student,
                status=LeaveApplication.Status.APPROVED,
                start_date__lte=selected_date,
                end_date__gte=selected_date,
            ).exists()
            if leave_exists:
                continue
            _write_attendance(request=request, student=student, data=item.validated_data, selected_date=selected_date)
            updated += 1
        return Response({"success": True, "data": {"success": True, "updatedCount": updated}})


class StaffAttendanceView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        records = StaffAttendance.objects.filter(institute=request.institute).select_related("user", "branch")
        if request.query_params.get("userId"):
            records = records.filter(user_id=request.query_params["userId"])
        if request.query_params.get("branchId"):
            records = records.filter(branch_id=request.query_params["branchId"])
        if request.query_params.get("dateFrom"):
            records = records.filter(date__gte=request.query_params["dateFrom"])
        if request.query_params.get("dateTo"):
            records = records.filter(date__lte=request.query_params["dateTo"])
        return Response({"success": True, "data": [{"id": str(item.id), "userId": str(item.user_id), "name": item.user.get_full_name() or item.user.email, "branchId": str(item.branch_id), "date": item.date.isoformat(), "status": item.status, "remark": item.remark} for item in records]})

    def post(self, request):
        user_id = request.data.get("userId")
        branch = _branch(request, request.data.get("branchId"))
        if not branch:
            raise serializers.ValidationError({"branchId": ["A valid branch is required."]})
        # Verify the staff user belongs to this institute before creating/modifying attendance.
        if not InstituteMembership.objects.filter(
            user_id=user_id, institute=request.institute, is_active=True,
        ).exists():
            raise serializers.ValidationError({"userId": ["The user does not belong to this institute."]})
        record, _ = StaffAttendance.objects.update_or_create(
            user_id=user_id, date=request.data.get("date"),
            defaults={
                "institute": request.institute,
                "branch": branch,
                "status": request.data.get("status"),
                "remark": request.data.get("remark", ""),
            },
        )
        return Response({"success": True, "data": {"id": str(record.id), "status": record.status}})


class AttendanceReminderView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        selected_date = request.query_params.get("date") or timezone.localdate()
        branch = _branch(request, request.query_params.get("branchId"))
        sections = ClassSection.objects.filter(academic_year__institute=request.institute)
        if branch:
            sections = sections.filter(branch=branch)
        marked_sections = StudentAttendance.objects.filter(institute=request.institute, date=selected_date).values_list("student_id", flat=True)
        missing = []
        for section in sections.select_related("branch", "grade", "class_teacher"):
            enrolled = StudentEnrollment.objects.filter(class_section=section, left_at__isnull=True).values_list("student_id", flat=True)
            if not enrolled.exists() or not set(enrolled).difference(set(marked_sections)):
                continue
            missing.append({"sectionId": str(section.id), "classId": str(section.grade_id), "className": section.grade.name, "sectionName": section.section_name, "branchId": str(section.branch_id), "teacherName": section.class_teacher.get_full_name() if section.class_teacher else None})
        return Response({"success": True, "data": {"date": str(selected_date), "missingSections": missing}})


class AttendanceOverviewView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        start, end = _date_range(request.query_params.get("month") or timezone.localdate().strftime("%Y-%m"))
        branch = _branch(request, request.query_params.get("branchId"))
        records = StudentAttendance.objects.filter(
            institute=request.institute, date__range=(start, end)
        ).select_related("student")
        if branch:
            records = records.filter(branch=branch)
        class_id = request.query_params.get("classId")
        section_id = request.query_params.get("sectionId")
        if class_id or section_id:
            enrollment_filter = Q(class_section_id=section_id) if section_id else Q(class_section__grade_id=class_id)
            scoped_student_ids = StudentEnrollment.objects.filter(enrollment_filter, left_at__isnull=True).values("student_id")
            records = records.filter(student_id__in=scoped_student_ids)
        holiday_dates = set()
        holiday_events = AcademicCalendarEvent.objects.filter(institute=request.institute, event_type="HOLIDAY", starts_on__lte=end, ends_on__gte=start)
        for event in holiday_events:
            if event.branch_id is None or not branch or event.branch_id == branch.id:
                cursor = event.starts_on
                while cursor <= event.ends_on:
                    holiday_dates.add(cursor.isoformat())
                    cursor += timedelta(days=1)
        today = timezone.localdate()
        by_date = {}
        for item in records:
            key = item.date.isoformat()
            current = by_date.setdefault(key, {"total": 0, "attended": 0})
            current["total"] += 1
            current["attended"] += int(item.status in (StudentAttendance.Status.PRESENT, StudentAttendance.Status.LATE))
        calendar = []
        for day in range(1, end.day + 1):
            day_date = date(start.year, start.month, day)
            key = day_date.isoformat()
            if key in holiday_dates or day_date.weekday() >= 5:
                state = "non_applicable"
            elif day_date > today:
                state = "future"
            elif key not in by_date:
                state = "missing"
            else:
                state = "recorded"
            current = by_date.get(key, {"total": 0, "attended": 0})
            calendar.append({"date": key, "state": state, "percentage": round(current["attended"] * 100 / current["total"], 1) if current["total"] else None})
        return Response({"success": True, "data": {
                "records": AttendanceSerializer(records, many=True).data,
                "calendarDates": [
                        f"{start.year:04d}-{start.month:02d}-{day:02d}"
                        for day in range(1, end.day + 1)
                ],
                "calendar": calendar,
            }})

    def post(self, request):
        serializer = AttendanceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        selected_date = serializer.validated_data.get("date", timezone.localdate())
        student = get_object_or_404(
            Student, id=serializer.validated_data["studentId"], institute=request.institute, is_active=True
        )
        if LeaveApplication.objects.filter(
            institute=request.institute,
            student=student,
            status=LeaveApplication.Status.APPROVED,
            start_date__lte=selected_date,
            end_date__gte=selected_date,
        ).exists():
            raise serializers.ValidationError({"status": ["Approved leave locks this attendance date."]})
        record = _write_attendance(request=request, student=student, data=serializer.validated_data, selected_date=selected_date)
        return Response({"success": True, "data": AttendanceSerializer(record).data}, status=status.HTTP_201_CREATED)


class LeaveApplicationListView(APIView):
    permission_classes = (IsAttendanceLeaveReviewer,)

    def get(self, request):
        branch = _branch(request, request.query_params.get("branchId"))
        queryset = LeaveApplication.objects.filter(institute=request.institute).select_related(
            "student", "staff_user", "applied_by", "leave_type", "reviewed_by", "branch"
        )
        membership = request.institute_membership
        if membership.role == InstituteMembership.Role.BRANCH_ADMIN:
            # Branch admins are locked to their own branch; query-param branch is ignored.
            queryset = queryset.filter(branch_id=membership.branch_id)
        elif membership.role == InstituteMembership.Role.TEACHER:
            teacher_students = StudentEnrollment.objects.filter(
                class_section__class_teacher=request.user,
                class_section__branch_id=membership.branch_id,
                left_at__isnull=True,
            ).values("student_id")
            queryset = queryset.filter(
                applicant_type=LeaveApplication.ApplicantType.STUDENT,
                student_id__in=teacher_students,
            )
        elif branch:
            # Institute admins can optionally filter by branch.
            queryset = queryset.filter(branch=branch)
        applicant_type = request.query_params.get("applicantType")
        if applicant_type:
            queryset = queryset.filter(applicant_type=applicant_type)
        if request.query_params.get("status"):
            queryset = queryset.filter(status=request.query_params["status"])
        search = request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(student__first_name__icontains=search)
                | Q(student__last_name__icontains=search)
                | Q(staff_user__first_name__icontains=search)
                | Q(staff_user__last_name__icontains=search)
                | Q(reason__icontains=search)
            )
        data = []
        current_year = AcademicYear.objects.filter(institute=request.institute, is_current=True).first()
        for item in queryset:
            balance = None
            if current_year:
                balance = LeaveBalance.objects.filter(
                    leave_type=item.leave_type, academic_year=current_year,
                    **({"student_id": item.student_id} if item.student_id else {"user_id": item.staff_user_id}),
                ).first()
            data.append(
                {
                    "id": str(item.id),
                    "applicantType": item.applicant_type,
                    "studentId": str(item.student_id) if item.student_id else None,
                    "studentName": item.student.full_name if item.student else None,
                    "staffUserId": str(item.staff_user_id) if item.staff_user_id else None,
                    "staffName": item.staff_user.get_full_name() if item.staff_user else None,
                    "branchId": str(item.branch_id),
                    "appliedBy": str(item.applied_by_id),
                    "appliedByName": item.applied_by.get_full_name() or item.applied_by.email,
                    "leaveTypeId": str(item.leave_type_id),
                    "leaveTypeName": item.leave_type.name,
                    "startDate": item.start_date.isoformat(),
                    "endDate": item.end_date.isoformat(),
                    "totalDays": float(item.total_days),
                    "halfDayType": item.half_day_type,
                    "reason": item.reason,
                    "status": item.status,
                    "reviewedBy": str(item.reviewed_by_id) if item.reviewed_by_id else None,
                    "reviewedByName": item.reviewed_by.get_full_name() if item.reviewed_by else None,
                    "reviewedAt": item.reviewed_at.isoformat() if item.reviewed_at else None,
                    "reviewNote": item.review_note,
                    "rejectionReason": item.rejection_reason,
                    "documentUrl": item.supporting_document_url or None,
                    "balanceAllocated": float(balance.allocated_days) if balance else None,
                    "balanceUsed": float(balance.used_days) if balance else None,
                    "balanceRemaining": float(balance.allocated_days - balance.used_days - balance.pending_days) if balance else None,
                    "autoPrefilledAttendance": item.applicant_type == "student" and item.status == "approved",
                    "createdAt": item.created_at.isoformat(),
                }
            )
        return Response({"success": True, "data": data})


def _leave_action(request, application_id, *, approve):
    application = get_object_or_404(LeaveApplication, id=application_id, institute=request.institute)
    membership = request.institute_membership
    settings, _ = AttendanceSettings.objects.get_or_create(institute=request.institute)
    configured_route = settings.student_leave_routing if application.applicant_type == LeaveApplication.ApplicantType.STUDENT else settings.staff_leave_routing
    if application.applicant_type == LeaveApplication.ApplicantType.STUDENT:
        allowed_roles = {
            "class_teacher": {InstituteMembership.Role.TEACHER, InstituteMembership.Role.INSTITUTE_ADMIN},
            "branch_admin": {InstituteMembership.Role.BRANCH_ADMIN, InstituteMembership.Role.INSTITUTE_ADMIN},
            "both": {InstituteMembership.Role.TEACHER, InstituteMembership.Role.BRANCH_ADMIN, InstituteMembership.Role.INSTITUTE_ADMIN},
        }.get(configured_route, {InstituteMembership.Role.INSTITUTE_ADMIN})
    else:
        allowed_roles = {
            "branch_admin": {InstituteMembership.Role.BRANCH_ADMIN, InstituteMembership.Role.INSTITUTE_ADMIN},
            "institute_admin": {InstituteMembership.Role.INSTITUTE_ADMIN},
        }.get(configured_route, {InstituteMembership.Role.INSTITUTE_ADMIN})
    if membership.role not in allowed_roles:
        raise PermissionDenied("This leave approval route is restricted by Attendance Settings.")
    if membership.role == InstituteMembership.Role.BRANCH_ADMIN and application.branch_id != membership.branch_id:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("This leave application is outside your branch.")
    if membership.role == InstituteMembership.Role.TEACHER:
        may_review = (
            application.applicant_type == LeaveApplication.ApplicantType.STUDENT
            and StudentEnrollment.objects.filter(
                student_id=application.student_id,
                class_section__class_teacher=request.user,
                class_section__branch_id=membership.branch_id,
                left_at__isnull=True,
            ).exists()
        )
        if not may_review:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Class teachers may only review leave for students currently assigned to their class.")
    if application.status != LeaveApplication.Status.PENDING:
        raise serializers.ValidationError({"status": ["Only pending leave can be reviewed."]})
    if approve:
        application.status = LeaveApplication.Status.APPROVED
        application.review_note = request.data.get("note", "")
        application.rejection_reason = ""
    else:
        reason = str(request.data.get("rejectionReason", "")).strip()
        if not reason:
            raise serializers.ValidationError({"rejectionReason": ["Rejection reason is required."]})
        application.status = LeaveApplication.Status.REJECTED
        application.rejection_reason = reason
        application.review_note = reason
    application.reviewed_by = request.user
    application.reviewed_at = timezone.now()
    application.save(update_fields=("status", "review_note", "rejection_reason", "reviewed_by", "reviewed_at", "updated_at"))
    LeaveApplicationHistory.objects.create(application=application, action="approved" if approve else "rejected", actor=request.user, note=application.review_note)
    current_year = AcademicYear.objects.filter(institute=request.institute, is_current=True).first()
    if current_year:
        balance_filter = {"leave_type": application.leave_type, "academic_year": current_year}
        balance_filter["student_id" if application.student_id else "user_id"] = application.student_id or application.staff_user_id
        balance = LeaveBalance.objects.filter(**balance_filter).first()
        if balance:
            balance.pending_days = max(Decimal("0"), balance.pending_days - application.total_days)
            if approve:
                balance.used_days += application.total_days
            balance.save(update_fields=("pending_days", "used_days", "updated_at"))
    guardian = StudentGuardian.objects.filter(student=application.student, parent__institute=request.institute).select_related("parent__user").first() if application.student_id else None
    recipient = guardian.parent.user if guardian else application.staff_user
    if recipient:
        AttendanceNotification.objects.create(
            institute=request.institute, student=application.student, user=recipient,
            notification_type=AttendanceNotification.NotificationType.LEAVE_DECISION,
            channel="in_app", payload={"leaveApplicationId": str(application.id), "status": application.status},
        )
    return Response({"success": True, "data": {"id": str(application.id), "status": application.status, "reviewNote": application.review_note, "rejectionReason": application.rejection_reason}})


class LeaveApproveView(APIView):
    permission_classes = (IsAttendanceLeaveReviewer,)

    def post(self, request, application_id):
        return _leave_action(request, application_id, approve=True)


class LeaveRejectView(APIView):
    permission_classes = (IsAttendanceLeaveReviewer,)

    def post(self, request, application_id):
        return _leave_action(request, application_id, approve=False)


class LeaveHistoryView(APIView):
    permission_classes = (IsAttendanceLeaveReviewer,)

    def get(self, request, application_id):
        application = get_object_or_404(LeaveApplication, id=application_id, institute=request.institute)
        membership = request.institute_membership
        if membership.role == InstituteMembership.Role.BRANCH_ADMIN and application.branch_id != membership.branch_id:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("This leave application is outside your branch.")
        if membership.role == InstituteMembership.Role.TEACHER and not StudentEnrollment.objects.filter(
            student_id=application.student_id,
            class_section__class_teacher=request.user,
            class_section__branch_id=membership.branch_id,
            left_at__isnull=True,
        ).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("This leave application is outside your assigned class.")
        return Response({"success": True, "data": [{
            "id": str(item.id), "action": item.action, "actorId": str(item.actor_id) if item.actor_id else None,
            "actorName": item.actor.get_full_name() if item.actor else None, "note": item.note, "createdAt": item.created_at.isoformat(),
        } for item in application.history.select_related("actor")]})


class AttendanceNotificationActionView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request, notification_id, action):
        item = get_object_or_404(AttendanceNotification, id=notification_id, institute=request.institute)
        if item.user_id and item.user_id != request.user.id and not request.user.is_staff:
            return Response({"success": False, "error": {"message": "You cannot act on this notification."}}, status=status.HTTP_403_FORBIDDEN)
        settings, _ = AttendanceSettings.objects.get_or_create(institute=request.institute)
        if action in {"acknowledge", "dispute"} and not settings.parent_acknowledgement_enabled:
            return Response({"success": False, "error": {"message": "Parent acknowledgement and dispute actions are disabled in Attendance Settings."}}, status=status.HTTP_403_FORBIDDEN)
        if action == "acknowledge":
            item.acknowledged_at = timezone.now()
        elif action == "dispute":
            item.disputed_at = timezone.now()
        else:
            raise serializers.ValidationError({"action": ["Unsupported notification action."]})
        item.save(update_fields=("acknowledged_at", "disputed_at", "updated_at"))
        return Response({"success": True, "data": {"id": str(item.id), "action": action}})


class LowAttendanceAlertsView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        branch = _branch(request, request.query_params.get("branchId"))
        settings, _ = AttendanceSettings.objects.get_or_create(institute=request.institute)
        if not settings.enable_auto_alerts:
            return Response({"success": True, "data": []})
        threshold = Decimal(request.query_params.get("threshold", settings.low_attendance_threshold))
        students = Student.objects.filter(institute=request.institute, is_active=True).select_related("branch")
        if branch:
            students = students.filter(branch=branch)
        year_start = date(timezone.localdate().year, 1, 1)
        data = []
        for student in students:
            records = StudentAttendance.objects.filter(student=student, date__gte=year_start, date__lte=timezone.localdate())
            total = records.count()
            if not total:
                continue
            attended = records.filter(status__in=(StudentAttendance.Status.PRESENT, StudentAttendance.Status.LATE)).count()
            percentage = round(attended * 100 / total, 1)
            absences = list(records.filter(status=StudentAttendance.Status.ABSENT).order_by("-date").values_list("date", flat=True))
            consecutive = 0
            for absent_date in absences:
                if consecutive == 0 or (absences[consecutive - 1] - absent_date).days == 1:
                    consecutive += 1
                else:
                    break
            if percentage >= threshold and consecutive < settings.consecutive_absent_threshold:
                continue
            enrollment = StudentEnrollment.objects.filter(student=student, left_at__isnull=True).select_related("class_section__grade").first()
            data.append({
                "studentId": str(student.id),
                "studentName": student.full_name,
                "admissionNumber": student.admission_number,
                "className": enrollment.class_section.grade.name if enrollment else "",
                "sectionName": enrollment.class_section.section_name if enrollment else "",
                "branchId": str(student.branch_id),
                "totalClasses": total,
                "attendedClasses": attended,
                "attendancePercentage": percentage,
                "consecutiveAbsences": consecutive,
                "lastAbsentDate": absences[0].isoformat() if absences else None,
            })
        return Response({"success": True, "data": data})


class LowAttendanceNotifyView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request, student_id):
        student = get_object_or_404(Student, id=student_id, institute=request.institute, is_active=True)
        _queue_absence_notifications(institute=request.institute, student=student, actor=request.user, date_value=timezone.localdate())
        return Response({"success": True, "data": {"studentId": str(student.id), "queued": True}})


class AttendanceReportsView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        branch = _branch(request, request.query_params.get("branchId"))
        end = timezone.localdate()
        start = end.replace(day=1)
        if request.query_params.get("dateFrom"):
            start = datetime.strptime(request.query_params["dateFrom"], "%Y-%m-%d").date()
        if request.query_params.get("dateTo"):
            end = datetime.strptime(request.query_params["dateTo"], "%Y-%m-%d").date()
        records = StudentAttendance.objects.filter(institute=request.institute, date__range=(start, end))
        if request.query_params.get("studentId"):
            records = records.filter(student_id=request.query_params["studentId"])
        if branch:
            records = records.filter(branch=branch)
        class_id = request.query_params.get("classId")
        section_id = request.query_params.get("sectionId")
        if class_id or section_id:
            enrollment_filter = Q(class_section_id=section_id) if section_id else Q(class_section__grade_id=class_id)
            records = records.filter(student_id__in=StudentEnrollment.objects.filter(enrollment_filter, left_at__isnull=True).values("student_id"))
        if request.query_params.get("subjectId"):
            records = records.filter(subject_id=request.query_params["subjectId"])
        summary = {"present": 0, "absent": 0, "late": 0, "excused": 0, "total": records.count()}
        for item in records.values("status"):
            key = item["status"].lower()
            if key in summary:
                summary[key] += 1
        summary["attendancePercentage"] = round((summary["present"] + summary["late"]) * 100 / summary["total"], 1) if summary["total"] else 0
        trend = []
        day_count = (end - start).days + 1
        for offset in range(day_count):
            day_date = start + timedelta(days=offset)
            day_records = records.filter(date=day_date)
            total = day_records.count()
            attended = day_records.filter(status__in=(StudentAttendance.Status.PRESENT, StudentAttendance.Status.LATE)).count()
            trend.append({"date": day_date.isoformat(), "total": total, "present": attended, "percentage": round(attended * 100 / total, 1) if total else 0})
        staff_records = StaffAttendance.objects.filter(institute=request.institute, date__range=(start, end)).select_related("user")
        if branch:
            staff_records = staff_records.filter(branch=branch)
        staff_summary = []
        staff_ids = staff_records.values_list("user_id", flat=True).distinct()
        for user_id in staff_ids:
            person_records = staff_records.filter(user_id=user_id)
            total = person_records.count()
            late = person_records.filter(status=StaffAttendance.Status.LATE).count()
            person = person_records.first().user
            staff_summary.append({"userId": str(user_id), "name": person.get_full_name() or person.email, "totalDays": total, "lateDays": late, "latePercentage": round(late * 100 / total, 1) if total else 0})
        return Response({"success": True, "data": {"summary": summary, "trend": trend, "staffSummary": staff_summary, "atRisk": [], "academicPerformanceAvailable": False}})


class AttendanceSettingsView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        settings, _ = AttendanceSettings.objects.get_or_create(institute=request.institute)
        return Response({"success": True, "data": _settings_data(settings)})

    def patch(self, request):
        settings, _ = AttendanceSettings.objects.get_or_create(institute=request.institute)
        allowed = {
            "lowAttendanceThreshold": "low_attendance_threshold",
            "enableParentNotifications": "enable_parent_notifications",
            "enableAutoAlerts": "enable_auto_alerts",
            "consecutiveAbsentThreshold": "consecutive_absent_threshold",
            "notifyClassTeacher": "notify_class_teacher",
            "notifyBranchAdmin": "notify_branch_admin",
            "unmarkedReminderTime": "unmarked_reminder_time",
            "enabledCaptureModes": "enabled_capture_modes",
            "studentLeaveRouting": "student_leave_routing",
            "staffLeaveRouting": "staff_leave_routing",
            "parentAcknowledgementEnabled": "parent_acknowledgement_enabled",
            "periodWiseEnabled": "period_wise_enabled",
        }
        for key, field in allowed.items():
            if key in request.data:
                if key == "enabledCaptureModes":
                    modes = request.data[key]
                    if not isinstance(modes, list) or not modes:
                        raise serializers.ValidationError({key: ["At least one capture mode must be enabled."]})
                    valid_modes = {choice for choice, _ in StudentAttendance.CaptureMode.choices}
                    if any(mode not in valid_modes for mode in modes):
                        raise serializers.ValidationError({key: ["One or more capture modes are invalid."]})
                setattr(settings, field, request.data[key])
        settings.save()
        return Response({"success": True, "data": _settings_data(settings)})


def _settings_data(settings):
    return {
        "id": str(settings.id),
        "instituteId": str(settings.institute_id),
        "lowAttendanceThreshold": float(settings.low_attendance_threshold),
        "enableParentNotifications": settings.enable_parent_notifications,
        "enableAutoAlerts": settings.enable_auto_alerts,
        "consecutiveAbsentThreshold": settings.consecutive_absent_threshold,
        "notifyClassTeacher": settings.notify_class_teacher,
        "notifyBranchAdmin": settings.notify_branch_admin,
        "unmarkedReminderTime": settings.unmarked_reminder_time.isoformat() if settings.unmarked_reminder_time else None,
        "enabledCaptureModes": settings.enabled_capture_modes or ["manual"],
        "studentLeaveRouting": settings.student_leave_routing,
        "staffLeaveRouting": settings.staff_leave_routing,
        "parentAcknowledgementEnabled": settings.parent_acknowledgement_enabled,
        "periodWiseEnabled": settings.period_wise_enabled,
        "updatedAt": settings.updated_at.isoformat(),
    }


class LeaveTypesView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        types = LeaveType.objects.filter(institute=request.institute, is_active=True).order_by("name")
        return Response({"success": True, "data": [{
            "id": str(item.id), "instituteId": str(item.institute_id), "name": item.name, "code": item.code,
            "description": item.description, "applicableTo": item.applicable_to, "maxDaysPerYear": item.max_days_per_year,
            "requiresDocument": item.requires_document, "isActive": item.is_active, "createdAt": item.created_at.isoformat(),
        } for item in types]})

    def post(self, request):
        item = LeaveType.objects.create(
            institute=request.institute,
            name=str(request.data.get("name", "")).strip(),
            code=str(request.data.get("code", "")).strip().upper(),
            description=str(request.data.get("description", "")),
            applicable_to=request.data.get("applicableTo", "both"),
            max_days_per_year=int(request.data.get("maxDaysPerYear", 0) or 0),
            requires_document=bool(request.data.get("requiresDocument", False)),
        )
        return Response({"success": True, "data": {"id": str(item.id), "name": item.name}}, status=status.HTTP_201_CREATED)


class LeaveTypeDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def patch(self, request, type_id):
        item = get_object_or_404(LeaveType, id=type_id, institute=request.institute)
        allowed = {"name": "name", "code": "code", "description": "description", "applicableTo": "applicable_to", "maxDaysPerYear": "max_days_per_year", "requiresDocument": "requires_document", "isActive": "is_active"}
        for key, field in allowed.items():
            if key in request.data:
                setattr(item, field, request.data[key])
        item.save()
        return Response({"success": True, "data": {"id": str(item.id), "name": item.name, "isActive": item.is_active}})


class LeaveBalancesView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        balances = LeaveBalance.objects.filter(leave_type__institute=request.institute).select_related("leave_type")
        if request.query_params.get("studentId"):
            balances = balances.filter(student_id=request.query_params["studentId"])
        if request.query_params.get("userId"):
            balances = balances.filter(user_id=request.query_params["userId"])
        return Response({"success": True, "data": [_balance_data(item) for item in balances]})

    def post(self, request):
        target_type = request.data.get("targetType")
        target_id = request.data.get("targetId")
        leave_type = get_object_or_404(LeaveType, id=request.data.get("leaveTypeId"), institute=request.institute)
        year = AcademicYear.objects.filter(institute=request.institute, is_current=True).first() or AcademicYear.objects.filter(institute=request.institute).order_by("-start_date").first()
        if not year:
            raise serializers.ValidationError({"academicYearId": ["Create an academic year first."]})
        defaults = {"allocated_days": request.data.get("allocatedDays", 0)}
        lookup = {"leave_type": leave_type, "academic_year": year}
        if target_type == "student": lookup["student_id"] = target_id
        elif target_type == "staff": lookup["user_id"] = target_id
        else: raise serializers.ValidationError({"targetType": ["Use student or staff."]})
        balance, _ = LeaveBalance.objects.update_or_create(**lookup, defaults=defaults)
        return Response({"success": True, "data": _balance_data(balance)})


def _balance_data(item):
    return {
        "id": str(item.id), "studentId": str(item.student_id) if item.student_id else None,
        "userId": str(item.user_id) if item.user_id else None, "leaveTypeId": str(item.leave_type_id),
        "leaveTypeName": item.leave_type.name, "academicYearId": str(item.academic_year_id),
        "totalAllocated": float(item.allocated_days), "usedDays": float(item.used_days),
        "pendingDays": float(item.pending_days), "remainingDays": float(item.allocated_days - item.used_days - item.pending_days),
    }
