from django.db.models import Q
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import BasePermission

from modules.academics.models import ClassSection, ResultExamSubject, SubjectTeacherAssignment
from modules.identity.services import resolve_session_context
from modules.institutes.api.permissions import _attach_context, _record_api_action
from modules.institutes.models import InstituteMembership


class ResultsPermission(BasePermission):
    def has_permission(self, request, view):
        token = request.auth
        if not token or not token.get("membership_id"):
            return False
        context = resolve_session_context(
            user=request.user, client=token.get("client"), membership_id=token["membership_id"]
        )
        if not context or context.membership.role not in {
            "INSTITUTE_ADMIN",
            "BRANCH_ADMIN",
            "TEACHER",
        }:
            return False
        if context.membership.institute.onboarding_status in {"pending_review", "declined"}:
            return False
        _attach_context(request, context.membership)
        _record_api_action(request, context.membership)
        return True


def is_teacher(request):
    return request.institute_membership.role == InstituteMembership.Role.TEACHER


def require_admin(request):
    if is_teacher(request):
        raise PermissionDenied("An administrator must approve, configure, or issue results.")


def sections_for(request):
    sections = ClassSection.objects.filter(branch__institute=request.institute)
    membership = request.institute_membership
    if membership.branch_id:
        sections = sections.filter(branch_id=membership.branch_id)
    if is_teacher(request):
        sections = sections.filter(
            Q(class_teacher=request.user) | Q(subject_teacher_assignments__teacher=request.user)
        ).distinct()
    return sections


def subjects_for(request, exam):
    qs = ResultExamSubject.objects.filter(exam=exam)
    if is_teacher(request):
        assigned = SubjectTeacherAssignment.objects.filter(
            class_section=exam.section, teacher=request.user
        ).values("subject_id")
        qs = qs.filter(subject_id__in=assigned)
    return qs
