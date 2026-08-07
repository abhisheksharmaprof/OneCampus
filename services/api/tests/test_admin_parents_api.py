import pytest

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership
from modules.people.models import ParentProfile, Student


@pytest.mark.django_db
def test_admin_can_link_parent_to_student_without_cross_tenant_access(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main", code="MAIN", is_head_office=True
    )
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    other_branch = Branch.objects.create(
        institute=other, name="Other", code="OTHER-MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    student = Student.objects.create(
        institute=institute, branch=branch, admission_number="NSA-1", first_name="Diya"
    )
    foreign_student = Student.objects.create(
        institute=other, branch=other_branch, admission_number="OTH-1", first_name="Hidden"
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")

    created = api_client.post(
        "/api/v1/admin/parents",
        {
            "fullName": "Anita Patel",
            "email": "anita@northstar.test",
            "phone": "9876543210",
            "studentId": str(student.id),
            "relationship": "MOTHER",
        },
        format="json",
    )
    foreign = api_client.post(
        "/api/v1/admin/parents",
        {
            "fullName": "Bad Link",
            "email": "bad@northstar.test",
            "phone": "9876543211",
            "studentId": str(foreign_student.id),
            "relationship": "GUARDIAN",
        },
        format="json",
    )

    assert created.status_code == 201
    linked_child = created.json()["data"]["children"][0]
    assert linked_child["id"] == str(student.id)
    assert linked_child["name"] == "Diya"
    assert linked_child["relationship"] == "MOTHER"
    assert linked_child["isPrimaryContact"] is True
    assert foreign.status_code == 404


@pytest.mark.django_db
def test_admin_can_link_existing_parent_to_a_sibling(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    branch = Branch.objects.create(
        institute=institute, name="Main", code="MAIN", is_head_office=True
    )
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    parent_user = User.objects.create_user(
        email="anita@northstar.test", password=None, first_name="Anita"
    )
    InstituteMembership.objects.create(
        user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN
    )
    InstituteMembership.objects.create(
        user=parent_user, institute=institute, branch=branch, role=InstituteMembership.Role.PARENT
    )
    parent = ParentProfile.objects.create(institute=institute, user=parent_user)
    sibling = Student.objects.create(
        institute=institute, branch=branch, admission_number="NSA-2", first_name="Aarav"
    )
    login = api_client.post(
        "/api/v1/identity/sessions",
        {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"},
        format="json",
    )
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")

    response = api_client.post(
        f"/api/v1/admin/parents/{parent.id}/students",
        {"studentId": str(sibling.id), "relationship": "FATHER"},
        format="json",
    )

    assert response.status_code == 201
    linked_child = response.json()["data"]["children"][0]
    assert linked_child["id"] == str(sibling.id)
    assert linked_child["name"] == "Aarav"
    assert linked_child["relationship"] == "FATHER"


@pytest.mark.django_db
def test_parent_list_honors_branch_scope(api_client):
    institute = Institute.objects.create(name="Northstar Academy", code="NSA")
    main = Branch.objects.create(institute=institute, name="Main", code="MAIN", is_head_office=True)
    west = Branch.objects.create(institute=institute, name="West", code="WEST")
    other = Institute.objects.create(name="Other Academy", code="OTHER")
    foreign_branch = Branch.objects.create(institute=other, name="Other", code="OTHER-MAIN", is_head_office=True)
    admin = User.objects.create_user(email="admin@northstar.test", password="StrongPass123!")
    InstituteMembership.objects.create(user=admin, institute=institute, role=InstituteMembership.Role.INSTITUTE_ADMIN)
    main_student = Student.objects.create(institute=institute, branch=main, admission_number="NSA-1", first_name="Diya")
    west_student = Student.objects.create(institute=institute, branch=west, admission_number="NSA-2", first_name="Aarav")

    login = api_client.post("/api/v1/identity/sessions", {"email": admin.email, "password": "StrongPass123!", "client": "admin-web"}, format="json")
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.json()['data']['accessToken']}")
    for index, student in enumerate((main_student, west_student), start=1):
        created = api_client.post("/api/v1/admin/parents", {"fullName": f"Parent {index}", "email": f"parent{index}@northstar.test", "phone": f"987654321{index}", "studentId": str(student.id), "relationship": "GUARDIAN"}, format="json")
        assert created.status_code == 201

    scoped = api_client.get(f"/api/v1/admin/parents?branchId={main.id}")
    foreign = api_client.get(f"/api/v1/admin/parents?branchId={foreign_branch.id}")

    assert scoped.status_code == 200
    assert [item["fullName"] for item in scoped.json()["data"]["items"]] == ["Parent 1"]
    assert foreign.status_code == 404
