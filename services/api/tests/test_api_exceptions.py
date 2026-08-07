import uuid

from django.http import JsonResponse
from rest_framework.exceptions import NotFound, ValidationError

from platform_core.api.exceptions import api_exception_handler
from platform_core.middleware import TraceIdMiddleware


def test_unexpected_api_error_uses_safe_envelope_and_trace_id():
    response = api_exception_handler(RuntimeError("database password leaked"), {})

    assert response.status_code == 500
    assert response.data["success"] is False
    assert response.data["error"]["code"] == "INTERNAL_ERROR"
    assert response.data["error"]["message"] == "An unexpected error occurred."
    assert response.data["error"]["traceId"]
    assert "database password" not in str(response.data)


def test_validation_and_not_found_errors_include_request_trace_id(rf):
    trace_id = str(uuid.uuid4())
    request = rf.get("/api/v1/admin/students")
    request.trace_id = trace_id

    validation = api_exception_handler(ValidationError({"name": ["Required."]}), {"request": request})
    missing = api_exception_handler(NotFound(), {"request": request})

    assert validation.data["error"]["traceId"] == trace_id
    assert validation.data["error"]["fieldErrors"] == {"name": ["Required."]}
    assert missing.data["error"]["traceId"] == trace_id


def test_trace_middleware_preserves_valid_id_and_replaces_invalid_id(rf):
    middleware = TraceIdMiddleware(lambda request: JsonResponse({"traceId": request.trace_id}))
    valid_id = str(uuid.uuid4())
    valid_request = rf.get("/health", HTTP_X_TRACE_ID=valid_id)
    invalid_request = rf.get("/health", HTTP_X_TRACE_ID="not-a-uuid")

    valid_response = middleware(valid_request)
    invalid_response = middleware(invalid_request)

    assert valid_response["X-Trace-Id"] == valid_id
    assert invalid_response["X-Trace-Id"] != "not-a-uuid"
    uuid.UUID(invalid_response["X-Trace-Id"])
