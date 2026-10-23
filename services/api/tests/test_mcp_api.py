from datetime import date, timedelta
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from modules.academics.models import AcademicYear
from modules.finance.models import FeeInvoice, FeePayment
from modules.institutes.models import Branch, Institute
from modules.people.models import Student
from modules.mcp.views import _tool_result


@pytest.fixture
def mcp_client(settings):
    settings.MCP_API_KEY = "test-mcp-key"
    institute = Institute.objects.create(name="MCP Test School", code="MCPTEST")
    Branch.objects.create(institute=institute, name="Main", code="MAIN", is_head_office=True)
    AcademicYear.objects.create(institute=institute, name="2026-27", start_date="2026-04-01", end_date="2027-03-31", is_current=True)
    class ScopedClient(APIClient):
        def post(self, path, *args, **kwargs):
            kwargs.setdefault("QUERY_STRING", f"institute_id={institute.id}")
            return super().post(path, *args, **kwargs)

    client = ScopedClient()
    client.credentials(HTTP_X_API_KEY="test-mcp-key")
    return client, institute


@pytest.mark.django_db
def test_initialize_is_public_and_advertises_server():
    response = APIClient().post("/api/v1/mcp/", {"jsonrpc": "2.0", "id": 1, "method": "initialize"}, format="json")
    assert response.status_code == 200
    assert response.data["result"]["serverInfo"]["name"] == "campusone-mcp-server"


@pytest.mark.django_db
def test_tools_list_and_call_return_institute_data(mcp_client):
    client, institute = mcp_client
    listed = client.post("/api/v1/mcp/", {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, format="json")
    assert listed.status_code == 200
    assert len(listed.data["result"]["tools"]) == 10
    called = client.post("/api/v1/mcp/", {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_school_overview", "arguments": {}}}, format="json")
    assert called.status_code == 200
    assert "error" not in called.data
    assert institute.name in called.data["result"]["content"][0]["text"]


@pytest.mark.django_db
def test_bad_method_and_missing_auth_use_jsonrpc_errors(mcp_client):
    client, _ = mcp_client
    bad = client.post("/api/v1/mcp/", {"jsonrpc": "2.0", "id": 4, "method": "not-a-method"}, format="json")
    assert bad.data["error"]["code"] == -32601
    unauthenticated = APIClient().post("/api/v1/mcp/", {"jsonrpc": "2.0", "id": 5, "method": "tools/list"}, format="json")
    assert unauthenticated.status_code == 401


@pytest.mark.django_db
def test_finance_summary_aggregates_paid_amounts_per_invoice(mcp_client):
    _, institute = mcp_client
    branch = Branch.objects.get(institute=institute)
    student = Student.objects.create(
        institute=institute, branch=branch, admission_number="MCP-001", first_name="Asha"
    )
    invoices = [
        FeeInvoice.objects.create(
            institute=institute, branch=branch, student=student,
            amount=total, total=total, status=status,
            due_date=date.today() + timedelta(days=10),
        )
        for total, status in ((Decimal("100.00"), "PARTIALLY_PAID"), (Decimal("50.00"), "ISSUED"), (Decimal("500.00"), "CANCELLED"))
    ]
    for invoice, amount in ((invoices[0], Decimal("25.00")), (invoices[2], Decimal("500.00"))):
        FeePayment.objects.create(institute=institute, invoice=invoice, amount=amount)

    result = _tool_result(institute, "get_finance_summary", {})

    assert result == {
        "collectedTotal": "525",
        "pendingDues": "125.00",
        "invoiceCount": 2,
        "openInvoiceCount": 2,
    }
