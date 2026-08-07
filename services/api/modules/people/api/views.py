import secrets
from uuid import UUID

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.exceptions import ValidationError as RestValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.academics.models import ClassSection, StudentEnrollment
from modules.academics.services import AcademicsValidationError, create_enrollment
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from modules.people.models import Student, StudentGuardian
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset

from .serializers import StudentSerializer, StudentWriteSerializer

STUDENT_DETAIL_FIELDS = {
    "fatherName": "father_name",
    "motherName": "mother_name",
    "studentNicId": "student_nic_id",
    "srNumber": "sr_number",
    "aadharNumber": "aadhar_number",
    "dateOfBirth": "date_of_birth",
    "gender": "gender",
    "socialCategory": "social_category",
    "religion": "religion",
    "motherTongue": "mother_tongue",
    "ruralUrban": "rural_urban",
    "habitationLocality": "habitation_locality",
    "dateOfAdmission": "date_of_admission",
    "belongsToBpl": "belongs_to_bpl",
    "belongsToDisadvantagedGroup": "belongs_to_disadvantaged_group",
    "gettingFreeEducation": "getting_free_education",
    "previousClass": "previous_class",
    "previousYearStatus": "previous_year_status",
    "previousYearAttendanceDays": "previous_year_attendance_days",
    "mediumOfInstruction": "medium_of_instruction",
    "disabilityType": "disability_type",
    "cwsnFacilities": "cwsn_facilities",
    "uniformSets": "uniform_sets",
    "freeTextBooks": "free_text_books",
    "freeTransport": "free_transport",
    "freeEscort": "free_escort",
    "mdmBeneficiary": "mdm_beneficiary",
    "freeHostelFacility": "free_hostel_facility",
    "attendedSpecialTraining": "attended_special_training",
    "lastExaminationAppeared": "last_examination_appeared",
    "lastExaminationPassed": "last_examination_passed",
    "lastExaminationPercentage": "last_examination_percentage",
    "stream": "stream",
    "tradeSector": "trade_sector",
    "ironFolicAcidTablets": "iron_folic_acid_tablets",
    "dewormingTablets": "deworming_tablets",
    "vitaminASupplement": "vitamin_a_supplement",
    "mobileNumber": "mobile_number",
    "emailAddress": "email_address",
}


def student_detail_values(validated_data):
    return {
        model_field: validated_data[api_field]
        for api_field, model_field in STUDENT_DETAIL_FIELDS.items()
        if api_field in validated_data
    }


def generated_admission_number(institute_code):
    return f"{institute_code}-{secrets.token_hex(4).upper()}"


def validate_unique_student_identifiers(*, institute, data, exclude_student_id=None):
    """Provide field-level duplicate errors before the database constraint is reached."""
    errors = {}
    for api_field, model_field, label in (
        ("admissionNumber", "admission_number", "Admission number"),
        ("srNumber", "sr_number", "Admission / SR number"),
        ("studentNicId", "student_nic_id", "Student NIC ID"),
    ):
        value = str(data.get(api_field, "") or "").strip()
        if not value:
            continue
        matches = Student.objects.filter(
            institute=institute,
            is_active=True,
            **{model_field: value},
        )
        if exclude_student_id:
            matches = matches.exclude(id=exclude_student_id)
        if matches.exists():
            errors[api_field] = [f"{label} is already assigned to another student."]
    if errors:
        raise RestValidationError(errors)


class StudentListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    @extend_schema(responses={status.HTTP_200_OK: StudentSerializer(many=True)})
    def get(self, request):
        students = (
            Student.objects.filter(institute=request.institute)
            .select_related("branch")
            .prefetch_related(
                Prefetch(
                    "academic_enrollments",
                    queryset=StudentEnrollment.objects.filter(left_at__isnull=True).select_related(
                        "class_section__grade"
                    ),
                    to_attr="active_enrollments",
                )
            )
        )
        branch_id = request.query_params.get("branchId")
        if branch_id:
            branch = get_object_or_404(Branch, id=branch_id, institute=request.institute)
            students = students.filter(branch=branch)
        search = request.query_params.get("search", "").strip()
        if search:
            students = (
                students.filter(first_name__icontains=search)
                | students.filter(last_name__icontains=search)
                | students.filter(admission_number__icontains=search)
            )
        if request.query_params.get("gender"):
            students = students.filter(gender=request.query_params["gender"])
        status_value = request.query_params.get("status")
        if status_value in {"active", "inactive"}:
            students = students.filter(is_active=status_value == "active")
        elif not status_value:
            students = students.filter(is_active=True)
        class_id = request.query_params.get("classId")
        if class_id:
            enrolled_students = StudentEnrollment.objects.filter(
                class_section__grade_id=class_id, left_at__isnull=True
            ).values("student_id")
            students = students.filter(id__in=enrolled_students)
        ordering = request.query_params.get("ordering", "name")
        descending = ordering.startswith("-")
        ordering_key = ordering.lstrip("-")
        ordering_fields = {
            "name": ("first_name", "last_name"),
            "admissionNumber": ("admission_number",),
            "gender": ("gender",),
            "branch": ("branch__name",),
            "class": ("first_name", "last_name"),
        }
        fields = ordering_fields.get(ordering_key, ordering_fields["name"])
        students = students.order_by(*[(f"-{field}" if descending else field) for field in fields])
        return Response(
            {
                "success": True,
                "data": paginate_admin_queryset(
                    request=request, queryset=students, serializer_class=StudentSerializer
                ),
            }
        )

    @extend_schema(
        request=StudentWriteSerializer, responses={status.HTTP_201_CREATED: StudentSerializer}
    )
    def post(self, request):
        serializer = StudentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch_id = serializer.validated_data.get("branchId")
        if not branch_id:
            return Response(
                {
                    "success": False,
                    "error": {
                        "code": "VALIDATION_ERROR",
                        "message": "Please correct the highlighted fields.",
                        "fieldErrors": {"branchId": ["This field is required."]},
                    },
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        branch = get_object_or_404(
            Branch,
            id=branch_id,
            institute=request.institute,
            is_active=True,
        )
        validate_unique_student_identifiers(
            institute=request.institute, data=serializer.validated_data
        )
        for _ in range(3):
            try:
                with transaction.atomic():
                    student = Student.objects.create(
                        institute=request.institute,
                        branch=branch,
                        admission_number=serializer.validated_data.get("admissionNumber")
                        or generated_admission_number(request.institute.code),
                        first_name=serializer.validated_data["firstName"],
                        last_name=serializer.validated_data.get("lastName", ""),
                        **student_detail_values(serializer.validated_data),
                    )
                    if serializer.validated_data.get("classSectionId"):
                        section = get_object_or_404(
                            ClassSection,
                            id=serializer.validated_data["classSectionId"],
                            branch__institute=request.institute,
                            branch__is_active=True,
                        )
                        create_enrollment(
                            student=student,
                            class_section=section,
                            roll_number=f"PENDING-{student.admission_number[-6:]}",
                        )
                audit_mutation(
                    request=request,
                    verb="Created",
                    target_label=f"student {student.full_name} ({student.admission_number})",
                    target_type="student",
                    target_id=student.id,
                    extra_meta={
                        "admissionNumber": student.admission_number,
                        "branchId": str(branch.id),
                        "classSectionId": str(section.id) if serializer.validated_data.get("classSectionId") else None,
                    },
                )
                return Response(
                    {"success": True, "data": StudentSerializer(student).data},
                    status=status.HTTP_201_CREATED,
                )
            except IntegrityError:
                continue
        return Response(
            {
                "success": False,
                "error": {
                    "code": "ID_GENERATION_FAILED",
                    "message": "Could not allocate an admission number.",
                },
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


class StudentBulkDeleteView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request):
        raw_ids = request.data.get("studentIds", [])
        if not isinstance(raw_ids, list) or not raw_ids:
            raise RestValidationError({"studentIds": ["Select at least one student."]})
        try:
            student_ids = [UUID(str(value)) for value in raw_ids]
        except (TypeError, ValueError) as exc:
            raise RestValidationError({"studentIds": ["Student IDs must be valid UUIDs."]}) from exc
        students = Student.objects.filter(
            institute=request.institute, id__in=student_ids, is_active=True
        )
        if request.institute_membership.branch_id:
            students = students.filter(branch_id=request.institute_membership.branch_id)
        # Collect details for audit before deleting.
        student_snapshots = list(
            students.values("id", "first_name", "last_name", "admission_number")
        )
        if not student_snapshots:
            raise RestValidationError({"studentIds": ["No active students found for the given IDs in your scope."]})
        with transaction.atomic():
            StudentGuardian.objects.filter(student_id__in=students.values("id")).delete()
            deleted_count = students.update(is_active=False)
        for snap in student_snapshots:
            audit_mutation(
                request=request,
                verb="BULK_DELETE",
                target_label=f"student {snap['first_name']} {snap['last_name']} ({snap['admission_number']})",
                target_type="student",
                target_id=snap["id"],
                extra_meta={"bulkOperation": True, "totalDeleted": deleted_count},
            )
        return Response({"success": True, "data": {"deletedCount": deleted_count}})


class StudentDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def _get_student(self, request, student_id):
        return get_object_or_404(
            Student.objects.select_related("branch"),
            id=student_id,
            institute=request.institute,
        )

    @extend_schema(responses={status.HTTP_200_OK: StudentSerializer})
    def get(self, request, student_id):
        student = self._get_student(request, student_id)
        return Response({"success": True, "data": StudentSerializer(student).data})

    @extend_schema(
        request=StudentWriteSerializer, responses={status.HTTP_200_OK: StudentSerializer}
    )
    def patch(self, request, student_id):
        student = self._get_student(request, student_id)
        serializer = StudentWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        validate_unique_student_identifiers(
            institute=request.institute,
            data=serializer.validated_data,
            exclude_student_id=student.id,
        )
        if "branchId" in serializer.validated_data:
            student.branch = get_object_or_404(
                Branch,
                id=serializer.validated_data["branchId"],
                institute=request.institute,
                is_active=True,
            )
        if "firstName" in serializer.validated_data:
            student.first_name = serializer.validated_data["firstName"]
        if "lastName" in serializer.validated_data:
            student.last_name = serializer.validated_data["lastName"]
        for field, value in student_detail_values(serializer.validated_data).items():
            setattr(student, field, value)
        student.save()

        if (
            "classSectionId" in serializer.validated_data
            and serializer.validated_data["classSectionId"]
        ):
            section = get_object_or_404(
                ClassSection,
                id=serializer.validated_data["classSectionId"],
                branch__institute=request.institute,
                branch__is_active=True,
            )
            if section.max_strength is None:
                section.max_strength = 100
                section.save(update_fields=("max_strength", "updated_at"))

            if student.branch_id != section.branch_id:
                student.branch = section.branch
                student.save(update_fields=("branch", "updated_at"))

            try:
                enrollment = student.academic_enrollments.filter(
                    academic_year=section.academic_year
                ).first()
                if enrollment:
                    enrollment.class_section = section
                    enrollment.left_at = None
                    enrollment.save()
                else:
                    create_enrollment(
                        student=student,
                        class_section=section,
                        roll_number=f"PENDING-{student.admission_number[-6:]}",
                    )
            except (AcademicsValidationError, DjangoValidationError) as exc:
                field_errors = (
                    exc.field_errors
                    if hasattr(exc, "field_errors")
                    else (exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
                )
                raise RestValidationError(field_errors) from exc

        audit_mutation(
            request=request,
            verb="Updated",
            target_label=f"student {student.full_name} ({student.admission_number})",
            target_type="student",
            target_id=student.id,
            extra_meta={"changedFields": list(serializer.validated_data.keys())},
        )
        return Response({"success": True, "data": StudentSerializer(student).data})

    def delete(self, request, student_id):
        student = self._get_student(request, student_id)
        with transaction.atomic():
            StudentGuardian.objects.filter(student=student).delete()
            student.is_active = False
            student.save(update_fields=("is_active", "updated_at"))
        audit_mutation(
            request=request,
            verb="Deleted",
            target_label=f"student {student.full_name} ({student.admission_number})",
            target_type="student",
            target_id=student.id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
