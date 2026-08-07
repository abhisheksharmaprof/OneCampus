import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from platform_core.models import TimeStampedModel


class Permission(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    permission_key = models.CharField(max_length=100, unique=True)
    module = models.CharField(max_length=50)
    description = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("module", "permission_key")
        indexes = [models.Index(fields=("module", "is_active"), name="ac_perm_module_active_idx")]

    def save(self, *args, **kwargs):
        self.permission_key = self.permission_key.strip().lower()
        self.module = self.module.strip().lower()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.permission_key


class Role(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    institute = models.ForeignKey(
        "institutes.Institute",
        on_delete=models.CASCADE,
        related_name="access_control_roles",
        null=True,
        blank=True,
    )
    branch = models.ForeignKey(
        "institutes.Branch",
        on_delete=models.CASCADE,
        related_name="access_control_roles",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True)
    is_system_role = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="created_access_control_roles",
        null=True,
        blank=True,
    )
    permissions = models.ManyToManyField(
        Permission, through="RolePermission", related_name="roles"
    )

    class Meta:
        ordering = ("name", "id")
        indexes = [
            models.Index(
                fields=("institute", "branch", "is_active"), name="ac_role_scope_active_idx"
            ),
            models.Index(fields=("is_system_role", "is_active"), name="ac_role_system_active_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(is_system_role=True, institute__isnull=True, branch__isnull=True)
                    | Q(is_system_role=False, institute__isnull=False)
                ),
                name="ac_role_valid_ownership",
            ),
            models.UniqueConstraint(
                fields=("name",),
                condition=Q(is_system_role=True),
                name="ac_unique_system_role_name",
            ),
            models.UniqueConstraint(
                fields=("institute", "name"),
                condition=Q(is_system_role=False, branch__isnull=True),
                name="ac_unique_institute_role_name",
            ),
            models.UniqueConstraint(
                fields=("institute", "branch", "name"),
                condition=Q(is_system_role=False, branch__isnull=False),
                name="ac_unique_branch_role_name",
            ),
        ]

    def clean(self):
        errors = {}
        if self.is_system_role and (self.institute_id or self.branch_id):
            errors["is_system_role"] = "System roles cannot belong to an institute or branch."
        if not self.is_system_role and not self.institute_id:
            errors["institute"] = "Custom roles must belong to an institute."
        if self.branch_id and self.institute_id and self.branch.institute_id != self.institute_id:
            errors["branch"] = "Branch must belong to the role's institute."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.name = self.name.strip()
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class RolePermission(models.Model):
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="permission_grants")
    permission = models.ForeignKey(
        Permission, on_delete=models.CASCADE, related_name="role_grants"
    )
    configuration = models.JSONField(default=dict, blank=True)
    granted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("permission__module", "permission__permission_key")
        constraints = [
            models.UniqueConstraint(
                fields=("role", "permission"), name="ac_unique_role_permission"
            )
        ]
        indexes = [models.Index(fields=("permission", "role"), name="ac_rp_permission_role_idx")]

    def __str__(self):
        return f"{self.role} · {self.permission}"


class UserRoleAssignment(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="access_control_assignments",
    )
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="user_assignments")
    institute = models.ForeignKey(
        "institutes.Institute",
        on_delete=models.CASCADE,
        related_name="access_control_assignments",
    )
    branch = models.ForeignKey(
        "institutes.Branch",
        on_delete=models.CASCADE,
        related_name="access_control_assignments",
        null=True,
        blank=True,
    )
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="assigned_access_control_roles",
        null=True,
        blank=True,
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="revoked_access_control_roles",
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ("-assigned_at", "id")
        indexes = [
            models.Index(
                fields=("user", "institute", "branch", "is_active"),
                name="ac_assignment_effective_idx",
            ),
            models.Index(
                fields=("institute", "role", "is_active"),
                name="ac_assignment_role_idx",
            ),
            models.Index(fields=("valid_until", "is_active"), name="ac_assignment_expiry_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("user", "role", "institute"),
                condition=Q(branch__isnull=True, is_active=True),
                name="ac_unique_active_institute_assignment",
            ),
            models.UniqueConstraint(
                fields=("user", "role", "institute", "branch"),
                condition=Q(branch__isnull=False, is_active=True),
                name="ac_unique_active_branch_assignment",
            ),
            models.CheckConstraint(
                condition=Q(valid_until__isnull=True)
                | Q(valid_from__isnull=True)
                | Q(valid_until__gt=models.F("valid_from")),
                name="ac_assignment_valid_window",
            ),
            models.CheckConstraint(
                condition=Q(is_active=True, revoked_at__isnull=True) | Q(is_active=False),
                name="ac_active_assignment_not_revoked",
            ),
        ]

    def clean(self):
        errors = {}
        if self.branch_id and self.branch.institute_id != self.institute_id:
            errors["branch"] = "Branch must belong to the assignment's institute."
        if self.role_id:
            if self.role.institute_id and self.role.institute_id != self.institute_id:
                errors["role"] = "Custom role must belong to the assignment's institute."
            if self.role.branch_id and self.role.branch_id != self.branch_id:
                errors["branch"] = "Branch-scoped role must be assigned in its own branch."
        if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
            errors["valid_until"] = "Expiry must be later than the validity start."
        if self.is_active and self.revoked_at:
            errors["revoked_at"] = "An active assignment cannot have a revocation timestamp."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.user} · {self.role} · {self.institute}"
