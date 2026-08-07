from io import StringIO

import pytest
from django.core.management import call_command

from modules.academics.models import (
    AcademicYear,
    ClassSection,
    ClassSubject,
    Grade,
    StudentEnrollment,
)
from modules.institutes.models import Institute, InstituteAssociation, InstituteMembership
from modules.people.models import StaffProfile, Student


@pytest.mark.django_db
def test_seed_test_institute_is_complete_and_idempotent():
    output = StringIO()
    call_command("seed_test_institute", stdout=output)
    call_command("seed_test_institute", stdout=output)

    institute = Institute.objects.get(code="CAMPUSONE-TEST")
    assert Grade.objects.filter(institute=institute).count() == 15
    assert ClassSection.objects.filter(branch__institute=institute).count() == 15
    assert StaffProfile.objects.filter(institute=institute).count() == 30
    assert InstituteMembership.objects.filter(institute=institute, role="TEACHER").count() == 30
    assert Student.objects.filter(institute=institute).count() == 150
    assert StudentEnrollment.objects.filter(academic_year__institute=institute).count() == 150
    assert ClassSubject.objects.filter(institute=institute).count() >= 100
    assert AcademicYear.objects.filter(institute=institute, is_current=True).count() == 1
    assert InstituteAssociation.objects.filter(
        institute_one=institute
    ).count() + InstituteAssociation.objects.filter(institute_two=institute).count() == 2
