from rest_framework import serializers

from modules.institutes.models import Branch
from modules.people.models import Student

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


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError(
                {field: ["This field is not accepted."] for field in sorted(unknown)}
            )
        return super().to_internal_value(data)

    def validate(self, attrs):
        if self.partial and not attrs:
            raise serializers.ValidationError(
                {"nonFieldErrors": ["Provide at least one field to update."]}
            )
        return attrs


class AcademicOperationSerializer(serializers.ModelSerializer):
    branchId = serializers.UUIDField(source="branch_id", allow_null=True)
    createdBy = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = AcademicOperation
        fields = ("id", "kind", "title", "status", "branchId", "payload", "createdBy", "createdAt", "updatedAt")

    def get_createdBy(self, obj):
        if not obj.created_by:
            return None
        return {
            "id": str(obj.created_by_id),
            "name": obj.created_by.get_full_name() or obj.created_by.email,
        }


class AcademicOperationWriteSerializer(StrictSerializer):
    kind = serializers.ChoiceField(choices=AcademicOperation.Kind.choices, required=False)
    title = serializers.CharField(min_length=1, max_length=250, trim_whitespace=True, required=False)
    status = serializers.CharField(min_length=1, max_length=40, trim_whitespace=True, required=False)
    branchId = serializers.UUIDField(source="branch_id", required=False, allow_null=True)
    payload = serializers.DictField(required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not self.partial:
            for field in ("kind", "title"):
                if field not in attrs:
                    raise serializers.ValidationError({field: ["This field is required."]})
        return attrs


class AcademicYearSerializer(serializers.ModelSerializer):
    startDate = serializers.DateField(source="start_date")
    endDate = serializers.DateField(source="end_date")
    isCurrent = serializers.BooleanField(source="is_current")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    classesCount = serializers.IntegerField(source="classes_count", read_only=True, default=0)

    class Meta:
        model = AcademicYear
        fields = ("id", "name", "startDate", "endDate", "isCurrent", "classesCount", "createdAt", "updatedAt")


class AcademicYearWriteSerializer(StrictSerializer):
    name = serializers.CharField(min_length=1, max_length=20, trim_whitespace=True)
    startDate = serializers.DateField(source="start_date")
    endDate = serializers.DateField(source="end_date")
    isCurrent = serializers.BooleanField(source="is_current", required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"endDate": ["End date must be on or after start date."]}
            )
        return attrs


class AcademicTermSerializer(serializers.ModelSerializer):
    academicYearId = serializers.UUIDField(source="academic_year_id", read_only=True)
    startDate = serializers.DateField(source="start_date")
    endDate = serializers.DateField(source="end_date")
    sortOrder = serializers.IntegerField(source="sort_order")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = AcademicTerm
        fields = ("id", "academicYearId", "name", "startDate", "endDate", "sortOrder", "createdAt", "updatedAt")


class AcademicTermWriteSerializer(StrictSerializer):
    academicYearId = serializers.UUIDField(source="academic_year_id", required=False)
    name = serializers.CharField(min_length=1, max_length=80, trim_whitespace=True)
    startDate = serializers.DateField(source="start_date")
    endDate = serializers.DateField(source="end_date")
    sortOrder = serializers.IntegerField(source="sort_order", min_value=0, required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"endDate": ["End date must be on or after start date."]})
        return attrs


class GradeSerializer(serializers.ModelSerializer):
    sortOrder = serializers.IntegerField(source="sort_order")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    subjectsCount = serializers.IntegerField(source="subjects_count", read_only=True, default=0)

    class Meta:
        model = Grade
        fields = ("id", "name", "sortOrder", "subjectsCount", "createdAt", "updatedAt")


class GradeWriteSerializer(StrictSerializer):
    name = serializers.CharField(min_length=1, max_length=50, trim_whitespace=True)
    sortOrder = serializers.IntegerField(source="sort_order", min_value=0, required=False)


class SubjectSerializer(serializers.ModelSerializer):
    subjectCode = serializers.CharField(source="subject_code")
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    classesCount = serializers.IntegerField(source="classes_count", read_only=True, default=0)

    class Meta:
        model = Subject
        fields = ("id", "name", "subjectCode", "classesCount", "createdAt", "updatedAt")


class SubjectWriteSerializer(StrictSerializer):
    name = serializers.CharField(min_length=1, max_length=100, trim_whitespace=True)
    subjectCode = serializers.CharField(
        source="subject_code", max_length=20, required=False, allow_blank=True, trim_whitespace=True
    )


class ClassSubjectSerializer(serializers.ModelSerializer):
    classId = serializers.UUIDField(source="grade_id")
    subjectId = serializers.UUIDField(source="subject_id")
    subject = serializers.SerializerMethodField()
    subjectCode = serializers.SerializerMethodField()
    subjectCodeOverride = serializers.CharField(source="subject_code_override", allow_blank=True)
    isElective = serializers.BooleanField(source="is_elective")
    periodsPerWeek = serializers.IntegerField(source="periods_per_week", allow_null=True)
    defaultMaxMarks = serializers.DecimalField(source="default_max_marks", max_digits=6, decimal_places=2, allow_null=True)
    sortOrder = serializers.IntegerField(source="sort_order")
    roomId = serializers.UUIDField(source="room_id", allow_null=True)
    isLab = serializers.BooleanField(source="is_lab")

    class Meta:
        model = ClassSubject
        fields = ("id", "classId", "subjectId", "subject", "subjectCode", "subjectCodeOverride", "isElective", "isLab", "periodsPerWeek", "defaultMaxMarks", "sortOrder", "roomId")

    def get_subjectCode(self, obj):
        return obj.subject_code_override or obj.subject.subject_code

    def get_subject(self, obj):
        return {"id": str(obj.subject_id), "name": obj.subject.name, "subjectCode": obj.subject.subject_code}


class ClassSubjectWriteSerializer(StrictSerializer):
    classId = serializers.UUIDField(source="grade_id")
    subjectId = serializers.UUIDField(source="subject_id")
    subjectCodeOverride = serializers.CharField(source="subject_code_override", max_length=20, required=False, allow_blank=True)
    isElective = serializers.BooleanField(source="is_elective", required=False)
    periodsPerWeek = serializers.IntegerField(source="periods_per_week", required=False, allow_null=True, min_value=1)
    defaultMaxMarks = serializers.DecimalField(source="default_max_marks", max_digits=6, decimal_places=2, required=False, allow_null=True, min_value=0)
    sortOrder = serializers.IntegerField(source="sort_order", required=False, min_value=0)
    roomId = serializers.UUIDField(source="room_id", required=False, allow_null=True)
    isLab = serializers.BooleanField(source="is_lab", required=False)


class BranchSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ("id", "name", "code")


class RoomSerializer(serializers.ModelSerializer):
    branch = BranchSummarySerializer(read_only=True)
    roomType = serializers.CharField(source="room_type")
    floor = serializers.IntegerField()
    equipment = serializers.ListField(child=serializers.CharField(max_length=60), read_only=True)
    isActive = serializers.BooleanField(source="is_active")

    class Meta:
        model = Room
        fields = ("id", "name", "roomType", "capacity", "floor", "equipment", "isActive", "branch", "created_at", "updated_at")


class RoomWriteSerializer(StrictSerializer):
    name = serializers.CharField(min_length=1, max_length=100, trim_whitespace=True)
    branchId = serializers.UUIDField(source="branch_id")
    roomType = serializers.CharField(source="room_type", max_length=40, required=False)
    capacity = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    floor = serializers.IntegerField(required=False, min_value=0, max_value=200)
    equipment = serializers.ListField(child=serializers.CharField(max_length=60, trim_whitespace=True), required=False)
    isActive = serializers.BooleanField(source="is_active", required=False)


class GradeSummarySerializer(serializers.ModelSerializer):
    sortOrder = serializers.IntegerField(source="sort_order")

    class Meta:
        model = Grade
        fields = ("id", "name", "sortOrder")


class UserSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    fullName = serializers.SerializerMethodField()
    email = serializers.EmailField()

    def get_fullName(self, obj):
        return obj.get_full_name() or obj.email


class ClassSectionSerializer(serializers.ModelSerializer):
    branch = BranchSummarySerializer(read_only=True)
    grade = GradeSummarySerializer(read_only=True)
    academicYear = AcademicYearSerializer(source="academic_year", read_only=True)
    sectionName = serializers.CharField(source="section_name")
    classTeacher = UserSummarySerializer(source="class_teacher", read_only=True)
    maxStrength = serializers.IntegerField(source="max_strength", allow_null=True)
    enrollmentCount = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = ClassSection
        fields = (
            "id",
            "branch",
            "grade",
            "academicYear",
            "sectionName",
            "classTeacher",
            "maxStrength",
            "enrollmentCount",
            "createdAt",
            "updatedAt",
        )

    def get_enrollmentCount(self, obj):
        annotated = getattr(obj, "enrollment_count", None)
        if annotated is not None:
            return annotated
        return obj.student_enrollments.filter(left_at__isnull=True).count()


class ClassSectionWriteSerializer(StrictSerializer):
    branchId = serializers.UUIDField(source="branch_id")
    gradeId = serializers.UUIDField(source="grade_id")
    academicYearId = serializers.UUIDField(source="academic_year_id")
    sectionName = serializers.CharField(
        source="section_name", min_length=1, max_length=20, trim_whitespace=True
    )
    classTeacherId = serializers.UUIDField(
        source="class_teacher_id", required=False, allow_null=True
    )
    maxStrength = serializers.IntegerField(
        source="max_strength", required=False, allow_null=True, min_value=1
    )


class SubjectSummarySerializer(serializers.ModelSerializer):
    subjectCode = serializers.CharField(source="subject_code")

    class Meta:
        model = Subject
        fields = ("id", "name", "subjectCode")


class SubjectTeacherAssignmentSerializer(serializers.ModelSerializer):
    classSectionId = serializers.UUIDField(source="class_section_id")
    classSection = serializers.SerializerMethodField()
    classSectionLabel = serializers.SerializerMethodField()
    subject = SubjectSummarySerializer(read_only=True)
    teacher = UserSummarySerializer(read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = SubjectTeacherAssignment
        fields = ("id", "classSectionId", "classSection", "classSectionLabel", "subject", "teacher", "createdAt", "updatedAt")

    def get_classSection(self, obj):
        return {
            "id": str(obj.class_section_id),
            "label": f"{obj.class_section.grade.name} {obj.class_section.section_name}",
            "grade": obj.class_section.grade.name,
            "sectionName": obj.class_section.section_name,
        }

    def get_classSectionLabel(self, obj):
        return f"{obj.class_section.grade.name} {obj.class_section.section_name}"


class SubjectTeacherAssignmentWriteSerializer(StrictSerializer):
    classSectionId = serializers.UUIDField(source="class_section_id", required=False, allow_null=True)
    classId = serializers.UUIDField(source="class_id", required=False)
    subjectId = serializers.UUIDField(source="subject_id")
    teacherId = serializers.UUIDField(source="teacher_id")


class StudentSummarySerializer(serializers.ModelSerializer):
    admissionNumber = serializers.CharField(source="admission_number")
    fullName = serializers.CharField(source="full_name")

    class Meta:
        model = Student
        fields = ("id", "admissionNumber", "fullName")


class StudentEnrollmentSerializer(serializers.ModelSerializer):
    student = StudentSummarySerializer(read_only=True)
    classSection = ClassSectionSerializer(source="class_section", read_only=True)
    academicYear = AcademicYearSerializer(source="academic_year", read_only=True)
    rollNumber = serializers.CharField(source="roll_number")
    enrolledAt = serializers.DateTimeField(source="enrolled_at", read_only=True)
    leftAt = serializers.DateTimeField(source="left_at", allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = StudentEnrollment
        fields = (
            "id",
            "student",
            "classSection",
            "academicYear",
            "rollNumber",
            "enrolledAt",
            "leftAt",
            "createdAt",
            "updatedAt",
        )


class StudentEnrollmentCreateSerializer(StrictSerializer):
    studentId = serializers.UUIDField(source="student_id")
    classSectionId = serializers.UUIDField(source="class_section_id")
    rollNumber = serializers.CharField(
        source="roll_number", min_length=1, max_length=20, trim_whitespace=True
    )


class StudentEnrollmentUpdateSerializer(StrictSerializer):
    classSectionId = serializers.UUIDField(source="class_section_id", required=False)
    rollNumber = serializers.CharField(
        source="roll_number", min_length=1, max_length=20, trim_whitespace=True, required=False
    )
    leftAt = serializers.DateTimeField(source="left_at", required=False, allow_null=True)
