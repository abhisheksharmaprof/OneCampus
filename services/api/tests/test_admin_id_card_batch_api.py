import pytest

from modules.documents.models import DocumentTemplate, DocumentTemplateVersion
from modules.documents.presets import PRESET_ID_CARD
from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import Student


@pytest.fixture
def setup(api_client):
    institute = Institute.objects.create(name="Northstar", code="NS")
    branch = Branch.objects.create(institute=institute, name="North", code="N")
    other_branch = Branch.objects.create(institute=institute, name="South", code="S")
    user = User.objects.create_user(email="admin@north.test", password="StrongPass123!")
    membership = InstituteMembership.objects.create(
        institute=institute,
        user=user,
        role=InstituteMembership.Role.INSTITUTE_ADMIN,
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": user.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")
    template = DocumentTemplate.objects.create(
        institute=institute,
        name="Student card",
        category="ID_CARD",
        layout=PRESET_ID_CARD[0]["layout"],
    )
    student = Student.objects.create(
        institute=institute,
        branch=branch,
        admission_number="NS-01",
        first_name="Asha",
    )
    return institute, branch, other_branch, membership, template, student


@pytest.mark.django_db
def test_published_snapshots_survive_draft_edits(api_client, setup):
    institute, _, _, _, template, _ = setup
    path = f"/api/v1/admin/documents/templates/{template.id}/publish"
    original = api_client.post(path)
    assert original.status_code == 200
    first_id = original.json()["data"]["publishedVersion"]["id"]
    updated = {**template.layout, "page": {**template.layout["page"], "background": "#EEEEEE"}}
    template.layout = updated
    template.save(update_fields=["layout"])
    second = api_client.post(path)
    assert second.status_code == 200
    second_id = second.json()["data"]["publishedVersion"]["id"]
    assert (
        DocumentTemplateVersion.objects.get(id=first_id).layout["page"]["background"] == "#FFFFFF"
    )
    assert (
        DocumentTemplateVersion.objects.get(id=second_id).layout["page"]["background"] == "#EEEEEE"
    )
    assert DocumentTemplateVersion.objects.get(id=second_id).institute_id == institute.id
    assert api_client.delete(f"/api/v1/admin/documents/templates/{template.id}").status_code == 400


@pytest.mark.django_db
def test_preflight_is_all_or_nothing_and_scoped(api_client, setup):
    institute, branch, other_branch, membership, template, student = setup
    omitted = ("{{roll_no}}", "{{class_section}}", "{{academic_year}}", "{{school_address}}")
    layout = {
        **template.layout,
        "pages": [
            {
                "elements": [
                    element
                    for element in page["elements"]
                    if not (element["type"] == "image" and element.get("src") == "institute-logo")
                    and (
                        element["type"] != "text"
                        or not any(token in element.get("content", "") for token in omitted)
                    )
                ]
            }
            for page in template.layout["pages"]
        ],
    }
    template.layout = layout
    template.save(update_fields=["layout"])
    version_id = api_client.post(f"/api/v1/admin/documents/templates/{template.id}/publish").json()[
        "data"
    ]["publishedVersion"]["id"]
    path = "/api/v1/admin/documents/id-cards/preflight"
    body = {"templateVersionId": version_id, "studentIds": [str(student.id)]}
    missing_photo = api_client.post(path, body, format="json").json()["data"]
    assert not missing_photo["ready"]
    assert missing_photo["layout"] is None
    assert "tokens" not in missing_photo["students"][0]
    body["acceptMissingPhotos"] = True
    ready = api_client.post(path, body, format="json").json()["data"]
    assert ready["ready"]
    assert ready["students"][0]["tokens"]["student_id"] == "NS-01"
    assert ready["students"][0]["images"]["student-photo"] is None
    invalid = Student.objects.create(
        institute=institute, branch=other_branch, admission_number="NS-02", first_name="Other"
    )
    membership.branch = branch
    membership.role = InstituteMembership.Role.BRANCH_ADMIN
    membership.save(update_fields=["branch", "role"])
    mixed = api_client.post(
        path, {**body, "studentIds": [str(student.id), str(invalid.id)]}, format="json"
    ).json()["data"]
    assert not mixed["ready"]
    assert mixed["layout"] is None
    assert all("tokens" not in row for row in mixed["students"])
    assert mixed["students"][1]["issues"]
    duplicates = api_client.post(path, {**body, "studentIds": [str(student.id)] * 2}, format="json")
    assert duplicates.status_code == 400
    oversized = api_client.post(path, {**body, "studentIds": [str(student.id)] * 81}, format="json")
    assert oversized.status_code == 400
