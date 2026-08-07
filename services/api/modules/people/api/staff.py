from collections import defaultdict
from datetime import date
from uuid import uuid4

from django.db import IntegrityError, transaction
from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import ClassSubject, SubjectTeacherAssignment
from modules.access_control.models import Role, UserRoleAssignment
from modules.attendance.models import LeaveApplication, StaffAttendance
from modules.file_storage.models import FileAsset
from modules.file_storage.services import FileStorageError, read_url
from modules.identity.models import User
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch, InstituteMembership
from modules.people.invitations.services import (
    deliver_issued_invitation,
    invitation_delivery_data,
    issue_staff_invitation,
)
from modules.people.models import TEACHER_WORKING_DAYS, StaffProfile
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import AdminPageNumberPagination


class StaffSerializer(serializers.ModelSerializer):
    userId = serializers.UUIDField(source="user_id", read_only=True)
    fullName = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    branch = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    inviteDelivery = serializers.SerializerMethodField()
    employmentType = serializers.CharField(source="employment_type")
    department = serializers.CharField()
    availableDays = serializers.ListField(source="available_days")
    availablePeriods = serializers.ListField(source="available_periods")
    maxPeriodsPerDay = serializers.IntegerField(source="max_periods_per_day")
    maxPeriodsPerWeek = serializers.IntegerField(source="max_periods_per_week")
    availableStartTime = serializers.TimeField(source="availability_start_time", allow_null=True)
    availableEndTime = serializers.TimeField(source="availability_end_time", allow_null=True)
    monthlySalary = serializers.DecimalField(
        source="monthly_salary", max_digits=12, decimal_places=2, allow_null=True
    )
    salaryCurrency = serializers.CharField(source="salary_currency")
    payFrequency = serializers.CharField(source="pay_frequency")
    bankName = serializers.CharField(source="bank_name")
    bankAccountLast4 = serializers.CharField(source="bank_account_last4")
    bankIfsc = serializers.CharField(source="bank_ifsc")
    dateOfJoining = serializers.DateField(source="date_of_joining", allow_null=True)
    dateOfBirth = serializers.DateField(source="date_of_birth", allow_null=True)
    gender = serializers.CharField()
    bloodGroup = serializers.CharField(source="blood_group")
    qualification = serializers.CharField()
    experienceYears = serializers.IntegerField(source="experience_years", allow_null=True)
    maritalStatus = serializers.CharField(source="marital_status")
    fatherName = serializers.CharField(source="father_name")
    motherName = serializers.CharField(source="mother_name")
    panOrIdNumber = serializers.CharField(source="pan_or_id_number")
    currentAddress = serializers.CharField(source="current_address")
    permanentAddress = serializers.CharField(source="permanent_address")
    previousSchoolName = serializers.CharField(source="previous_school_name")
    previousSchoolAddress = serializers.CharField(source="previous_school_address")
    previousSchoolPhone = serializers.CharField(source="previous_school_phone")
    bankBranch = serializers.CharField(source="bank_branch")
    shift = serializers.CharField()
    workLocation = serializers.CharField(source="work_location")
    socialLinks = serializers.JSONField(source="social_links")
    subjects = serializers.SerializerMethodField()
    weeklyLoad = serializers.SerializerMethodField()
    attendancePct = serializers.SerializerMethodField()
    teachingAssignments = serializers.SerializerMethodField()
    profilePhotoUrl = serializers.SerializerMethodField()
    timetableSynced = serializers.SerializerMethodField()

    class Meta:
        model = StaffProfile
        fields = (
            "id",
            "userId",
            "fullName",
            "email",
            "phone",
            "employee_code",
            "branch",
            "role",
            "status",
            "inviteDelivery",
            "employmentType",
            "department",
            "availableDays",
            "availablePeriods",
            "maxPeriodsPerDay",
            "maxPeriodsPerWeek",
            "availableStartTime",
            "availableEndTime",
            "monthlySalary",
            "salaryCurrency",
            "payFrequency",
            "bankName",
            "bankAccountLast4",
            "bankIfsc",
            "dateOfJoining",
            "dateOfBirth",
            "gender",
            "bloodGroup",
            "qualification",
            "experienceYears",
            "maritalStatus",
            "fatherName",
            "motherName",
            "panOrIdNumber",
            "currentAddress",
            "permanentAddress",
            "previousSchoolName",
            "previousSchoolAddress",
            "previousSchoolPhone",
            "bankBranch",
            "shift",
            "workLocation",
            "socialLinks",
            "subjects",
            "weeklyLoad",
            "attendancePct",
            "teachingAssignments",
            "profilePhotoUrl",
            "timetableSynced",
        )

    def get_fullName(self, value) -> str:
        return f"{value.user.first_name} {value.user.last_name}".strip() or value.user.email

    def get_branch(self, value) -> dict[str, str] | None:
        prefetched = getattr(value.user, "active_staff_memberships", None)
        membership = prefetched[0] if prefetched else None
        if prefetched is None:
            membership = (
                value.user.institute_memberships.filter(institute=value.institute, is_active=True)
                .select_related("branch")
                .first()
            )
        return (
            {"id": str(membership.branch_id), "name": membership.branch.name}
            if membership and membership.branch_id
            else None
        )

    def get_role(self, value) -> str:
        custom_assignment = (
            UserRoleAssignment.objects.filter(
                user=value.user,
                institute=value.institute,
                is_active=True,
                role__is_system_role=False,
            )
            .select_related("role")
            .first()
        )
        if custom_assignment:
            return custom_assignment.role.name
        prefetched = getattr(value.user, "active_staff_memberships", None)
        membership = prefetched[0] if prefetched else None
        if prefetched is None:
            membership = value.user.institute_memberships.filter(
                institute=value.institute, is_active=True
            ).first()
        return membership.role if membership else ""

    def get_status(self, value) -> str:
        return "PENDING_INVITE" if value.invite_pending else "ACTIVE"

    def get_inviteDelivery(self, value) -> dict | None:
        invitation = value.staff_invitations.order_by("-created_at").first()
        return invitation_delivery_data(invitation)

    def get_profilePhotoUrl(self, value) -> str | None:
        asset = FileAsset.objects.filter(
            institute=value.institute,
            owner_type=FileAsset.OwnerType.STAFF,
            owner_id=value.id,
            asset_type=FileAsset.AssetType.PROFILE_PHOTO,
            status=FileAsset.Status.ACTIVE,
        ).first()
        if not asset:
            return None
        try:
            return read_url(asset)
        except FileStorageError:
            return None

    def _assignment_rows(self, value) -> list[dict]:
        assignments = self.context.get("assignment_map", {})
        return assignments.get(str(value.user_id), [])

    def get_subjects(self, value) -> list[str]:
        subjects: list[str] = []
        for assignment in self._assignment_rows(value):
            subject = assignment.get("subjectName")
            if subject and subject not in subjects:
                subjects.append(subject)
        return subjects

    def get_weeklyLoad(self, value) -> int:
        return sum(
            int(assignment.get("periodsPerWeek") or 0)
            for assignment in self._assignment_rows(value)
        )

    def get_attendancePct(self, value) -> int | None:
        return self.context.get("attendance_map", {}).get(str(value.user_id))

    def get_teachingAssignments(self, value) -> list[dict]:
        return self._assignment_rows(value)

    def get_timetableSynced(self, value) -> bool | None:
        """Return whether this teacher has slots in the currently published timetable.
        Returns None if no published timetable exists, True if synced, False if not.
        """
        timetable_entries = self.context.get("timetable_entries_map", {})
        user_id = str(value.user_id)
        if user_id not in timetable_entries:
            return None  # No published timetable found for this teacher's branch
        return timetable_entries[user_id]


class StaffWriteSerializer(serializers.Serializer):
    fullName = serializers.CharField(max_length=200, trim_whitespace=True)
    email = serializers.EmailField()
    phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True, trim_whitespace=True
    )
    branchId = serializers.UUIDField()
    role = serializers.CharField(max_length=40, required=False)
    roleId = serializers.UUIDField(required=False, allow_null=True)

    def validate_role(self, value):
        if not value:
            return value
        normalized = value.upper()
        valid_choices = {choice[0].upper() for choice in InstituteMembership.Role.choices}
        if normalized not in valid_choices:
            raise serializers.ValidationError(f'"{value}" is not a valid role choice.')
        return normalized

    employeeCode = serializers.CharField(
        max_length=64, required=False, allow_blank=True, trim_whitespace=True
    )
    department = serializers.CharField(max_length=120, required=False, allow_blank=True)
    employmentType = serializers.ChoiceField(
        choices=StaffProfile.EmploymentType.choices,
        source="employment_type",
        required=False,
        default=StaffProfile.EmploymentType.FULL_TIME,
    )
    availableDays = serializers.ListField(
        child=serializers.ChoiceField(choices=TEACHER_WORKING_DAYS),
        source="available_days",
        required=False,
        default=list(TEACHER_WORKING_DAYS),
    )
    availablePeriods = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        source="available_periods",
        required=False,
        default=[1, 2, 3, 4, 5, 6, 7, 8],
    )
    maxPeriodsPerDay = serializers.IntegerField(
        source="max_periods_per_day", min_value=1, required=False, default=6
    )
    maxPeriodsPerWeek = serializers.IntegerField(
        source="max_periods_per_week", min_value=1, required=False, default=36
    )
    availableStartTime = serializers.TimeField(
        source="availability_start_time", required=False, allow_null=True, default=None
    )
    availableEndTime = serializers.TimeField(
        source="availability_end_time", required=False, allow_null=True, default=None
    )
    monthlySalary = serializers.DecimalField(
        source="monthly_salary",
        max_digits=12,
        decimal_places=2,
        min_value=0,
        required=False,
        allow_null=True,
    )
    salaryCurrency = serializers.CharField(
        source="salary_currency", max_length=3, required=False, default="INR"
    )
    payFrequency = serializers.ChoiceField(
        source="pay_frequency", choices=("MONTHLY", "ANNUAL"), required=False, default="MONTHLY"
    )
    bankName = serializers.CharField(
        source="bank_name", max_length=120, required=False, allow_blank=True
    )
    bankAccountLast4 = serializers.RegexField(
        source="bank_account_last4", regex=r"^$|^\d{4}$", required=False, allow_blank=True
    )
    bankIfsc = serializers.CharField(
        source="bank_ifsc", max_length=20, required=False, allow_blank=True
    )
    dateOfJoining = serializers.DateField(source="date_of_joining", required=False, allow_null=True)
    dateOfBirth = serializers.DateField(source="date_of_birth", required=False, allow_null=True)
    gender = serializers.CharField(max_length=32, required=False, allow_blank=True)
    bloodGroup = serializers.CharField(
        source="blood_group", max_length=12, required=False, allow_blank=True
    )
    qualification = serializers.CharField(max_length=160, required=False, allow_blank=True)
    experienceYears = serializers.IntegerField(
        source="experience_years", min_value=0, required=False, allow_null=True
    )
    maritalStatus = serializers.CharField(
        source="marital_status", max_length=32, required=False, allow_blank=True
    )
    fatherName = serializers.CharField(
        source="father_name", max_length=160, required=False, allow_blank=True
    )
    motherName = serializers.CharField(
        source="mother_name", max_length=160, required=False, allow_blank=True
    )
    panOrIdNumber = serializers.CharField(
        source="pan_or_id_number", max_length=64, required=False, allow_blank=True
    )
    currentAddress = serializers.CharField(
        source="current_address", required=False, allow_blank=True
    )
    permanentAddress = serializers.CharField(
        source="permanent_address", required=False, allow_blank=True
    )
    previousSchoolName = serializers.CharField(
        source="previous_school_name", max_length=200, required=False, allow_blank=True
    )
    previousSchoolAddress = serializers.CharField(
        source="previous_school_address", required=False, allow_blank=True
    )
    previousSchoolPhone = serializers.CharField(
        source="previous_school_phone", max_length=20, required=False, allow_blank=True
    )
    bankBranch = serializers.CharField(
        source="bank_branch", max_length=120, required=False, allow_blank=True
    )
    shift = serializers.CharField(max_length=64, required=False, allow_blank=True)
    workLocation = serializers.CharField(
        source="work_location", max_length=160, required=False, allow_blank=True
    )
    socialLinks = serializers.JSONField(source="social_links", required=False)

    def validate_fullName(self, value):
        if not value.strip():
            raise serializers.ValidationError("Full name is required.")
        return value

    def validate_availableDays(self, value):
        if not value:
            raise serializers.ValidationError("Choose at least one available working day.")
        if len(set(value)) != len(value):
            raise serializers.ValidationError("Available days cannot contain duplicates.")
        return value

    def validate(self, attrs):
        # Availability is represented by working-day and period presets. Time windows
        # remain optional legacy fields and are no longer required for part-time staff.
        start = attrs.get("availability_start_time")
        end = attrs.get("availability_end_time")
        if start and end and start >= end:
            raise serializers.ValidationError(
                {"availabilityEndTime": "Availability end time must be after the start time."}
            )
        return attrs


class StaffListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: StaffSerializer(many=True)})
    def get(self, request):
        institute = request.institute
        branch_id = request.query_params.get("branchId")
        search = request.query_params.get("search", "").strip()
        role_filter = request.query_params.get("role", "").strip().upper()
        status_filter = request.query_params.get("status", "").strip().upper()
        department_filter = request.query_params.get("department", "").strip()
        sort_by = request.query_params.get("sortBy", "name").strip()
        sort_direction = request.query_params.get("sortDirection", "asc").strip().lower()

        staff = (
            StaffProfile.objects.filter(institute=institute)
            .select_related("user")
            .prefetch_related(
                Prefetch(
                    "user__institute_memberships",
                    queryset=InstituteMembership.objects.filter(institute=institute, is_active=True)
                    .select_related("branch")
                    .order_by("created_at"),
                    to_attr="active_staff_memberships",
                )
            )
        )
        if not status_filter:
            staff = staff.filter(
                user__institute_memberships__institute=institute,
                user__institute_memberships__is_active=True,
            )
        if branch_id:
            get_object_or_404(Branch, id=branch_id, institute=institute)
            staff = staff.filter(
                user__institute_memberships__branch_id=branch_id,
                user__institute_memberships__institute=institute,
            )
        if search:
            staff = staff.filter(
                Q(user__email__icontains=search)
                | Q(user__phone__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(employee_code__icontains=search)
                | Q(department__icontains=search)
            )
        if role_filter == "TEACHER":
            staff = staff.filter(user__institute_memberships__role=InstituteMembership.Role.TEACHER)
        elif role_filter == "STAFF":
            staff = staff.filter(user__institute_memberships__role=InstituteMembership.Role.STAFF)
        elif role_filter:
            staff = staff.filter(
                user__access_control_assignments__role_id=role_filter,
                user__access_control_assignments__institute=institute,
                user__access_control_assignments__is_active=True,
            )
        if status_filter == "PENDING_INVITE":
            staff = staff.filter(invite_pending=True)
        elif status_filter == "ACTIVE":
            staff = staff.filter(invite_pending=False, user__is_active=True)
        elif status_filter == "DEACTIVATED":
            staff = staff.filter(user__is_active=False)
        if department_filter:
            staff = staff.filter(department__iexact=department_filter)
        staff = staff.distinct()

        class_subject_periods = {
            (str(row["grade_id"]), str(row["subject_id"])): row["periods_per_week"] or 0
            for row in ClassSubject.objects.filter(grade__institute=institute).values(
                "grade_id", "subject_id", "periods_per_week"
            )
        }
        assignment_map: dict[str, list[dict]] = defaultdict(list)
        assignments = SubjectTeacherAssignment.objects.filter(
            class_section__branch__institute=institute
        ).select_related("class_section__grade", "class_section__branch", "subject", "teacher")
        if branch_id:
            assignments = assignments.filter(class_section__branch_id=branch_id)
        for assignment in assignments:
            assignment_map[str(assignment.teacher_id)].append(
                {
                    "id": str(assignment.id),
                    "classSectionId": str(assignment.class_section_id),
                    "sectionLabel": (
                        f"{assignment.class_section.grade.name} "
                        f"{assignment.class_section.section_name}"
                    ),
                    "subjectId": str(assignment.subject_id),
                    "subjectName": assignment.subject.name,
                    "periodsPerWeek": int(
                        class_subject_periods.get(
                            (str(assignment.class_section.grade_id), str(assignment.subject_id)), 0
                        )
                        or 0
                    ),
                }
            )

        today = date.today()
        month_start = today.replace(day=1)
        attendance_map: dict[str, int | None] = {}
        attendance_rows = (
            StaffAttendance.objects.filter(
                institute=institute, date__gte=month_start, date__lte=today
            )
            .values("user_id")
            .annotate(
                present=Count("id", filter=Q(status=StaffAttendance.Status.PRESENT)),
                absent=Count("id", filter=Q(status=StaffAttendance.Status.ABSENT)),
                late=Count("id", filter=Q(status=StaffAttendance.Status.LATE)),
            )
        )
        attendance_values = []
        for row in attendance_rows:
            total = int(row["present"] or 0) + int(row["absent"] or 0) + int(row["late"] or 0)
            percentage = round((int(row["present"] or 0) / total) * 100) if total else None
            attendance_map[str(row["user_id"])] = percentage
            if percentage is not None:
                attendance_values.append(percentage)

        # Build timetable sync map: which teachers appear in the published timetable?
        timetable_entries_map: dict[str, bool] = {}
        from modules.admin_console.models import AdminRecord

        timetable_qs = AdminRecord.objects.filter(
            institute=institute,
            screen_id="TT1",
            status="PUBLISHED",
            is_active=True,
        ).order_by("-updated_at")

        # Scope to branch if filtering
        if branch_id:
            timetable_qs = timetable_qs.filter(branch_id=branch_id)

        timetable_record = timetable_qs.first()
        if timetable_record:
            bundle = (timetable_record.data or {}).get("bundle", {})
            last_result = bundle.get("lastResult") or {}
            entries = last_result.get("entries", [])
            teacher_ids_in_timetable = {e.get("teacherId") for e in entries if e.get("teacherId")}
            # Pre-populate: every teacher who has assignments gets a value
            for teacher_id in assignment_map:
                timetable_entries_map[teacher_id] = teacher_id in teacher_ids_in_timetable

        serializer = StaffSerializer(
            staff.order_by("user__first_name", "user__last_name", "user__email"),
            many=True,
            context={
                "request": request,
                "assignment_map": assignment_map,
                "attendance_map": attendance_map,
                "timetable_entries_map": timetable_entries_map,
            },
        )
        items = list(serializer.data)

        sort_key_map = {
            "name": lambda row: row.get("fullName", ""),
            "employee_code": lambda row: row.get("employee_code", ""),
            "role": lambda row: row.get("role", ""),
            "department": lambda row: row.get("department", ""),
            "weeklyload": lambda row: row.get("weeklyLoad") or 0,
            "weeklyloadp": lambda row: row.get("weeklyLoad") or 0,
            "attendance": lambda row: (
                row.get("attendancePct") if row.get("attendancePct") is not None else -1
            ),
            "attendancepct": lambda row: (
                row.get("attendancePct") if row.get("attendancePct") is not None else -1
            ),
            "status": lambda row: row.get("status", ""),
        }
        items.sort(
            key=sort_key_map.get(sort_by.lower(), sort_key_map["name"]),
            reverse=sort_direction == "desc",
        )

        leave_today = LeaveApplication.objects.filter(
            institute=institute,
            applicant_type=LeaveApplication.ApplicantType.STAFF,
            status=LeaveApplication.Status.APPROVED,
            start_date__lte=today,
            end_date__gte=today,
        )
        if branch_id:
            leave_today = leave_today.filter(branch_id=branch_id)

        summary = {
            "totalStaff": staff.count(),
            "teachers": staff.filter(
                user__institute_memberships__role=InstituteMembership.Role.TEACHER
            )
            .distinct()
            .count(),
            "onLeaveToday": leave_today.count(),
            "avgAttendance": round(sum(attendance_values) / len(attendance_values))
            if attendance_values
            else None,
            "activeStaff": staff.filter(invite_pending=False, user__is_active=True)
            .distinct()
            .count(),
        }

        paginator = AdminPageNumberPagination()
        page = paginator.paginate_queryset(items, request)
        return Response(
            {"success": True, "data": {**paginator.get_page_data(page), "summary": summary}}
        )

    @extend_schema(
        request=StaffWriteSerializer, responses={status.HTTP_201_CREATED: StaffSerializer}
    )
    def post(self, request):
        serializer = StaffWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = get_object_or_404(
            Branch, id=data["branchId"], institute=request.institute, is_active=True
        )
        selected_access_role = None
        if data.get("roleId"):
            selected_access_role = Role.objects.filter(
                id=data["roleId"], is_active=True
            ).filter(Q(is_system_role=True) | Q(institute=request.institute)).first()
            if not selected_access_role:
                raise serializers.ValidationError({"roleId": ["Select an active role managed by this institute."]})
        email = data["email"].lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                {"email": ["An account with this email already exists."]}
            )
        first_name, *remainder = data["fullName"].split(maxsplit=1)
        try:
            with transaction.atomic():
                user = User.objects.create_user(
                    email=email,
                    password=None,
                    first_name=first_name,
                    last_name=remainder[0] if remainder else "",
                    is_active=False,
                )
                user.set_unusable_password()
                user.phone = data.get("phone", "").strip()
                user.save(update_fields=("password", "phone"))
                InstituteMembership.objects.create(
                    user=user, institute=request.institute, branch=branch, role=data["role"]
                )
                system_role = Role.objects.filter(
                    is_system_role=True, name__iexact=data["role"].title()
                ).first()
                if system_role:
                    UserRoleAssignment.objects.create(
                        user=user,
                        role=system_role,
                        institute=request.institute,
                        branch=branch,
                        assigned_by=request.user,
                    )
                if selected_access_role and not selected_access_role.is_system_role:
                    UserRoleAssignment.objects.create(
                        user=user,
                        role=selected_access_role,
                        institute=request.institute,
                        branch=branch,
                        assigned_by=request.user,
                    )
                profile = StaffProfile.objects.create(
                    institute=request.institute,
                    user=user,
                    employee_code=data.get("employeeCode") or f"EMP-{uuid4().hex[:8].upper()}",
                    department=data.get("department", ""),
                    employment_type=data["employment_type"],
                    available_days=data["available_days"],
                    available_periods=data["available_periods"],
                    max_periods_per_day=data["max_periods_per_day"],
                    max_periods_per_week=data["max_periods_per_week"],
                    availability_start_time=data.get("availability_start_time"),
                    availability_end_time=data.get("availability_end_time"),
                    monthly_salary=data.get("monthly_salary"),
                    salary_currency=data.get("salary_currency", "INR"),
                    pay_frequency=data.get("pay_frequency", "MONTHLY"),
                    bank_name=data.get("bank_name", ""),
                    bank_account_last4=data.get("bank_account_last4", ""),
                    bank_ifsc=data.get("bank_ifsc", ""),
                )
                issued = issue_staff_invitation(staff_profile=profile)
        except IntegrityError:
            raise serializers.ValidationError(
                {"employeeCode": ["This employee code is already in use."]}
            ) from None
        deliver_issued_invitation(issued)
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"staff {profile.user.get_full_name() or profile.user.email}",
            target_type="staff",
            target_id=profile.id,
            extra_meta={"employeeCode": profile.employee_code, "role": data["role"]},
        )
        return Response(
            {"success": True, "data": StaffSerializer(profile).data}, status=status.HTTP_201_CREATED
        )


class StaffDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request, staff_id):
        """Return a single staff member with their teaching assignments and published timetable."""
        profile = get_object_or_404(
            StaffProfile.objects.select_related("user"),
            id=staff_id,
            institute=request.institute,
        )
        # Build teaching assignments (same logic as list view)
        institute = request.institute
        class_subject_periods = {
            (str(row["grade_id"]), str(row["subject_id"])): row["periods_per_week"] or 0
            for row in ClassSubject.objects.filter(grade__institute=institute).values(
                "grade_id", "subject_id", "periods_per_week"
            )
        }
        assignment_map: dict[str, list[dict]] = defaultdict(list)
        assignments = SubjectTeacherAssignment.objects.filter(
            class_section__branch__institute=institute,
            teacher=profile.user,
        ).select_related("class_section__grade", "class_section__branch", "subject", "teacher")
        for assignment in assignments:
            assignment_map[str(assignment.teacher_id)].append(
                {
                    "id": str(assignment.id),
                    "classSectionId": str(assignment.class_section_id),
                    "sectionLabel": (
                        f"{assignment.class_section.grade.name} "
                        f"{assignment.class_section.section_name}"
                    ),
                    "subjectId": str(assignment.subject_id),
                    "subjectName": assignment.subject.name,
                    "periodsPerWeek": int(
                        class_subject_periods.get(
                            (str(assignment.class_section.grade_id), str(assignment.subject_id)), 0
                        )
                        or 0
                    ),
                }
            )

        serializer = StaffSerializer(
            profile,
            context={"request": request, "assignment_map": assignment_map, "attendance_map": {}},
        )

        # Fetch published timetable for the teacher's branch
        from modules.admin_console.models import AdminRecord

        timetable_data = None
        memberships = list(
            profile.user.institute_memberships.filter(
                institute=institute, is_active=True
            ).select_related("branch")
        )
        branch = memberships[0].branch if memberships else None

        timetable_qs = AdminRecord.objects.filter(
            institute=institute,
            screen_id="TT1",
            status="PUBLISHED",
            is_active=True,
        ).order_by("-updated_at")

        if branch:
            # Try branch-specific timetable first, then institute-wide
            timetable_record = timetable_qs.filter(branch=branch).first() or timetable_qs.filter(branch__isnull=True).first()
        else:
            timetable_record = timetable_qs.filter(branch__isnull=True).first()
        if timetable_record:
            bundle = (timetable_record.data or {}).get("bundle", {})
            last_result = bundle.get("lastResult") or {}
            entries = last_result.get("entries", [])
            config = bundle.get("config", {})
            working_days = config.get("workingDays", ["MON", "TUE", "WED", "THU", "FRI", "SAT"])
            periods_list = config.get("periods", [])
            classes_map = {c.get("id"): c for c in bundle.get("classes", [])}
            subjects_map = {s.get("id"): s for s in bundle.get("subjects", [])}
            rooms_map = {r.get("id"): r for r in bundle.get("rooms", [])}

            teacher_entries = [e for e in entries if e.get("teacherId") == str(profile.user_id)]
            teaching_periods = [p for p in periods_list if p.get("type") != "break"]

            timetable_slots = []
            for entry in teacher_entries:
                day = entry.get("day", "")
                period_number = entry.get("period")
                class_info = classes_map.get(entry.get("classId", ""), {})
                subject_info = subjects_map.get(entry.get("subjectId", ""), {})
                room_info = rooms_map.get(entry.get("roomId", ""), {})
                period_def = next(
                    (p for p in teaching_periods if p.get("number") == period_number), None
                )

                timetable_slots.append({
                    "day": day,
                    "period": period_number,
                    "startTime": period_def.get("start") if period_def else None,
                    "endTime": period_def.get("end") if period_def else None,
                    "className": class_info.get("name", ""),
                    "subjectName": subject_info.get("name", ""),
                    "roomName": room_info.get("name", ""),
                    "classId": entry.get("classId", ""),
                    "subjectId": entry.get("subjectId", ""),
                    "roomId": entry.get("roomId", ""),
                })

            day_order = {day: idx for idx, day in enumerate(working_days)}
            timetable_slots.sort(key=lambda s: (day_order.get(s["day"], 99), s["period"]))

            timetable_data = {
                "timetableRecordId": str(timetable_record.id),
                "timetableTitle": timetable_record.title,
                "timetableUpdatedAt": timetable_record.updated_at.isoformat() if timetable_record.updated_at else None,
                "workingDays": working_days,
                "periods": teaching_periods,
                "slots": timetable_slots,
            }

        return Response({
            "success": True,
            "data": {
                **serializer.data,
                "timetable": timetable_data,
            },
        })

    def patch(self, request, staff_id):
        profile = get_object_or_404(
            StaffProfile.objects.select_related("user"), id=staff_id, institute=request.institute
        )
        serializer = StaffWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        selected_access_role = None
        if data.get("roleId"):
            selected_access_role = Role.objects.filter(
                id=data["roleId"], is_active=True
            ).filter(Q(is_system_role=True) | Q(institute=request.institute)).first()
            if not selected_access_role:
                raise serializers.ValidationError({"roleId": ["Select an active role managed by this institute."]})
        with transaction.atomic():
            user = profile.user
            if "fullName" in request.data and request.data["fullName"]:
                first, *rest = str(request.data["fullName"]).strip().split(maxsplit=1)
                user.first_name = first
                user.last_name = rest[0] if rest else ""
            if "email" in request.data and request.data["email"]:
                user.email = str(request.data["email"]).lower()
            if "phone" in request.data:
                user.phone = str(request.data["phone"] or "").strip()
            user.save(update_fields=("first_name", "last_name", "email", "phone", "updated_at"))
            membership = (
                user.institute_memberships.filter(institute=request.institute, is_active=True)
                .select_related("branch")
                .first()
            )
            if membership:
                if "branchId" in request.data and request.data["branchId"]:
                    membership.branch = get_object_or_404(
                        Branch,
                        id=request.data["branchId"],
                        institute=request.institute,
                        is_active=True,
                    )
                if "role" in request.data and request.data["role"]:
                    membership.role = request.data["role"]
                membership.save(update_fields=("branch", "role", "updated_at"))
            if selected_access_role or ("role" in request.data and str(request.data["role"]).upper() in {"TEACHER", "STAFF"}):
                UserRoleAssignment.objects.filter(
                    user=user, institute=request.institute, role__is_system_role=False, is_active=True
                ).update(is_active=False, updated_at=timezone.now())
                if not selected_access_role.is_system_role:
                    UserRoleAssignment.objects.create(
                        user=user, role=selected_access_role, institute=request.institute,
                        branch=membership.branch if membership else None, assigned_by=request.user,
                    )
            for field, value in data.items():
                if hasattr(profile, field):
                    setattr(profile, field, value)
            profile.save()
        audit_mutation(
            request=request,
            verb="Updated",
            target_label=f"staff {profile.user.get_full_name() or profile.user.email}",
            target_type="staff",
            target_id=profile.id,
            extra_meta={"changedFields": list(data.keys())},
        )
        return Response({"success": True, "data": StaffSerializer(profile).data})

    def delete(self, request, staff_id):
        profile = get_object_or_404(
            StaffProfile.objects.select_related("user"),
            id=staff_id,
            institute=request.institute,
        )
        with transaction.atomic():
            profile.user.institute_memberships.filter(institute=request.institute).update(
                is_active=False, updated_at=timezone.now()
            )
            # Do not delete the identity: it may belong to another institute.
            if not profile.user.institute_memberships.filter(is_active=True).exists():
                profile.user.is_active = False
                profile.user.save(update_fields=("is_active", "updated_at"))
        audit_mutation(
            request=request,
            verb="Deleted",
            target_label=f"staff {profile.user.get_full_name() or profile.user.email}",
            target_type="staff",
            target_id=profile.id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
