from io import StringIO

import pytest
from django.core.management import call_command

from modules.academics.models import ClassSection, StudentEnrollment
from modules.admin_console.models import AdminRecord
from modules.attendance.models import StaffAttendance, StudentAttendance
from modules.finance.models import FeeInvoice, FeePayment
from modules.institutes.models import Institute, InstituteAssociation
from modules.people.models import ParentProfile, StaffProfile, Student
from modules.school_calendar.models import AcademicCalendarEvent


@pytest.mark.django_db
def test_realistic_institute_seed_is_complete_and_idempotent():
    output = StringIO()
    call_command("seed_realistic_institutes", stdout=output)
    call_command("seed_realistic_institutes", stdout=output)

    noida = Institute.objects.get(code="CAMPUSONE-NOIDA")
    pune = Institute.objects.get(code="CAMPUSONE-PUNE")
    for institute in (noida, pune):
        assert institute.onboarding_status == Institute.OnboardingStatus.APPROVED
        assert institute.branches.filter(is_head_office=True).count() == 1
        assert ClassSection.objects.filter(branch__institute=institute).count() >= 6
        assert Student.objects.filter(institute=institute).count() >= 72
        assert StudentEnrollment.objects.filter(academic_year__institute=institute).count() >= 72
        assert StaffProfile.objects.filter(institute=institute).count() >= 12
        assert ParentProfile.objects.filter(institute=institute).count() >= 72
        assert StudentAttendance.objects.filter(institute=institute).count() >= 72 * 20
        assert StaffAttendance.objects.filter(institute=institute).count() >= 12 * 20
        assert FeeInvoice.objects.filter(institute=institute).count() >= 72
        assert FeePayment.objects.filter(invoice__institute=institute).count() >= 60
        assert AcademicCalendarEvent.objects.filter(institute=institute).count() == 4
        assert AdminRecord.objects.filter(institute=institute, is_active=True).count() >= 50

    assert InstituteAssociation.objects.filter(
        institute_one__in=(noida, pune), institute_two__in=(noida, pune)
    ).exists()
