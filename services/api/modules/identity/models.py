import hmac
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone
from django.utils.crypto import salted_hmac


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True or extra_fields.get("is_superuser") is not True:
            raise ValueError("A superuser must have is_staff=True and is_superuser=True")
        return self._create_user(email, password, **extra_fields)


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    user_type = models.CharField(max_length=40, blank=True)
    otp_required = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []
    objects = UserManager()

    class Meta:
        db_table = "users"
        ordering = ("email",)
        constraints = [
            models.UniqueConstraint(Lower("email"), name="uq_user_email_ci"),
        ]

    def __str__(self):
        return self.email


class UserProfile(models.Model):
    """User-owned account details; institute-managed HR data stays on StaffProfile."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="account_profile"
    )
    photo_asset = models.ForeignKey(
        "file_storage.FileAsset", null=True, blank=True, on_delete=models.SET_NULL
    )
    alternate_email = models.EmailField(blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=32, blank=True)
    blood_group = models.CharField(max_length=12, blank=True)
    marital_status = models.CharField(max_length=32, blank=True)
    father_name = models.CharField(max_length=160, blank=True)
    mother_name = models.CharField(max_length=160, blank=True)
    current_address = models.TextField(blank=True)
    permanent_address = models.TextField(blank=True)
    qualification = models.CharField(max_length=160, blank=True)
    experience_years = models.PositiveSmallIntegerField(null=True, blank=True)
    previous_workplace = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class OtpChallenge(models.Model):
    CODE_LENGTH = 6
    LIFETIME = timedelta(minutes=5)
    DEFAULT_MAX_ATTEMPTS = 5

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otp_challenges")
    code_hash = models.CharField(max_length=64)
    client = models.CharField(max_length=20)
    institute_id = models.UUIDField(null=True, blank=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    max_attempts = models.PositiveSmallIntegerField(default=DEFAULT_MAX_ATTEMPTS)
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("user", "created_at"), name="identity_ot_user_id_786868_idx")
        ]

    @classmethod
    def issue(cls, *, user, client, institute_id=None):
        code = f"{secrets.randbelow(10**cls.CODE_LENGTH):0{cls.CODE_LENGTH}d}"
        challenge = cls(
            user=user,
            client=client,
            institute_id=institute_id,
            expires_at=timezone.now() + cls.LIFETIME,
        )
        # Save first so self.id is populated before hashing.
        challenge.code_hash = ""  # placeholder; will be overwritten after save
        challenge.save()
        challenge.code_hash = challenge.hash_code(code)
        challenge.save(update_fields=("code_hash",))
        return challenge, code

    def hash_code(self, code):
        if self.id is None:
            raise ValueError("Cannot hash OTP before the challenge is saved (id is None).")
        return salted_hmac(
            "identity.otp-challenge",
            f"{self.id}:{code}",
            algorithm="sha256",
        ).hexdigest()

    def code_matches(self, code):
        return hmac.compare_digest(self.code_hash, self.hash_code(code))

    @property
    def is_expired(self):
        return self.expires_at <= timezone.now()

    @property
    def attempts_exhausted(self):
        return self.attempts >= self.max_attempts

    def clean(self):
        if self.max_attempts < 1:
            raise ValidationError({"max_attempts": "At least one attempt must be allowed."})
