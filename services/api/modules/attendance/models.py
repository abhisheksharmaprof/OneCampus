import uuid

from django.db import models

from platform_core.models import TimeStampedModel


class StudentAttendance(TimeStampedModel):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        LATE = "LATE", "Late"
        EXCUSED = "EXCUSED", "Excused"

    class CaptureMode(models.TextChoices):
        MANUAL = "manual", "Manual"
        QR = "qr", "QR"
        RFID = "rfid", "RFID"
        BIOMETRIC = "biometric", "Biometric"
        FACE = "face", "Face recognition"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute", on_delete=models.CASCADE, related_name="student_attendance"
    )
    branch = models.ForeignKey(
        "institutes.Branch", on_delete=models.PROTECT, related_name="student_attendance"
    )
    student = models.ForeignKey(
        "people.Student", on_delete=models.CASCADE, related_name="attendance_records"
    )
    date = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices)
    capture_mode = models.CharField(max_length=15, choices=CaptureMode.choices, default=CaptureMode.MANUAL)
    remark = models.CharField(max_length=500, blank=True)
    period_id = models.UUIDField(null=True, blank=True)
    period_label = models.CharField(max_length=80, blank=True)
    subject_id = models.UUIDField(null=True, blank=True)

    class Meta:
        ordering = ("-date", "student_id")
        constraints = [
            models.UniqueConstraint(
                fields=("student", "date", "period_id"), name="uq_student_attendance_per_period"
            )
        ]
        indexes = [models.Index(fields=("institute", "branch", "date"))]


class StaffAttendance(TimeStampedModel):
    class Status(models.TextChoices):
        PRESENT = "PRESENT", "Present"
        ABSENT = "ABSENT", "Absent"
        LATE = "LATE", "Late"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("institutes.Institute", on_delete=models.CASCADE, related_name="staff_attendance")
    branch = models.ForeignKey("institutes.Branch", on_delete=models.PROTECT, related_name="staff_attendance")
    user = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="staff_attendance_records")
    date = models.DateField()
    status = models.CharField(max_length=16, choices=Status.choices)
    remark = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ("-date", "user_id")
        constraints = [models.UniqueConstraint(fields=("user", "date"), name="uq_staff_attendance_per_day")]


class LeaveType(TimeStampedModel):
    class AppliesTo(models.TextChoices):
        STUDENT = "student", "Student"
        STAFF = "staff", "Staff"
        BOTH = "both", "Both"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("institutes.Institute", on_delete=models.CASCADE, related_name="leave_types")
    name = models.CharField(max_length=50)
    code = models.CharField(max_length=20)
    description = models.CharField(max_length=250, blank=True)
    applicable_to = models.CharField(max_length=10, choices=AppliesTo.choices, default=AppliesTo.BOTH)
    max_days_per_year = models.PositiveIntegerField(default=0)
    requires_document = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("institute", "name", "applicable_to"), name="uq_leave_type_scope")]


class LeaveApplication(TimeStampedModel):
    class ApplicantType(models.TextChoices):
        STUDENT = "student", "Student"
        STAFF = "staff", "Staff"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    class HalfDay(models.TextChoices):
        NONE = "none", "None"
        FIRST = "first_half", "First half"
        SECOND = "second_half", "Second half"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey("institutes.Institute", on_delete=models.CASCADE, related_name="leave_applications")
    branch = models.ForeignKey("institutes.Branch", on_delete=models.PROTECT, related_name="leave_applications")
    applicant_type = models.CharField(max_length=10, choices=ApplicantType.choices)
    student = models.ForeignKey("people.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="leave_applications")
    staff_user = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.CASCADE, related_name="leave_applications")
    applied_by = models.ForeignKey("identity.User", on_delete=models.PROTECT, related_name="submitted_leave_applications")
    leave_type = models.ForeignKey(LeaveType, on_delete=models.PROTECT, related_name="applications")
    start_date = models.DateField()
    end_date = models.DateField()
    total_days = models.DecimalField(max_digits=5, decimal_places=1, default=1)
    half_day_type = models.CharField(max_length=20, choices=HalfDay.choices, default=HalfDay.NONE)
    reason = models.CharField(max_length=500)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    reviewed_by = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.SET_NULL, related_name="reviewed_leave_applications")
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.CharField(max_length=500, blank=True)
    rejection_reason = models.CharField(max_length=500, blank=True)
    supporting_document_url = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ("status", "start_date", "-created_at")


class LeaveBalance(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.CASCADE, related_name="leave_balances")
    student = models.ForeignKey("people.Student", null=True, blank=True, on_delete=models.CASCADE, related_name="leave_balances")
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE, related_name="balances")
    academic_year = models.ForeignKey("academics.AcademicYear", on_delete=models.CASCADE, related_name="leave_balances")
    allocated_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    used_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    pending_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)


class AttendanceSettings(TimeStampedModel):
    institute = models.OneToOneField("institutes.Institute", on_delete=models.CASCADE, related_name="attendance_settings")
    low_attendance_threshold = models.DecimalField(max_digits=4, decimal_places=1, default=75)
    enable_parent_notifications = models.BooleanField(default=True)
    enable_auto_alerts = models.BooleanField(default=True)
    consecutive_absent_threshold = models.PositiveIntegerField(default=3)
    notify_class_teacher = models.BooleanField(default=True)
    notify_branch_admin = models.BooleanField(default=False)
    unmarked_reminder_time = models.TimeField(null=True, blank=True)
    enabled_capture_modes = models.JSONField(default=list)
    student_leave_routing = models.CharField(max_length=20, default="class_teacher")
    staff_leave_routing = models.CharField(max_length=20, default="branch_admin")
    parent_acknowledgement_enabled = models.BooleanField(default=False)
    period_wise_enabled = models.BooleanField(default=False)


class LeaveApplicationHistory(TimeStampedModel):
    application = models.ForeignKey(LeaveApplication, on_delete=models.CASCADE, related_name="history")
    action = models.CharField(max_length=20)
    actor = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.SET_NULL)
    note = models.CharField(max_length=500, blank=True)


class AttendanceAuditLog(TimeStampedModel):
    attendance = models.ForeignKey(StudentAttendance, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_events")
    institute = models.ForeignKey("institutes.Institute", on_delete=models.CASCADE, related_name="attendance_audit_events")
    actor = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=30, default="marked")
    previous_status = models.CharField(max_length=16, blank=True)
    next_status = models.CharField(max_length=16, blank=True)
    note = models.CharField(max_length=500, blank=True)


class AttendanceNotification(TimeStampedModel):
    class NotificationType(models.TextChoices):
        ABSENCE = "absence", "Absence"
        LEAVE_DECISION = "leave_decision", "Leave decision"
        LOW_ATTENDANCE = "low_attendance", "Low attendance"
        UNMARKED_REMINDER = "unmarked_reminder", "Unmarked reminder"

    institute = models.ForeignKey("institutes.Institute", on_delete=models.CASCADE, related_name="attendance_notifications")
    student = models.ForeignKey("people.Student", null=True, blank=True, on_delete=models.CASCADE)
    user = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.CASCADE)
    notification_type = models.CharField(max_length=30, choices=NotificationType.choices)
    channel = models.CharField(max_length=20, default="in_app")
    payload = models.JSONField(default=dict)
    delivered_at = models.DateTimeField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    disputed_at = models.DateTimeField(null=True, blank=True)
