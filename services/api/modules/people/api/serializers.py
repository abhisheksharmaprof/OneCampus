from rest_framework import serializers

from modules.institutes.models import Branch
from modules.people.models import Student


class BranchSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ("id", "name", "code")


class StudentSerializer(serializers.ModelSerializer):
    admissionNumber = serializers.CharField(source="admission_number", read_only=True)
    firstName = serializers.CharField(source="first_name")
    lastName = serializers.CharField(source="last_name")
    fatherName = serializers.CharField(source="father_name", read_only=True)
    motherName = serializers.CharField(source="mother_name", read_only=True)
    isActive = serializers.BooleanField(source="is_active", read_only=True)
    branch = BranchSummarySerializer(read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)
    studentNicId = serializers.CharField(source="student_nic_id", read_only=True)
    srNumber = serializers.CharField(source="sr_number", read_only=True)
    aadharNumber = serializers.CharField(source="aadhar_number", read_only=True)
    dateOfBirth = serializers.DateField(source="date_of_birth", read_only=True)
    socialCategory = serializers.CharField(source="social_category", read_only=True)
    motherTongue = serializers.CharField(source="mother_tongue", read_only=True)
    ruralUrban = serializers.CharField(source="rural_urban", read_only=True)
    habitationLocality = serializers.CharField(source="habitation_locality", read_only=True)
    dateOfAdmission = serializers.DateField(source="date_of_admission", read_only=True)
    belongsToBpl = serializers.BooleanField(source="belongs_to_bpl", read_only=True)
    belongsToDisadvantagedGroup = serializers.BooleanField(
        source="belongs_to_disadvantaged_group", read_only=True
    )
    gettingFreeEducation = serializers.BooleanField(source="getting_free_education", read_only=True)
    previousClass = serializers.CharField(source="previous_class", read_only=True)
    previousYearStatus = serializers.CharField(source="previous_year_status", read_only=True)
    previousYearAttendanceDays = serializers.IntegerField(
        source="previous_year_attendance_days", read_only=True
    )
    mediumOfInstruction = serializers.CharField(source="medium_of_instruction", read_only=True)
    disabilityType = serializers.CharField(source="disability_type", read_only=True)
    cwsnFacilities = serializers.CharField(source="cwsn_facilities", read_only=True)
    uniformSets = serializers.IntegerField(source="uniform_sets", read_only=True)
    freeTextBooks = serializers.BooleanField(source="free_text_books", read_only=True)
    freeTransport = serializers.BooleanField(source="free_transport", read_only=True)
    freeEscort = serializers.BooleanField(source="free_escort", read_only=True)
    mdmBeneficiary = serializers.BooleanField(source="mdm_beneficiary", read_only=True)
    freeHostelFacility = serializers.BooleanField(source="free_hostel_facility", read_only=True)
    attendedSpecialTraining = serializers.BooleanField(
        source="attended_special_training", read_only=True
    )
    lastExaminationAppeared = serializers.BooleanField(
        source="last_examination_appeared", read_only=True
    )
    lastExaminationPassed = serializers.BooleanField(
        source="last_examination_passed", read_only=True
    )
    lastExaminationPercentage = serializers.DecimalField(
        source="last_examination_percentage", max_digits=5, decimal_places=2, read_only=True
    )
    stream = serializers.CharField(read_only=True)
    tradeSector = serializers.CharField(source="trade_sector", read_only=True)
    ironFolicAcidTablets = serializers.BooleanField(
        source="iron_folic_acid_tablets", read_only=True
    )
    dewormingTablets = serializers.BooleanField(source="deworming_tablets", read_only=True)
    vitaminASupplement = serializers.BooleanField(source="vitamin_a_supplement", read_only=True)
    mobileNumber = serializers.CharField(source="mobile_number", read_only=True)
    emailAddress = serializers.EmailField(source="email_address", read_only=True)
    studyingInClass = serializers.SerializerMethodField()
    classSectionName = serializers.SerializerMethodField()
    session = serializers.SerializerMethodField()

    def _current_enrollment(self, student):
        if hasattr(student, "active_enrollments"):
            return student.active_enrollments[0] if student.active_enrollments else None
        return (
            student.academic_enrollments.filter(left_at__isnull=True)
            .select_related("class_section__grade")
            .first()
        )

    def get_studyingInClass(self, student):
        enrollment = self._current_enrollment(student)
        return enrollment.class_section.grade.name if enrollment else ""

    def get_classSectionName(self, student):
        enrollment = self._current_enrollment(student)
        return enrollment.class_section.section_name if enrollment else ""

    def get_session(self, student):
        enrollment = self._current_enrollment(student)
        return enrollment.academic_year.name if enrollment else ""

    class Meta:
        model = Student
        fields = (
            "id",
            "admissionNumber",
            "firstName",
            "lastName",
            "fatherName",
            "motherName",
            "studentNicId",
            "srNumber",
            "aadharNumber",
            "dateOfBirth",
            "gender",
            "socialCategory",
            "religion",
            "motherTongue",
            "ruralUrban",
            "habitationLocality",
            "dateOfAdmission",
            "belongsToBpl",
            "belongsToDisadvantagedGroup",
            "gettingFreeEducation",
            "previousClass",
            "previousYearStatus",
            "previousYearAttendanceDays",
            "mediumOfInstruction",
            "disabilityType",
            "cwsnFacilities",
            "uniformSets",
            "freeTextBooks",
            "freeTransport",
            "freeEscort",
            "mdmBeneficiary",
            "freeHostelFacility",
            "attendedSpecialTraining",
            "lastExaminationAppeared",
            "lastExaminationPassed",
            "lastExaminationPercentage",
            "stream",
            "tradeSector",
            "ironFolicAcidTablets",
            "dewormingTablets",
            "vitaminASupplement",
            "mobileNumber",
            "emailAddress",
            "studyingInClass",
            "classSectionName",
            "session",
            "isActive",
            "branch",
            "createdAt",
            "updatedAt",
        )


class StudentWriteSerializer(serializers.Serializer):
    branchId = serializers.UUIDField(required=False, allow_null=True)
    admissionNumber = serializers.CharField(max_length=64, required=False, allow_blank=False, trim_whitespace=True)
    firstName = serializers.CharField(max_length=100, trim_whitespace=True)
    lastName = serializers.CharField(
        max_length=100, required=False, allow_blank=True, trim_whitespace=True
    )
    fatherName = serializers.CharField(max_length=200, required=False, allow_blank=True)
    motherName = serializers.CharField(max_length=200, required=False, allow_blank=True)
    dateOfBirth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(max_length=20, required=False, allow_blank=True)
    dateOfAdmission = serializers.DateField(required=False, allow_null=True)
    studentNicId = serializers.CharField(max_length=64, required=False, allow_blank=True)
    srNumber = serializers.CharField(max_length=64, required=False, allow_blank=True)
    aadharNumber = serializers.CharField(max_length=20, required=False, allow_blank=True)
    socialCategory = serializers.CharField(max_length=40, required=False, allow_blank=True)
    religion = serializers.CharField(max_length=60, required=False, allow_blank=True)
    motherTongue = serializers.CharField(max_length=60, required=False, allow_blank=True)
    ruralUrban = serializers.CharField(max_length=10, required=False, allow_blank=True)
    habitationLocality = serializers.CharField(max_length=200, required=False, allow_blank=True)
    belongsToBpl = serializers.BooleanField(required=False, allow_null=True)
    belongsToDisadvantagedGroup = serializers.BooleanField(required=False, allow_null=True)
    gettingFreeEducation = serializers.BooleanField(required=False, allow_null=True)
    previousClass = serializers.CharField(max_length=50, required=False, allow_blank=True)
    previousYearStatus = serializers.CharField(max_length=100, required=False, allow_blank=True)
    previousYearAttendanceDays = serializers.IntegerField(
        required=False, allow_null=True, min_value=0
    )
    mediumOfInstruction = serializers.CharField(max_length=60, required=False, allow_blank=True)
    disabilityType = serializers.CharField(max_length=100, required=False, allow_blank=True)
    cwsnFacilities = serializers.CharField(max_length=200, required=False, allow_blank=True)
    uniformSets = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    freeTextBooks = serializers.BooleanField(required=False, allow_null=True)
    freeTransport = serializers.BooleanField(required=False, allow_null=True)
    freeEscort = serializers.BooleanField(required=False, allow_null=True)
    mdmBeneficiary = serializers.BooleanField(required=False, allow_null=True)
    freeHostelFacility = serializers.BooleanField(required=False, allow_null=True)
    attendedSpecialTraining = serializers.BooleanField(required=False, allow_null=True)
    lastExaminationAppeared = serializers.BooleanField(required=False, allow_null=True)
    lastExaminationPassed = serializers.BooleanField(required=False, allow_null=True)
    lastExaminationPercentage = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True, min_value=0, max_value=100
    )
    stream = serializers.CharField(max_length=100, required=False, allow_blank=True)
    tradeSector = serializers.CharField(max_length=100, required=False, allow_blank=True)
    ironFolicAcidTablets = serializers.BooleanField(required=False, allow_null=True)
    dewormingTablets = serializers.BooleanField(required=False, allow_null=True)
    vitaminASupplement = serializers.BooleanField(required=False, allow_null=True)
    mobileNumber = serializers.CharField(max_length=20, required=False, allow_blank=True)
    emailAddress = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    academicYearId = serializers.UUIDField(required=False, allow_null=True)
    classSectionId = serializers.UUIDField(required=False, allow_null=True)

    def validate_firstName(self, value):
        if not value:
            raise serializers.ValidationError("First name is required.")
        return value
