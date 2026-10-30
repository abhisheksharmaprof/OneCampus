import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from modules.file_storage.models import FileAsset
from modules.identity.models import User, UserProfile
from modules.institutes.models import Institute, InstituteMembership
from modules.people.models import StaffProfile


def signed_in_admin(api_client):
    institute = Institute.objects.create(name="Profile Academy", code="PROFILE")
    user = User.objects.create_user(
        email="person@campusone.test", password="StrongPass123!", first_name="Asha", last_name="Rao"
    )
    InstituteMembership.objects.create(
        user=user, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    response = api_client.post(
        "/api/v1/identity/sessions",
        {"email": user.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    assert response.status_code == 200
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['data']['accessToken']}")
    return user, institute


@pytest.mark.django_db
def test_account_profile_is_self_scoped_and_name_and_login_email_are_immutable(api_client):
    user, _ = signed_in_admin(api_client)

    response = api_client.get("/api/v1/identity/account")
    assert response.status_code == 200
    assert response.json()["data"]["displayName"] == "Asha Rao"
    assert response.json()["data"]["email"] == user.email

    response = api_client.patch(
        "/api/v1/identity/account",
        {"firstName": "Changed", "email": "other@campusone.test"},
        format="json",
    )
    assert response.status_code == 400
    assert user.first_name == "Asha"
    assert user.email == "person@campusone.test"


@pytest.mark.django_db
def test_alternate_email_and_self_reported_experience_save_without_changing_hr(api_client):
    user, institute = signed_in_admin(api_client)
    staff = StaffProfile.objects.create(
        user=user, institute=institute, employee_code="EMP-7", department="Science",
        qualification="MSc", experience_years=9, previous_school_name="North School",
    )

    response = api_client.patch(
        "/api/v1/identity/account",
        {
            "alternateEmail": "asha.contact@example.test",
            "experienceYears": 4,
            "previousWorkplace": "User entry",
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["data"]["alternateEmail"] == "asha.contact@example.test"
    assert response.json()["data"]["workExperience"]["experienceYears"] == 4
    user.refresh_from_db()
    staff.refresh_from_db()
    assert (user.first_name, user.email) == ("Asha", "person@campusone.test")
    assert (staff.qualification, staff.experience_years, staff.previous_school_name) == (
        "MSc", 9, "North School"
    )

    same_email = api_client.patch(
        "/api/v1/identity/account", {"alternateEmail": user.email.upper()}, format="json"
    )
    assert same_email.status_code == 400


@pytest.mark.django_db
def test_confirmed_import_copies_only_selected_values_to_user_profile(api_client):
    user, institute = signed_in_admin(api_client)
    staff = StaffProfile.objects.create(
        user=user, institute=institute, employee_code="EMP-8", date_of_birth="1990-02-03",
        qualification="BEd", experience_years=6, previous_school_name="East School",
    )
    other_institute = Institute.objects.create(name="Other Academy", code="OTHER")
    StaffProfile.objects.create(
        user=user, institute=other_institute, employee_code="EMP-9", qualification="PhD"
    )
    UserProfile.objects.create(user=user, date_of_birth="1988-01-01")

    rejected = api_client.post(
        "/api/v1/identity/account/import-from-active-staff",
        {"fields": ["qualification"], "userId": "another-user"},
        format="json",
    )
    assert rejected.status_code == 400

    response = api_client.post(
        "/api/v1/identity/account/import-from-active-staff",
        {"fields": ["dateOfBirth", "qualification", "experienceYears"]},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["data"]["imported"] == ["qualification", "experienceYears"]
    assert response.json()["data"]["skipped"] == ["dateOfBirth"]
    profile = UserProfile.objects.get(user=user)
    staff.refresh_from_db()
    assert (str(profile.date_of_birth), profile.qualification, profile.experience_years) == (
        "1988-01-01", "BEd", 6
    )
    assert (staff.qualification, staff.experience_years) == ("BEd", 6)


@pytest.mark.django_db
def test_account_photo_uses_authenticated_user_owner_and_separate_asset(api_client, monkeypatch):
    user, _ = signed_in_admin(api_client)
    old_asset = FileAsset.objects.create(
        owner_type=FileAsset.OwnerType.USER_PROFILE,
        owner_id=user.id,
        asset_type=FileAsset.AssetType.PROFILE_PHOTO,
        container_name="profiles",
        blob_name=f"users/{user.id}/old.jpg",
        original_file_name="old.jpg",
        extension="jpg",
        mime_type="image/jpeg",
        status=FileAsset.Status.ACTIVE,
    )
    UserProfile.objects.create(user=user, photo_asset=old_asset)
    monkeypatch.setattr(
        "modules.identity.api.views.upload_blob", lambda **kwargs: ("etag", "version")
    )
    monkeypatch.setattr(
        "modules.identity.api.views.read_url", lambda asset: f"https://photos.test/{asset.id}"
    )
    photo = SimpleUploadedFile("avatar.jpg", b"\xff\xd8\xff\xe0avatar", content_type="image/jpeg")

    response = api_client.post(
        "/api/v1/identity/account/photo", {"file": photo}, format="multipart"
    )
    assert response.status_code == 200
    asset_id = UserProfile.objects.get(user=user).photo_asset_id
    asset = FileAsset.objects.get(id=asset_id)
    assert asset.owner_type == FileAsset.OwnerType.USER_PROFILE
    assert asset.owner_id == user.id
    assert asset.institute_id is None
    old_asset.refresh_from_db()
    assert old_asset.status == FileAsset.Status.SOFT_DELETED
    assert old_asset.retention_record.delete_reason == "REPLACED"
