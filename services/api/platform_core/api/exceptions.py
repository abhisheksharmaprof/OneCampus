import logging
import uuid

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    request = context.get("request")
    trace_id = getattr(request, "trace_id", None) or str(uuid.uuid4())
    response = exception_handler(exc, context)
    if response is None:
        # Use exc_info=True (standard logging) instead of leaking the raw
        # traceback object, which can include sensitive data in production.
        logger.error(
            "Unhandled API exception",
            exc_info=True,
            extra={"trace_id": trace_id},
        )
        return Response(
            {
                "success": False,
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred.",
                    "traceId": trace_id,
                },
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if response.status_code == status.HTTP_400_BAD_REQUEST:
        return Response(
            {
                "success": False,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Please correct the highlighted fields.",
                    "fieldErrors": _sanitize_validation_errors(response.data),
                    "traceId": trace_id,
                },
            },
            status=response.status_code,
        )

    # DRF puts the exception detail in response.data["detail"] as a string
    # (e.g. "Authentication credentials were not provided.").  Previous code
    # tried getattr(detail, "code") on a string, which always returned None.
    error_code = "REQUEST_FAILED"
    if isinstance(response.data, dict):
        detail = response.data.get("detail")
        # some DRF exceptions wrap detail in an ErrorDetail with a .code attr
        if hasattr(detail, "code"):
            error_code = detail.code
        elif isinstance(detail, str):
            error_code = _map_drf_status_to_code(response.status_code)
        message = str(detail) if detail else "The request could not be completed."
    else:
        message = str(response.data) if response.data else "The request could not be completed."

    return Response(
        {
            "success": False,
            "error": {
                "code": error_code,
                "message": message,
                "traceId": trace_id,
            },
        },
        status=response.status_code,
    )


def _map_drf_status_to_code(status_code):
    mapping = {
        status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
        status.HTTP_403_FORBIDDEN: "FORBIDDEN",
        status.HTTP_404_NOT_FOUND: "NOT_FOUND",
        status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
        status.HTTP_406_NOT_ACCEPTABLE: "NOT_ACCEPTABLE",
        status.HTTP_409_CONFLICT: "CONFLICT",
        status.HTTP_410_GONE: "GONE",
        status.HTTP_429_TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
    }
    return mapping.get(status_code, "REQUEST_FAILED")


def _sanitize_validation_errors(data):
    """Recursively strip internal DRF error codes from validation responses,
    keeping only user-facing messages and field-level maps."""
    if isinstance(data, dict):
        return {key: _sanitize_validation_errors(value) for key, value in data.items()}
    if isinstance(data, list):
        return [str(item) for item in data]
    return str(data)
