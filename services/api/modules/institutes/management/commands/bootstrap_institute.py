import os

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from modules.identity.models import User
from modules.institutes.models import Branch, Institute, InstituteMembership


class Command(BaseCommand):
    help = "Idempotently create an institute, head-office branch, and email/password admin."

    def add_arguments(self, parser):
        parser.add_argument("--institute-name", required=True)
        parser.add_argument("--institute-code", required=True)
        parser.add_argument("--branch-name", required=True)
        parser.add_argument("--branch-code", required=True)
        parser.add_argument("--admin-email", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        institute_code = options["institute_code"].strip().upper()
        branch_code = options["branch_code"].strip().upper()
        admin_email = User.objects.normalize_email(options["admin_email"]).lower()
        password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")

        institute, institute_created = Institute.objects.get_or_create(
            code=institute_code,
            defaults={"name": options["institute_name"].strip()},
        )
        if not institute_created and institute.name != options["institute_name"].strip():
            raise CommandError("Institute code already belongs to a different institute name.")

        branch, branch_created = Branch.objects.get_or_create(
            institute=institute,
            code=branch_code,
            defaults={
                "name": options["branch_name"].strip(),
                "is_head_office": not institute.branches.exists(),
            },
        )
        if not branch_created and branch.name != options["branch_name"].strip():
            raise CommandError("Branch code already belongs to a different branch name.")

        user = User.objects.filter(email=admin_email).first()
        user_created = user is None
        if user_created:
            if not password:
                raise CommandError("Set BOOTSTRAP_ADMIN_PASSWORD before creating the first admin.")
            try:
                validate_password(password)
            except ValidationError as exc:
                raise CommandError(
                    "Bootstrap admin password does not meet security requirements."
                ) from exc
            user = User.objects.create_user(email=admin_email, password=password)
        elif not user.is_active:
            raise CommandError("The requested admin identity exists but is inactive.")

        membership, membership_created = InstituteMembership.objects.get_or_create(
            user=user,
            institute=institute,
            branch=None,
            role=InstituteMembership.Role.INSTITUTE_ADMIN,
            defaults={"is_active": True},
        )
        if not membership.is_active:
            membership.is_active = True
            membership.save(update_fields=("is_active", "updated_at"))

        actions = {
            "institute": "created" if institute_created else "existing",
            "branch": "created" if branch_created else "existing",
            "user": "created" if user_created else "existing",
            "membership": "created" if membership_created else "existing",
        }
        self.stdout.write(
            self.style.SUCCESS(
                "Bootstrap complete: "
                + ", ".join(f"{key}={value}" for key, value in actions.items())
            )
        )
