import uuid


class TraceIdMiddleware:
    """Attach a stable correlation id to every request and response."""

    header_name = "X-Trace-Id"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        supplied = request.headers.get(self.header_name, "").strip()
        try:
            request.trace_id = str(uuid.UUID(supplied)) if supplied else str(uuid.uuid4())
        except ValueError:
            request.trace_id = str(uuid.uuid4())
        response = self.get_response(request)
        response[self.header_name] = request.trace_id
        return response
