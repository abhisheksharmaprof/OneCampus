from rest_framework import serializers

from ..models import Exam, ExamRequestReceipt


class ExamStrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        unknown = set(data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError(
                {key: ["This field is not accepted."] for key in sorted(unknown)}
            )
        return super().to_internal_value(data)


class ExamCreateSerializer(ExamStrictSerializer):
    requestId = serializers.UUIDField()
    campusId = serializers.UUIDField()
    academicYearId = serializers.UUIDField()
    termId = serializers.UUIDField(required=False, allow_null=True)
    category = serializers.ChoiceField(choices=Exam.Category.choices)
    customLabel = serializers.CharField(
        max_length=100, required=False, allow_blank=True, trim_whitespace=True
    )
    name = serializers.CharField(min_length=1, max_length=250, trim_whitespace=True)
    classSectionIds = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    startsOn = serializers.DateField(required=False, allow_null=True)
    endsOn = serializers.DateField(required=False, allow_null=True)
    coordinatorId = serializers.UUIDField(required=False, allow_null=True)
    instructions = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=10_000
    )

    def validate_classSectionIds(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Duplicate class sections are not allowed.")
        return value


class ExamUpdateSerializer(ExamStrictSerializer):
    expectedRevision = serializers.IntegerField(min_value=1)
    name = serializers.CharField(min_length=1, max_length=250, trim_whitespace=True, required=False)
    category = serializers.ChoiceField(choices=Exam.Category.choices, required=False)
    customLabel = serializers.CharField(
        max_length=100, required=False, allow_blank=True, trim_whitespace=True
    )
    termId = serializers.UUIDField(required=False, allow_null=True)
    classSectionIds = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, required=False
    )
    startsOn = serializers.DateField(required=False, allow_null=True)
    endsOn = serializers.DateField(required=False, allow_null=True)
    coordinatorId = serializers.UUIDField(required=False, allow_null=True)
    instructions = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=10_000
    )

    def validate_classSectionIds(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Duplicate class sections are not allowed.")
        return value

    def validate(self, attrs):
        if len(attrs) == 1:
            raise serializers.ValidationError(
                {"nonFieldErrors": ["Provide at least one field to update."]}
            )
        return attrs


class ExamDuplicateSerializer(ExamStrictSerializer):
    requestId = serializers.UUIDField()
    campusId = serializers.UUIDField()
    academicYearId = serializers.UUIDField()
    classSectionIds = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    name = serializers.CharField(min_length=1, max_length=250, trim_whitespace=True)
    termId = serializers.UUIDField(required=False, allow_null=True)
    startsOn = serializers.DateField(required=False, allow_null=True)
    endsOn = serializers.DateField(required=False, allow_null=True)

    def validate_classSectionIds(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Duplicate class sections are not allowed.")
        return value


class ExamPublishSerializer(ExamStrictSerializer):
    expectedRevision = serializers.IntegerField(min_value=1)


class ExamTimetablePublishSerializer(ExamStrictSerializer):
    expectedRevision = serializers.IntegerField(min_value=1)


class ExamPaperMarksSerializer(ExamStrictSerializer):
    subjectId = serializers.UUIDField()
    durationMinutes = serializers.IntegerField(min_value=1, max_value=1440, required=False)
    theoryMax = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=0, allow_null=True
    )
    practicalMax = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=0, allow_null=True
    )
    passMarks = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=0, allow_null=True
    )

    def validate(self, attrs):
        theory, practical, passing = attrs["theoryMax"], attrs["practicalMax"], attrs["passMarks"]
        if (
            passing is not None
            and (theory is not None or practical is not None)
            and passing > (theory or 0) + (practical or 0)
        ):
            raise serializers.ValidationError("Pass marks cannot exceed the total maximum marks.")
        return attrs


class ExamSubjectTargetSerializer(ExamStrictSerializer):
    classSectionId = serializers.UUIDField()
    subjectIds = serializers.ListField(child=serializers.UUIDField(), allow_empty=True)
    paperMarks = ExamPaperMarksSerializer(many=True, required=False)

    def validate_subjectIds(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Duplicate subjects are not allowed.")
        return value

    def validate(self, attrs):
        paper_ids = [row["subjectId"] for row in attrs.get("paperMarks", [])]
        if len(paper_ids) != len(set(paper_ids)) or not set(paper_ids).issubset(
            set(attrs["subjectIds"])
        ):
            raise serializers.ValidationError(
                "Paper settings must refer to distinct selected subjects."
            )
        return attrs


class ExamSubjectSetupSerializer(ExamStrictSerializer):
    expectedRevision = serializers.IntegerField(min_value=1)
    targets = ExamSubjectTargetSerializer(many=True, allow_empty=False)

    def validate_targets(self, value):
        section_ids = [item["classSectionId"] for item in value]
        if len(section_ids) != len(set(section_ids)):
            raise serializers.ValidationError("Duplicate target sections are not allowed.")
        return value


class ExamPaperScheduleSerializer(ExamStrictSerializer):
    classSectionId = serializers.UUIDField()
    subjectId = serializers.UUIDField()
    scheduledOn = serializers.DateField(allow_null=True)
    startTime = serializers.TimeField(allow_null=True)
    endTime = serializers.TimeField(allow_null=True)
    roomId = serializers.UUIDField(allow_null=True, required=False)
    invigilatorId = serializers.UUIDField(allow_null=True, required=False)


class ExamScheduleSerializer(ExamStrictSerializer):
    expectedRevision = serializers.IntegerField(min_value=1)
    papers = ExamPaperScheduleSerializer(many=True, allow_empty=True)

    def validate_papers(self, value):
        pairs = [(item["classSectionId"], item["subjectId"]) for item in value]
        if len(pairs) != len(set(pairs)):
            raise serializers.ValidationError("Duplicate paper schedules are not allowed.")
        for item in value:
            scheduled_on, start_time, end_time = (
                item["scheduledOn"],
                item["startTime"],
                item["endTime"],
            )
            if (scheduled_on is None) != (start_time is None) or (start_time is None) != (
                end_time is None
            ):
                raise serializers.ValidationError(
                    "Set the date, start time, and end time together, or leave all blank."
                )
            if start_time and end_time <= start_time:
                raise serializers.ValidationError("End time must be later than start time.")
        return value


class ExamElectiveAssignmentsSerializer(ExamStrictSerializer):
    expectedRevision = serializers.IntegerField(min_value=1)
    studentIds = serializers.ListField(child=serializers.UUIDField(), allow_empty=True)

    def validate_studentIds(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError("Duplicate students are not allowed.")
        return value


class ExamSerializer(serializers.ModelSerializer):
    campusId = serializers.UUIDField(source="branch_id", read_only=True)
    academicYearId = serializers.UUIDField(source="academic_year_id", read_only=True)
    termId = serializers.UUIDField(source="term_id", allow_null=True, read_only=True)
    classSectionIds = serializers.SerializerMethodField()
    sections = serializers.SerializerMethodField()
    startsOn = serializers.DateField(source="starts_on", allow_null=True)
    endsOn = serializers.DateField(source="ends_on", allow_null=True)
    coordinatorId = serializers.UUIDField(source="coordinator_id", allow_null=True)
    customLabel = serializers.CharField(source="custom_label")
    createdAt = serializers.DateTimeField(source="created_at")
    updatedAt = serializers.DateTimeField(source="updated_at")

    class Meta:
        model = Exam
        fields = (
            "id",
            "campusId",
            "academicYearId",
            "termId",
            "category",
            "customLabel",
            "name",
            "classSectionIds",
            "sections",
            "startsOn",
            "endsOn",
            "coordinatorId",
            "instructions",
            "status",
            "revision",
            "createdAt",
            "updatedAt",
        )

    def get_classSectionIds(self, obj):
        return [str(target.class_section_id) for target in obj.targets.all()]

    def get_sections(self, obj):
        return [
            {
                "id": str(target.class_section_id),
                "name": target.class_section.section_name,
                "sectionName": target.class_section.section_name,
                "gradeName": target.class_section.grade.name,
                "campusId": str(target.class_section.branch_id),
                "academicYearId": str(target.class_section.academic_year_id),
            }
            for target in obj.targets.all()
        ]


def exam_receipt_data(receipt: ExamRequestReceipt) -> dict:
    return {
        "requestId": str(receipt.request_id),
        "examId": str(receipt.exam_id) if receipt.exam_id else None,
        "savedRevision": receipt.saved_revision,
    }
