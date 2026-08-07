import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


@pytest.mark.django_db(transaction=True)
def test_user_email_is_unique_case_insensitively():
    User.objects.create_user(email="owner@campusone.test", password="StrongPass123!")

    with pytest.raises(IntegrityError):
        User.objects.create_user(email="OWNER@campusone.test", password="StrongPass123!")


@pytest.mark.django_db
def test_institute_admin_membership_is_institute_wide():
    institute = Institute.objects.create(name="CampusOne Academy", code="COA")
    user = User.objects.create_user(email="admin@campusone.test", password="StrongPass123!")

    membership = InstituteMembership.objects.create(
        user=user,
        institute=institute,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )

    assert membership.branch_id is None
    assert membership.is_active is True
    assert user.username is None


@pytest.mark.django_db
def test_branch_scoped_role_requires_branch_from_same_institute():
    institute = Institute.objects.create(name="CampusOne Academy", code="COA")
    other = Institute.objects.create(name="Other School", code="OTHER")
    wrong_branch = Branch.objects.create(institute=other, name="North", code="NORTH")
    user = User.objects.create_user(email="teacher@campusone.test", password="StrongPass123!")
    membership = InstituteMembership(
        user=user,
        institute=institute,
        branch=wrong_branch,
        role=InstituteMembership.Role.TEACHER,
    )

    with pytest.raises(ValidationError):
        membership.full_clean()
