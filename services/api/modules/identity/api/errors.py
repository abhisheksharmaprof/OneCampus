from rest_framework.exceptions import APIException


class SessionContextInactive(APIException):
    status_code = 403
    default_detail = "This session no longer has access to an active institute."
    default_code = "SESSION_CONTEXT_INACTIVE"
