from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Prefetch, Q
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.identity.models import User
from modules.institutes.api.permissions import IsCurrentInstituteAdmin
from modules.institutes.models import Branch
from modules.people.models import Student
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import paginate_admin_queryset

from ..models import (
    AcademicOperation,
    AcademicTerm,
    AcademicYear,
    ClassSubject,
    ClassSection,
    Grade,
    StudentEnrollment,
    Subject,
    SubjectTeacherAssignment,
    Room,
)
from ..services import (
    AcademicsValidationError,
    create_enrollment,
    save_academic_year,
    save_class_section,
    set_current_academic_year,
    update_enrollment,
    validate_assignment_sections,
)
from .serializers import (
    AcademicOperationSerializer,
    AcademicOperationWriteSerializer,
    AcademicTermSerializer,
    AcademicTermWriteSerializer,
    AcademicYearSerializer,
    AcademicYearWriteSerializer,
    ClassSubjectSerializer,
    ClassSubjectWriteSerializer,
    ClassSectionSerializer,
    ClassSectionWriteSerializer,
    GradeSerializer,
    GradeWriteSerializer,
    StudentEnrollmentCreateSerializer,
    StudentEnrollmentSerializer,
    StudentEnrollmentUpdateSerializer,
    SubjectSerializer,
    SubjectTeacherAssignmentSerializer,
    SubjectTeacherAssignmentWriteSerializer,
    SubjectWriteSerializer,
    RoomSerializer,
    RoomWriteSerializer,
)


class AcademicOperationListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        records = AcademicOperation.objects.filter(institute=_institute(request)).select_related("branch", "created_by")
        kind = request.query_params.get("kind", "").strip().upper()
        if kind:
            if kind not in AcademicOperation.Kind.values:
                raise ValidationError({"kind": ["Unsupported academic operation kind."]})
            records = records.filter(kind=kind)
        branch = _branch_filter(request)
        if branch:
            records = records.filter(Q(branch=branch) | Q(branch__isnull=True))
        status_filter = request.query_params.get("status", "").strip().upper()
        if status_filter:
            records = records.filter(status=status_filter)
        search = request.query_params.get("search", "").strip()
        if search:
            records = records.filter(title__icontains=search)
        return _success(paginate_admin_queryset(request=request, queryset=records, serializer_class=AcademicOperationSerializer))

    def post(self, request):
        serializer = AcademicOperationWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch_id = data.pop("branch_id", None)
        branch = None
        if branch_id:
            branch = get_object_or_404(Branch, id=branch_id, institute=_institute(request), is_active=True)
        record = _save(AcademicOperation(institute=_institute(request), branch=branch, created_by=request.user, **data))
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"academic operation '{record.title}'",
            target_type="academic_operation",
            target_id=record.id,
            extra_meta={"kind": record.kind},
        )
        return _success(AcademicOperationSerializer(record).data, status.HTTP_201_CREATED)


class AcademicOperationDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, operation_id):
        return get_object_or_404(AcademicOperation.objects.select_related("branch", "created_by"), id=operation_id, institute=_institute(request))

    def patch(self, request, operation_id):
        record = self.get_object(request, operation_id)
        serializer = AcademicOperationWriteSerializer(instance=record, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "branch_id" in data:
            branch_id = data.pop("branch_id")
            record.branch = get_object_or_404(Branch, id=branch_id, institute=_institute(request), is_active=True) if branch_id else None
        if "kind" in data and data["kind"] != record.kind:
            raise ValidationError({"kind": ["Operation kind cannot be changed."]})
        for field, value in data.items():
            setattr(record, field, value)
        _save(record)
        return _success(AcademicOperationSerializer(record).data)

    def delete(self, request, operation_id):
        return _delete(self.get_object(request, operation_id))


def _institute(request):
    return request.institute


def _branch_filter(request):
    branch_id = request.query_params.get("branchId")
    if not branch_id:
        return None
    return get_object_or_404(Branch, id=branch_id, institute=_institute(request), is_active=True)


def _success(data, response_status=status.HTTP_200_OK):
    return Response({"success": True, "data": data}, status=response_status)


def _raise_service_error(exc):
    raise ValidationError(exc.field_errors) from exc


def _save(instance, *, update_fields=None):
    try:
        instance.save(update_fields=update_fields)
    except DjangoValidationError as exc:
        details = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        raise ValidationError(details) from exc
    return instance


def _delete(instance):
    try:
        instance.delete()
    except ProtectedError as exc:
        raise ValidationError(
            {"nonFieldErrors": ["This record is in use and cannot be deleted."]}
        ) from exc
    return Response(status=status.HTTP_204_NO_CONTENT)


def _teacher(*, institute, branch, teacher_id):
    if teacher_id is None:
        return None
    return get_object_or_404(
        User.objects.distinct(),
        id=teacher_id,
        staff_profiles__institute=institute,
        institute_memberships__institute=institute,
        institute_memberships__branch=branch,
        institute_memberships__role="TEACHER",
        institute_memberships__is_active=True,
    )


def _section_queryset(institute):
    return (
        ClassSection.objects.filter(branch__institute=institute)
        .select_related("branch", "grade", "academic_year", "class_teacher")
        .annotate(
            enrollment_count=Count(
                "student_enrollments",
                filter=Q(student_enrollments__left_at__isnull=True),
            )
        )
        .order_by("grade__sort_order", "grade__name", "section_name")
    )


class RoomListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        rooms = Room.objects.filter(institute=_institute(request)).select_related("branch")
        branch = _branch_filter(request)
        if branch:
            rooms = rooms.filter(branch=branch)
        search = request.query_params.get("search", "").strip()
        if search:
            rooms = rooms.filter(Q(name__icontains=search) | Q(room_type__icontains=search))
        return _success(paginate_admin_queryset(request=request, queryset=rooms, serializer_class=RoomSerializer))

    def post(self, request):
        serializer = RoomWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = get_object_or_404(Branch, id=data.pop("branch_id"), institute=_institute(request), is_active=True)
        room = _save(Room(institute=_institute(request), branch=branch, **data))
        return _success(RoomSerializer(room).data, status.HTTP_201_CREATED)


class RoomDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, room_id):
        return get_object_or_404(Room.objects.select_related("branch"), id=room_id, institute=_institute(request))

    def patch(self, request, room_id):
        room = self.get_object(request, room_id)
        serializer = RoomWriteSerializer(instance=room, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "branch_id" in data:
            room.branch = get_object_or_404(Branch, id=data.pop("branch_id"), institute=_institute(request), is_active=True)
        for field, value in data.items():
            setattr(room, field, value)
        _save(room)
        return _success(RoomSerializer(room).data)

    def delete(self, request, room_id):
        return _delete(self.get_object(request, room_id))


def _enrollment_queryset(institute):
    sections = ClassSection.objects.select_related(
        "branch", "grade", "academic_year", "class_teacher"
    ).annotate(
        enrollment_count=Count(
            "student_enrollments",
            filter=Q(student_enrollments__left_at__isnull=True),
        )
    )
    return (
        StudentEnrollment.objects.filter(student__institute=institute)
        .select_related("student", "academic_year")
        .prefetch_related(Prefetch("class_section", queryset=sections))
    )


class AcademicYearListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        branch = _branch_filter(request)
        years = AcademicYear.objects.filter(institute=_institute(request))
        if branch:
            years = years.filter(class_sections__branch=branch)
        years = years.annotate(classes_count=Count("class_sections__grade", distinct=True)).order_by("-start_date", "name")
        search = request.query_params.get("search", "").strip()
        if search:
            years = years.filter(name__icontains=search)
        return _success(
            paginate_admin_queryset(
                request=request, queryset=years, serializer_class=AcademicYearSerializer
            )
        )

    def post(self, request):
        serializer = AcademicYearWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        year = AcademicYear(institute=_institute(request), **serializer.validated_data)
        try:
            save_academic_year(academic_year=year)
        except AcademicsValidationError as exc:
            _raise_service_error(exc)
        return _success(AcademicYearSerializer(year).data, status.HTTP_201_CREATED)


class AcademicYearDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, year_id):
        return get_object_or_404(AcademicYear, id=year_id, institute=_institute(request))

    def get(self, request, year_id):
        return _success(AcademicYearSerializer(self.get_object(request, year_id)).data)

    def patch(self, request, year_id):
        year = self.get_object(request, year_id)
        serializer = AcademicYearWriteSerializer(instance=year, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(year, field, value)
        try:
            save_academic_year(academic_year=year)
        except AcademicsValidationError as exc:
            _raise_service_error(exc)
        return _success(AcademicYearSerializer(year).data)

    def delete(self, request, year_id):
        return _delete(self.get_object(request, year_id))


class AcademicYearSetCurrentView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def post(self, request, year_id):
        institute = _institute(request)
        year = get_object_or_404(AcademicYear, id=year_id, institute=institute)
        set_current_academic_year(institute=institute, academic_year=year)
        return _success(AcademicYearSerializer(year).data)


class AcademicTermListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        year_id = request.query_params.get("academicYearId")
        terms = AcademicTerm.objects.filter(academic_year__institute=_institute(request))
        if year_id:
            terms = terms.filter(academic_year_id=year_id)
        return _success(paginate_admin_queryset(request=request, queryset=terms, serializer_class=AcademicTermSerializer))

    def post(self, request):
        serializer = AcademicTermWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        year = get_object_or_404(AcademicYear, id=data.pop("academic_year_id", None), institute=_institute(request))
        term = AcademicTerm(academic_year=year, **data)
        _save(term)
        return _success(AcademicTermSerializer(term).data, status.HTTP_201_CREATED)


class AcademicTermDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, term_id):
        return get_object_or_404(AcademicTerm, id=term_id, academic_year__institute=_institute(request))

    def patch(self, request, term_id):
        term = self.get_object(request, term_id)
        serializer = AcademicTermWriteSerializer(instance=term, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            if field == "academic_year_id":
                term.academic_year = get_object_or_404(AcademicYear, id=value, institute=_institute(request))
            else:
                setattr(term, field, value)
        _save(term)
        return _success(AcademicTermSerializer(term).data)

    def delete(self, request, term_id):
        return _delete(self.get_object(request, term_id))


class GradeListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        branch = _branch_filter(request)
        grades = Grade.objects.filter(institute=_institute(request))
        if branch:
            grades = grades.filter(sections__branch=branch)
        grades = grades.annotate(subjects_count=Count("curriculum_subjects", distinct=True)).order_by("sort_order", "name")
        search = request.query_params.get("search", "").strip()
        if search:
            grades = grades.filter(name__icontains=search)
        return _success(
            paginate_admin_queryset(
                request=request, queryset=grades, serializer_class=GradeSerializer
            )
        )

    def post(self, request):
        serializer = GradeWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grade = _save(Grade(institute=_institute(request), **serializer.validated_data))
        return _success(GradeSerializer(grade).data, status.HTTP_201_CREATED)


class GradeDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, grade_id):
        return get_object_or_404(Grade, id=grade_id, institute=_institute(request))

    def get(self, request, grade_id):
        return _success(GradeSerializer(self.get_object(request, grade_id)).data)

    def patch(self, request, grade_id):
        grade = self.get_object(request, grade_id)
        serializer = GradeWriteSerializer(instance=grade, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(grade, field, value)
        _save(grade)
        return _success(GradeSerializer(grade).data)

    def delete(self, request, grade_id):
        return _delete(self.get_object(request, grade_id))


class SubjectListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        branch = _branch_filter(request)
        subjects = Subject.objects.filter(institute=_institute(request))
        if branch:
            subjects = subjects.filter(class_curricula__grade__sections__branch=branch)
        subjects = subjects.annotate(classes_count=Count("class_curricula__grade", distinct=True)).order_by("name", "subject_code")
        search = request.query_params.get("search", "").strip()
        if search:
            subjects = subjects.filter(
                Q(name__icontains=search) | Q(subject_code__icontains=search)
            )
        return _success(
            paginate_admin_queryset(
                request=request, queryset=subjects, serializer_class=SubjectSerializer
            )
        )

    def post(self, request):
        serializer = SubjectWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subject = _save(Subject(institute=_institute(request), **serializer.validated_data))
        return _success(SubjectSerializer(subject).data, status.HTTP_201_CREATED)


class SubjectDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, subject_id):
        return get_object_or_404(Subject, id=subject_id, institute=_institute(request))

    def get(self, request, subject_id):
        return _success(SubjectSerializer(self.get_object(request, subject_id)).data)

    def patch(self, request, subject_id):
        subject = self.get_object(request, subject_id)
        serializer = SubjectWriteSerializer(instance=subject, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(subject, field, value)
        _save(subject)
        return _success(SubjectSerializer(subject).data)

    def delete(self, request, subject_id):
        return _delete(self.get_object(request, subject_id))


class ClassSubjectListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        institute = _institute(request)
        curriculum = ClassSubject.objects.filter(institute=institute).select_related("grade", "subject")
        branch = _branch_filter(request)
        if branch:
            curriculum = curriculum.filter(grade__sections__branch=branch)
        grade_id = request.query_params.get("classId") or request.query_params.get("gradeId")
        if grade_id:
            curriculum = curriculum.filter(grade_id=grade_id)
        return _success(paginate_admin_queryset(request=request, queryset=curriculum, serializer_class=ClassSubjectSerializer))

    def post(self, request):
        serializer = ClassSubjectWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        grade = get_object_or_404(Grade, id=serializer.validated_data["grade_id"], institute=_institute(request))
        subject = get_object_or_404(Subject, id=serializer.validated_data["subject_id"], institute=_institute(request))
        if not serializer.validated_data.get("is_lab", False):
            serializer.validated_data["room_id"] = None
        if serializer.validated_data.get("room_id"):
            serializer.validated_data["room_id"] = get_object_or_404(Room, id=serializer.validated_data["room_id"], institute=_institute(request)).id
        curriculum = _save(ClassSubject(institute=_institute(request), grade=grade, subject=subject, **{key: value for key, value in serializer.validated_data.items() if key not in ("grade_id", "subject_id")}))
        return _success(ClassSubjectSerializer(curriculum).data, status.HTTP_201_CREATED)


class ClassSubjectDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, curriculum_id):
        return get_object_or_404(ClassSubject.objects.select_related("subject"), id=curriculum_id, institute=_institute(request))

    def patch(self, request, curriculum_id):
        curriculum = self.get_object(request, curriculum_id)
        serializer = ClassSubjectWriteSerializer(instance=curriculum, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            if field == "grade_id": curriculum.grade = get_object_or_404(Grade, id=value, institute=_institute(request))
            elif field == "subject_id": curriculum.subject = get_object_or_404(Subject, id=value, institute=_institute(request))
            elif field == "room_id": curriculum.room = get_object_or_404(Room, id=value, institute=_institute(request)) if value else None
            else: setattr(curriculum, field, value)
        if not curriculum.is_lab:
            curriculum.room = None
        _save(curriculum)
        return _success(ClassSubjectSerializer(curriculum).data)

    def delete(self, request, curriculum_id):
        return _delete(self.get_object(request, curriculum_id))


class ClassSectionListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        institute = _institute(request)
        sections = _section_queryset(institute)
        filters = {
            "branchId": ("branch_id", Branch),
            "academicYearId": ("academic_year_id", AcademicYear),
            "gradeId": ("grade_id", Grade),
        }
        for parameter, (field, model) in filters.items():
            value = request.query_params.get(parameter)
            if not value:
                continue
            if model is Branch:
                get_object_or_404(model, id=value, institute=institute)
            else:
                get_object_or_404(model, id=value, institute=institute)
            sections = sections.filter(**{field: value})
        search = request.query_params.get("search", "").strip()
        if search:
            sections = sections.filter(
                Q(section_name__icontains=search)
                | Q(grade__name__icontains=search)
                | Q(class_teacher__first_name__icontains=search)
                | Q(class_teacher__last_name__icontains=search)
            )
        return _success(
            paginate_admin_queryset(
                request=request, queryset=sections, serializer_class=ClassSectionSerializer
            )
        )

    def post(self, request):
        institute = _institute(request)
        serializer = ClassSectionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = get_object_or_404(
            Branch, id=data["branch_id"], institute=institute, is_active=True
        )
        grade = get_object_or_404(Grade, id=data["grade_id"], institute=institute)
        year = get_object_or_404(AcademicYear, id=data["academic_year_id"], institute=institute)
        teacher = _teacher(
            institute=institute,
            branch=branch,
            teacher_id=data.get("class_teacher_id"),
        )
        section = ClassSection(
            branch=branch,
            grade=grade,
            academic_year=year,
            section_name=data["section_name"],
            class_teacher=teacher,
            max_strength=data.get("max_strength"),
        )
        try:
            save_class_section(section=section)
        except AcademicsValidationError as exc:
            _raise_service_error(exc)
        audit_mutation(
            request=request,
            verb="Created",
            target_label=f"class section {section.grade.name} {section.section_name}",
            target_type="class_section",
            target_id=section.id,
        )
        return _success(ClassSectionSerializer(section).data, status.HTTP_201_CREATED)


class ClassSectionDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, section_id):
        return get_object_or_404(_section_queryset(_institute(request)), id=section_id)

    def get(self, request, section_id):
        return _success(ClassSectionSerializer(self.get_object(request, section_id)).data)

    def patch(self, request, section_id):
        section = self.get_object(request, section_id)
        institute = _institute(request)
        serializer = ClassSectionWriteSerializer(instance=section, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        branch = section.branch
        if "branch_id" in data:
            branch = get_object_or_404(
                Branch, id=data["branch_id"], institute=institute, is_active=True
            )
            section.branch = branch
        if "grade_id" in data:
            section.grade = get_object_or_404(Grade, id=data["grade_id"], institute=institute)
        if "academic_year_id" in data:
            section.academic_year = get_object_or_404(
                AcademicYear, id=data["academic_year_id"], institute=institute
            )
        if "class_teacher_id" in data:
            section.class_teacher = _teacher(
                institute=institute,
                branch=branch,
                teacher_id=data["class_teacher_id"],
            )
        for field in ("section_name", "max_strength"):
            if field in data:
                setattr(section, field, data[field])
        try:
            save_class_section(section=section)
        except AcademicsValidationError as exc:
            _raise_service_error(exc)
        return _success(ClassSectionSerializer(section).data)

    def delete(self, request, section_id):
        return _delete(self.get_object(request, section_id))


def _validate_assignment_sections(**kwargs):
    """Run the service validation, converting Django ValidationError to DRF 400."""
    try:
        validate_assignment_sections(**kwargs)
    except DjangoValidationError as exc:
        details = exc.message_dict if hasattr(exc, "message_dict") else exc.messages
        raise ValidationError(details) from exc


def _resolve_assignment_sections(institute, section_ids):
    sections = list(_section_queryset(institute).filter(id__in=section_ids))
    if len(sections) != len(set(section_ids)):
        raise ValidationError({"classSectionIds": ["One or more sections were not found."]})
    return sections


class SubjectTeacherAssignmentListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        institute = _institute(request)
        assignments = (
            SubjectTeacherAssignment.objects.filter(
                class_sections__branch__institute=institute
            )
            .select_related("subject", "teacher")
            .prefetch_related("class_sections__grade")
            .distinct()
        )
        section_id = request.query_params.get("classSectionId")
        if section_id:
            get_object_or_404(_section_queryset(institute), id=section_id)
            assignments = assignments.filter(class_sections__id=section_id)
        student_id = request.query_params.get("studentId")
        if student_id:
            # A student follows the subject-teacher map for their active section.
            active_section_ids = StudentEnrollment.objects.filter(
                student_id=student_id, student__institute=institute, left_at__isnull=True
            ).values_list("class_section_id", flat=True)
            assignments = assignments.filter(class_sections__id__in=active_section_ids)
        subject_id = request.query_params.get("subjectId")
        if subject_id:
            get_object_or_404(Subject, id=subject_id, institute=institute)
            assignments = assignments.filter(subject_id=subject_id)
        teacher_id = request.query_params.get("teacherId")
        if teacher_id:
            assignments = assignments.filter(teacher_id=teacher_id)
        return _success(
            paginate_admin_queryset(
                request=request,
                queryset=assignments,
                serializer_class=SubjectTeacherAssignmentSerializer,
            )
        )

    def post(self, request):
        institute = _institute(request)
        serializer = SubjectTeacherAssignmentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        sections = []
        section_ids = data.get("classSectionIds") or (
            [data["classSectionId"]] if data.get("classSectionId") else []
        )
        if section_ids:
            sections = _resolve_assignment_sections(institute, section_ids)
        elif data.get("class_id"):
            grade = get_object_or_404(Grade, id=data["class_id"], institute=institute)
            teacher_membership = User.objects.filter(id=data["teacher_id"], institute_memberships__institute=institute, institute_memberships__is_active=True).values_list("institute_memberships__branch_id", flat=True).first()
            branch = Branch.objects.filter(id=teacher_membership, institute=institute, is_active=True).first() or Branch.objects.filter(institute=institute, is_active=True).order_by("created_at").first()
            year = AcademicYear.objects.filter(institute=institute, is_current=True).first() or AcademicYear.objects.filter(institute=institute).order_by("-start_date").first()
            if not branch or not year:
                raise ValidationError({"classId": "A branch and academic year are required before mapping a class."})
            section, _ = ClassSection.objects.get_or_create(branch=branch, grade=grade, academic_year=year, section_name="Main")
            sections = [section]
        if not sections:
            raise ValidationError({"classId": "Select a class."})
        subject = get_object_or_404(Subject, id=data["subject_id"], institute=institute)
        teacher = _teacher(
            institute=institute,
            branch=sections[0].branch,
            teacher_id=data["teacher_id"],
        )
        _validate_assignment_sections(
            sections=sections,
            subject=subject,
            teacher=teacher,
            combined_slot_label=data.get("combined_slot_label", ""),
            assignment_id=None,
        )
        assignment = _save(
            SubjectTeacherAssignment(
                subject=subject,
                teacher=teacher,
                combined_slot_label=data.get("combined_slot_label", ""),
            )
        )
        assignment.class_sections.set(sections)
        return _success(
            SubjectTeacherAssignmentSerializer(assignment).data,
            status.HTTP_201_CREATED,
        )


class SubjectTeacherAssignmentDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, assignment_id):
        return get_object_or_404(
            SubjectTeacherAssignment.objects.select_related("subject", "teacher")
            .prefetch_related("class_sections__grade", "class_sections__branch")
            .distinct(),
            id=assignment_id,
            class_sections__branch__institute=_institute(request),
        )

    def get(self, request, assignment_id):
        return _success(
            SubjectTeacherAssignmentSerializer(self.get_object(request, assignment_id)).data
        )

    def patch(self, request, assignment_id):
        assignment = self.get_object(request, assignment_id)
        institute = _institute(request)
        serializer = SubjectTeacherAssignmentWriteSerializer(
            instance=assignment, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        sections = None
        section_ids = data.get("classSectionIds")
        if section_ids is None and "classSectionId" in data:
            section_ids = [data["classSectionId"]] if data["classSectionId"] else []
        if section_ids is not None:
            sections = _resolve_assignment_sections(institute, section_ids)
        target_sections = (
            sections if sections is not None else list(assignment.class_sections.all())
        )
        if not target_sections:
            raise ValidationError({"classSectionIds": ["Select at least one section."]})
        if "subject_id" in data:
            assignment.subject = get_object_or_404(
                Subject, id=data["subject_id"], institute=institute
            )
        if "teacher_id" in data:
            assignment.teacher = _teacher(
                institute=institute,
                branch=target_sections[0].branch,
                teacher_id=data["teacher_id"],
            )
        if "combined_slot_label" in data:
            assignment.combined_slot_label = data["combined_slot_label"]
        _validate_assignment_sections(
            sections=target_sections,
            subject=assignment.subject,
            teacher=assignment.teacher,
            combined_slot_label=assignment.combined_slot_label,
            assignment_id=assignment.id,
        )
        _save(assignment)
        if sections is not None:
            assignment.class_sections.set(sections)
            # Drop the stale prefetch cache so the response reflects the new set.
            assignment._prefetched_objects_cache = {}
        return _success(SubjectTeacherAssignmentSerializer(assignment).data)

    def delete(self, request, assignment_id):
        return _delete(self.get_object(request, assignment_id))


class StudentEnrollmentListCreateView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get(self, request):
        institute = _institute(request)
        enrollments = _enrollment_queryset(institute)
        direct_filters = {
            "studentId": "student_id",
            "classSectionId": "class_section_id",
            "academicYearId": "academic_year_id",
            "branchId": "class_section__branch_id",
        }
        for parameter, field in direct_filters.items():
            value = request.query_params.get(parameter)
            if value:
                enrollments = enrollments.filter(**{field: value})
        active = request.query_params.get("active")
        if active in {"true", "false"}:
            enrollments = enrollments.filter(left_at__isnull=active == "true")
        search = request.query_params.get("search", "").strip()
        if search:
            enrollments = enrollments.filter(
                Q(roll_number__icontains=search)
                | Q(student__admission_number__icontains=search)
                | Q(student__first_name__icontains=search)
                | Q(student__last_name__icontains=search)
            )
        return _success(
            paginate_admin_queryset(
                request=request,
                queryset=enrollments,
                serializer_class=StudentEnrollmentSerializer,
            )
        )

    def post(self, request):
        institute = _institute(request)
        serializer = StudentEnrollmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        student = get_object_or_404(
            Student,
            id=data["student_id"],
            institute=institute,
            is_active=True,
        )
        section = get_object_or_404(_section_queryset(institute), id=data["class_section_id"])
        try:
            enrollment = create_enrollment(
                student=student,
                class_section=section,
                roll_number=data["roll_number"],
            )
        except AcademicsValidationError as exc:
            _raise_service_error(exc)
        audit_mutation(
            request=request,
            verb="ENROLL",
            target_label=f"student {student.full_name} in {section.grade.name} {section.section_name}",
            target_type="student_enrollment",
            target_id=enrollment.id,
            extra_meta={"rollNumber": enrollment.roll_number, "classSectionId": str(section.id)},
        )
        return _success(
            StudentEnrollmentSerializer(enrollment).data,
            status.HTTP_201_CREATED,
        )


class StudentEnrollmentDetailView(APIView):
    permission_classes = (IsCurrentInstituteAdmin,)

    def get_object(self, request, enrollment_id):
        return get_object_or_404(_enrollment_queryset(_institute(request)), id=enrollment_id)

    def get(self, request, enrollment_id):
        return _success(StudentEnrollmentSerializer(self.get_object(request, enrollment_id)).data)

    def patch(self, request, enrollment_id):
        enrollment = self.get_object(request, enrollment_id)
        institute = _institute(request)
        serializer = StudentEnrollmentUpdateSerializer(
            instance=enrollment, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        section = None
        if "class_section_id" in data:
            section = get_object_or_404(_section_queryset(institute), id=data["class_section_id"])
        try:
            enrollment = update_enrollment(
                enrollment=enrollment,
                class_section=section,
                roll_number=data.get("roll_number"),
                left_at_marker="left_at" in data,
                left_at=data.get("left_at"),
            )
        except AcademicsValidationError as exc:
            _raise_service_error(exc)
        return _success(StudentEnrollmentSerializer(enrollment).data)

    def delete(self, request, enrollment_id):
        return _delete(self.get_object(request, enrollment_id))
