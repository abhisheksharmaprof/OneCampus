class AccessControlError(Exception):
    """Base class for expected access-control domain failures."""


class AccessDenied(AccessControlError):
    pass


class InvalidOperation(AccessControlError):
    def __init__(self, message, *, field="nonFieldErrors"):
        super().__init__(message)
        self.field = field

