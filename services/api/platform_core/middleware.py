import logging
import time
import uuid

logger = logging.getLogger("api.request")


class TraceIdMiddleware:
    """Attach a correlation id and write one safe, structured entry per API call.

    The log deliberately contains request metadata only.  Request bodies,
    response bodies, query strings, cookies, and authorization headers can
    carry credentials or student information and must not be sent to logs.
    """

    header_name = "X-Trace-Id"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        started_at = time.perf_counter()
        supplied = request.headers.get(self.header_name, "").strip()
        try:
            request.trace_id = str(uuid.UUID(supplied)) if supplied else str(uuid.uuid4())
        except ValueError:
            request.trace_id = str(uuid.uuid4())

        try:
            response = self.get_response(request)
        except Exception:
            self._log_request(request, status_code=500, started_at=started_at)
            raise

        response[self.header_name] = request.trace_id
        self._log_request(request, response.status_code, started_at, response)
        return response

    @staticmethod
    def _log_request(request, status_code, started_at, response=None):
        """Record an API request in a cloud-ingestion-friendly JSON log line."""
        route = getattr(getattr(request, "resolver_match", None), "route", None)
        user = getattr(request, "user", None)
        user_id = str(user.pk) if getattr(user, "is_authenticated", False) else None
        # Client failures are useful operational signals; server failures are
        # errors and are also correlated with any exception traceback.
        log = (
            logger.error
            if status_code >= 500
            else logger.warning
            if status_code >= 400
            else logger.info
        )
        log(
            "api_request",
            extra={
                "event": "api_request",
                "trace_id": request.trace_id,
                "method": request.method,
                "path": request.path,
                "route": route,
                "status_code": status_code,
                "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
                "client_ip": request.META.get("REMOTE_ADDR"),
                "user_id": user_id,
                "response_bytes": response.get("Content-Length") if response else None,
            },
        )
