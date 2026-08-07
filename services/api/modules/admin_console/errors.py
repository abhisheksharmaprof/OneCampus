from rest_framework import status
from rest_framework.exceptions import APIException


class VersionConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "The record was changed by another request. Refresh it and try again."
    default_code = "VERSION_CONFLICT"


class ScreenHasDedicatedDomain(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This screen is backed by a dedicated domain API."
    default_code = "DEDICATED_SCREEN"
