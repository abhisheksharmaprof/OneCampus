from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from modules.access_control.api.permissions import IsActiveInstituteWebSession
from modules.access_control.exam_scopes import action_scope
from modules.institutes.models import Branch, InstituteMembership
from platform_core.api.audit import audit_mutation
from platform_core.api.pagination import AdminPageNumberPagination

from ..exam_services import (
    can_edit_exam_schedule,
    create_exam,
    duplicate_exam,
    effective_exam_actions,
    exam_coverage,
    exam_elective_candidates,
    exam_schedule,
    exam_subject_setup,
    exam_timetable,
    has_scope,
    publish_complete_exam,
    publish_exam,
    publish_exam_timetable,
    timetable_is_published,
    update_exam,
    update_exam_elective_candidates,
    update_exam_schedule,
    update_exam_subject_setup,
    visible_exams,
)
from ..models import AcademicTerm, AcademicYear, ClassSection, Exam, ExamPublicationSnapshot, Room, StudentEnrollment
from modules.people.models import Student
from modules.documents.id_cards import asset_read_url
from modules.file_storage.models import FileAsset
from modules.file_storage.services import FileStorageError
from modules.file_storage.storage.base import StorageError
from .exam_serializers import (
    ExamCreateSerializer,
    ExamDuplicateSerializer,
    ExamElectiveAssignmentsSerializer,
    ExamPublishSerializer,
    ExamScheduleSerializer,
    ExamSerializer,
    ExamSubjectSetupSerializer,
    ExamTimetablePublishSerializer,
    ExamUpdateSerializer,
    exam_receipt_data,
)


def _success(data, response_status=status.HTTP_200_OK):
    return Response({"success": True, "data": data}, status=response_status)


def _detail_or_404(*, request, exam_id):
    try:
        exam = (
            Exam.objects.select_related("branch", "academic_year", "term", "coordinator")
            .prefetch_related("targets")
            .get(id=exam_id, institute=request.institute)
        )
    except Exam.DoesNotExist as exc:
        raise NotFound() from exc
    section_ids = [target.class_section_id for target in exam.targets.all()]
    aggregate = action_scope(request.user, "assessment.view", institute_id=request.institute.id)
    if not aggregate.get("allowed"):
        raise PermissionDenied(
            "The required exam permission is not available.", code="permission_required"
        )
    if not has_scope(
        request.user, "assessment.view", request.institute.id, exam.branch_id, section_ids
    ):
        raise NotFound()
    return exam


def _detail_data(exam, request):
    data = dict(ExamSerializer(exam).data)
    section_ids = [target.class_section_id for target in exam.targets.all()]
    timetable_published = timetable_is_published(exam)
    data["actions"] = {
        "view": has_scope(
            request.user, "assessment.view", request.institute.id, exam.branch_id, section_ids
        ),
        "edit": exam.status == Exam.Status.DRAFT
        and not timetable_published
        and has_scope(
            request.user, "assessment.edit", request.institute.id, exam.branch_id, section_ids
        ),
        "schedule": can_edit_exam_schedule(
            actor=request.user,
            institute=request.institute,
            exam=exam,
            target_section_ids=section_ids,
        ),
        "publish": not timetable_published
        and has_scope(
            request.user, "assessment.publish", request.institute.id, exam.branch_id, section_ids
        )
        and exam.status == Exam.Status.DRAFT,
        "duplicate": action_scope(
            request.user, "assessment.create", institute_id=request.institute.id
        ).get("allowed", False),
        "timetablePublish": has_scope(
            request.user,
            "assessment.timetable.publish",
            request.institute.id,
            exam.branch_id,
            section_ids,
        )
        and not timetable_published,
    }
    return data


def _row_data(exam, request):
    targets = list(exam.targets.all())
    section_ids = [target.class_section_id for target in targets]
    timetable_published = timetable_is_published(exam)
    return {
        "id": str(exam.id),
        "name": exam.name,
        "category": exam.category,
        "status": exam.status,
        "targetCount": len(section_ids),
        "targetSummary": [
            f"{target.class_section.grade.name} {target.class_section.section_name}"
            for target in targets
        ],
        "startsOn": exam.starts_on,
        "endsOn": exam.ends_on,
        "revision": exam.revision,
        "timetablePublished": timetable_published,
        "actions": {
            "view": True,
            "edit": exam.status == Exam.Status.DRAFT
            and not timetable_published
            and has_scope(
                request.user, "assessment.edit", request.institute.id, exam.branch_id, section_ids
            ),
            "schedule": can_edit_exam_schedule(
                actor=request.user,
                institute=request.institute,
                exam=exam,
                target_section_ids=section_ids,
            ),
            "publish": not timetable_published
            and has_scope(
                request.user,
                "assessment.publish",
                request.institute.id,
                exam.branch_id,
                section_ids,
            )
            and exam.status == Exam.Status.DRAFT,
            "timetablePublish": not timetable_published
            and has_scope(
                request.user,
                "assessment.timetable.publish",
                request.institute.id,
                exam.branch_id,
                section_ids,
            ),
            "duplicate": action_scope(
                request.user, "assessment.create", institute_id=request.institute.id
            ).get("allowed", False),
        },
    }


class ExamOptionsView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def get(self, request):
        kind = request.query_params.get("kind", "bootstrap")
        if kind not in {"bootstrap", "sections", "terms", "coordinators"}:
            raise ValidationError({"kind": ["Unsupported exam options kind."]})
        action = request.query_params.get("action", "create")
        action_key = action if action.startswith("assessment.") else f"assessment.{action}"
        if action_key not in {"assessment.create", "assessment.view", "assessment.edit"}:
            raise ValidationError({"action": ["Unsupported exam action."]})
        branch_id = request.query_params.get("campusId")
        year_id = request.query_params.get("academicYearId")
        search = request.query_params.get("search", "").strip()
        if len(search) > 100:
            raise ValidationError({"search": ["Search must be 100 characters or fewer."]})
        branches = Branch.objects.filter(institute=request.institute, is_active=True)
        if request.institute_membership.branch_id:
            branches = branches.filter(id=request.institute_membership.branch_id)
        if branch_id:
            branches = branches.filter(id=branch_id)
        choice_actions = (
            ("assessment.view", "assessment.create") if kind == "bootstrap" else (action_key,)
        )
        allowed_branches = []
        for branch in branches:
            section_query = ClassSection.objects.filter(branch=branch)
            if year_id:
                section_query = section_query.filter(academic_year_id=year_id)
            ids = list(section_query.values_list("id", flat=True))
            if any(
                has_scope(
                    request.user, candidate_action, request.institute.id, branch.id, [section_id]
                )
                for candidate_action in choice_actions
                for section_id in ids
            ):
                allowed_branches.append(branch)
        if (
            branch_id
            and not Branch.objects.filter(
                id=branch_id, institute=request.institute, is_active=True
            ).exists()
        ):
            raise NotFound()

        if kind == "sections":
            sections = ClassSection.objects.filter(branch__in=allowed_branches)
            if year_id:
                sections = sections.filter(academic_year_id=year_id)
            if search:
                sections = sections.filter(
                    Q(section_name__icontains=search) | Q(grade__name__icontains=search)
                )
            permitted = [
                item
                for item in sections.select_related("branch", "grade", "academic_year")
                if has_scope(
                    request.user, action_key, request.institute.id, item.branch_id, [item.id]
                )
            ]
            paginator = _OptionsPaginator()
            page = paginator.paginate_queryset(permitted, request)
            return _success(paginator.get_page_data(_SectionOptionSerializer(page, many=True).data))

        if kind == "terms":
            if not year_id:
                raise ValidationError({"academicYearId": ["Select an academic year."]})
            year = get_object_or_404(AcademicYear, id=year_id, institute=request.institute)
            branches_with_year = [
                branch
                for branch in allowed_branches
                if ClassSection.objects.filter(branch=branch, academic_year=year).exists()
            ]
            if not branches_with_year:
                return _success({"items": []})
            terms = AcademicTerm.objects.filter(academic_year=year).order_by(
                "sort_order", "start_date", "name"
            )
            return _success(
                {
                    "items": [
                        {
                            "id": str(term.id),
                            "name": term.name,
                            "startDate": term.start_date,
                            "endDate": term.end_date,
                        }
                        for term in terms
                    ]
                }
            )

        if kind == "coordinators":
            members = InstituteMembership.objects.filter(
                institute=request.institute, is_active=True, user__is_active=True
            )
            eligible_branches = [branch_id] if branch_id else [item.id for item in allowed_branches]
            members = (
                members.filter(Q(branch_id__in=eligible_branches) | Q(branch__isnull=True))
                .select_related("user")
                .distinct()
            )
            if search:
                members = members.filter(
                    Q(user__first_name__icontains=search)
                    | Q(user__last_name__icontains=search)
                    | Q(user__email__icontains=search)
                )
            return _success(
                {
                    "items": [
                        {
                            "id": str(item.user_id),
                            "name": item.user.get_full_name() or item.user.email,
                        }
                        for item in members[:100]
                        if item.user_id
                    ]
                }
            )

        years = (
            AcademicYear.objects.filter(
                institute=request.institute, class_sections__branch__in=allowed_branches
            )
            .distinct()
            .order_by("-start_date")
        )
        action_scopes = effective_exam_actions(actor=request.user, institute=request.institute)
        return _success(
            {
                "campuses": [
                    {"id": str(branch.id), "name": branch.name} for branch in allowed_branches
                ],
                "academicYears": [
                    {
                        "id": str(year.id),
                        "name": year.name,
                        "startDate": year.start_date,
                        "endDate": year.end_date,
                        "isCurrent": year.is_current,
                    }
                    for year in years
                ],
                "categories": [
                    {"value": value, "label": label} for value, label in Exam.Category.choices
                ],
                "actions": {key: value["allowed"] for key, value in action_scopes.items()},
                "actionScopes": action_scopes,
                "currentAcademicYearId": years.filter(is_current=True)
                .values_list("id", flat=True)
                .first(),
                "pagination": {"pageSize": 100},
            }
        )


class ExamListCreateView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def get(self, request):
        aggregate = action_scope(request.user, "assessment.view", institute_id=request.institute.id)
        if not aggregate.get("allowed"):
            raise PermissionDenied(
                "The required exam permission is not available.", code="permission_required"
            )
        records = visible_exams(actor=request.user, institute=request.institute)
        campus_id = request.query_params.get("campusId")
        year_id = request.query_params.get("academicYearId")
        category = request.query_params.get("category")
        search = request.query_params.get("search", "").strip()
        if len(search) > 100:
            raise ValidationError({"search": ["Search must be 100 characters or fewer."]})
        if campus_id:
            records = [item for item in records if str(item.branch_id) == campus_id]
        if year_id:
            records = [item for item in records if str(item.academic_year_id) == year_id]
        if category:
            if category not in Exam.Category.values:
                raise ValidationError({"category": ["Unsupported exam category."]})
            records = [item for item in records if item.category == category]
        if search:
            records = [item for item in records if search.casefold() in item.name.casefold()]
        # Keep the established page metadata and `items` response contract.
        paginator = _ExamListPaginator()
        page = paginator.paginate_queryset(records, request)
        page_data = paginator.get_page_data([_row_data(item, request) for item in page])
        page_data["results"] = page_data.pop("items")
        return _success(page_data)

    def post(self, request):
        serializer = ExamCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        receipt, replayed = create_exam(
            actor=request.user, institute=request.institute, values=serializer.validated_data
        )
        if not replayed:
            _audit(request, "Created", receipt.exam)
        if replayed:
            return _success(exam_receipt_data(receipt), status.HTTP_200_OK)
        section_ids = (
            list(receipt.exam.targets.values_list("class_section_id", flat=True))
            if receipt.exam_id
            else []
        )
        if receipt.exam_id and has_scope(
            request.user,
            "assessment.view",
            request.institute.id,
            receipt.exam.branch_id,
            section_ids,
        ):
            return _success(_detail_data(receipt.exam, request), status.HTTP_201_CREATED)
        return _success(exam_receipt_data(receipt), status.HTTP_201_CREATED)


class ExamDetailView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def get(self, request, exam_id):
        return _success(_detail_data(_detail_or_404(request=request, exam_id=exam_id), request))

    def patch(self, request, exam_id):
        serializer = ExamUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exam = update_exam(
            actor=request.user,
            institute=request.institute,
            exam_id=exam_id,
            values=dict(serializer.validated_data),
        )
        _audit(request, "Updated", exam)
        return _success(_detail_data(exam, request))


class ExamPublishView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def post(self, request, exam_id):
        serializer = ExamPublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        exam, publication = publish_exam(
            actor=request.user,
            institute=request.institute,
            exam_id=exam_id,
            expected_revision=serializer.validated_data["expectedRevision"],
        )
        _audit(request, "Published", exam)
        data = _detail_data(exam, request)
        data["publicationSnapshot"] = {
            "id": str(publication.id),
            "revision": publication.revision,
            "publishedAt": publication.created_at,
            "publishedBy": publication.published_by_display_snapshot,
            "snapshot": publication.snapshot,
        }
        return _success(data)


class ExamSubjectSetupView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def get(self, request, exam_id):
        # Keep the established not-found behavior for exams outside view scope.
        _detail_or_404(request=request, exam_id=exam_id)
        return _success(
            exam_subject_setup(actor=request.user, institute=request.institute, exam_id=exam_id)
        )

    def put(self, request, exam_id):
        serializer = ExamSubjectSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = update_exam_subject_setup(
            actor=request.user,
            institute=request.institute,
            exam_id=exam_id,
            values=serializer.validated_data,
        )
        _audit(request, "Updated subject setup for", Exam.objects.get(id=exam_id))
        return _success(data)


class ExamScheduleView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def get(self, request, exam_id):
        return _success(
            exam_schedule(actor=request.user, institute=request.institute, exam_id=exam_id)
        )

    def put(self, request, exam_id):
        serializer = ExamScheduleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = update_exam_schedule(
            actor=request.user,
            institute=request.institute,
            exam_id=exam_id,
            values=serializer.validated_data,
        )
        _audit(request, "Updated paper schedule for", Exam.objects.get(id=exam_id))
        return _success(data)


class ExamTimetableView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def get(self, request, exam_id):
        return _success(
            exam_timetable(actor=request.user, institute=request.institute, exam_id=exam_id)
        )

    def post(self, request, exam_id):
        serializer = ExamTimetablePublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = publish_exam_timetable(
            actor=request.user,
            institute=request.institute,
            exam_id=exam_id,
            expected_revision=serializer.validated_data["expectedRevision"],
        )
        _audit(request, "timetable_published", Exam.objects.get(id=exam_id))
        return _success(data)


class ExamAdmitCardCandidatesView(APIView):
    """Resolve candidates from the published timetable's per-paper candidate snapshot."""
    permission_classes = (IsActiveInstituteWebSession,)

    def get(self, request, exam_id):
        exam = _detail_or_404(request=request, exam_id=exam_id)
        publication = ExamPublicationSnapshot.objects.filter(exam=exam).order_by("-revision").first()
        if not publication or not publication.snapshot.get("papers"):
            raise ValidationError({"exam": ["Publish the complete timetable before preparing admit cards."]})
        paper_rows = publication.snapshot["papers"]
        published_sections = {str(item["id"]): item for item in publication.snapshot.get("classSections", [])}
        candidate_papers = {}
        candidate_section = {}
        for paper in paper_rows:
            for student_id in paper.get("candidateStudentIds", []):
                candidate_papers.setdefault(str(student_id), []).append({
                    "subject": paper.get("paperLabel", "").split(" · ")[-1],
                    "date": paper.get("scheduledOn"),
                    "start": paper.get("startTime"),
                    "end": paper.get("endTime"),
                    "roomId": str(paper.get("roomId") or ""),
                })
                candidate_section.setdefault(str(student_id), str(paper.get("classSectionId", "")))
        room_ids = {str(paper.get("roomId")) for paper in paper_rows if paper.get("roomId")}
        room_names = {str(room.id): room.name for room in Room.objects.filter(
            institute=request.institute, branch_id=exam.branch_id, id__in=room_ids
        )}
        for papers in candidate_papers.values():
            for paper in papers:
                paper["room"] = room_names.get(paper.pop("roomId"), "")
        ids = list(candidate_papers)
        students_by_id = {str(item.id): item for item in Student.objects.filter(institute=request.institute, id__in=ids)}
        enrollments = StudentEnrollment.objects.filter(
            student_id__in=[item.id for item in students_by_id.values()], academic_year_id=exam.academic_year_id,
            class_section_id__in=[target.class_section_id for target in exam.targets.all()],
        ).select_related("class_section__grade")
        enrollment_by_pair = {(str(item.student_id), str(item.class_section_id)): item for item in enrollments}
        students = []
        for student_id in ids:
            student = students_by_id.get(student_id)
            section_id = candidate_section.get(student_id)
            enrollment = enrollment_by_pair.get((student_id, section_id))
            if not student:
                continue
            section = published_sections.get(section_id, {})
            class_label = (
                f"{section.get('grade', '')} {section.get('name', '')}".strip()
                if section else ""
            )
            students.append({
                "id": str(student.id), "name": student.full_name,
                "admissionNumber": student.admission_number, "rollNumber": enrollment.roll_number if enrollment else "",
                "className": class_label or (f"{enrollment.class_section.grade.name} {enrollment.class_section.section_name}" if enrollment else "Class unavailable"),
                "fatherName": student.father_name, "dateOfBirth": student.date_of_birth.isoformat() if student.date_of_birth else "",
                "subjects": sorted(candidate_papers.get(str(student.id), []), key=lambda row: (row["date"] or "", row["start"] or "")),
            })
        photos = FileAsset.objects.filter(
            institute=request.institute, owner_type=FileAsset.OwnerType.STUDENT,
            owner_id__in=[item["id"] for item in students],
            asset_type=FileAsset.AssetType.PROFILE_PHOTO, status=FileAsset.Status.ACTIVE,
        ).order_by("-created_at")
        photo_by_student = {}
        for asset in photos:
            photo_by_student.setdefault(str(asset.owner_id), asset)
        for item in students:
            asset = photo_by_student.get(item["id"])
            if asset:
                try:
                    item["photoUrl"] = asset_read_url(asset)
                except (FileStorageError, StorageError):
                    item["photoUrl"] = None
        return _success({"examId": str(exam.id), "revision": publication.revision, "examName": exam.name,
                         "academicYear": exam.academic_year.name, "students": students})


class ExamCompletePublishView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def post(self, request, exam_id):
        serializer = ExamTimetablePublishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = publish_complete_exam(
            actor=request.user, institute=request.institute, exam_id=exam_id,
            expected_revision=serializer.validated_data["expectedRevision"],
        )
        _audit(request, "timetable_published", Exam.objects.get(id=exam_id))
        return _success(data)


class ExamCoverageView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def get(self, request, exam_id):
        return _success(
            exam_coverage(actor=request.user, institute=request.institute, exam_id=exam_id)
        )


class ExamElectiveCandidatesView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def get(self, request, exam_id, class_section_id, subject_id):
        try:
            page = max(1, int(request.query_params.get("page", "1")))
            page_size = min(100, max(1, int(request.query_params.get("pageSize", "25"))))
        except (TypeError, ValueError) as exc:
            raise ValidationError(
                {"page": ["Page and pageSize must be positive integers."]}
            ) from exc
        search = request.query_params.get("search", "").strip()
        if len(search) > 100:
            raise ValidationError({"search": ["Search must be 100 characters or fewer."]})
        return _success(
            exam_elective_candidates(
                actor=request.user,
                institute=request.institute,
                exam_id=exam_id,
                class_section_id=class_section_id,
                subject_id=subject_id,
                search=search,
                page=page,
                page_size=page_size,
            )
        )

    def put(self, request, exam_id, class_section_id, subject_id):
        serializer = ExamElectiveAssignmentsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = update_exam_elective_candidates(
            actor=request.user,
            institute=request.institute,
            exam_id=exam_id,
            class_section_id=class_section_id,
            subject_id=subject_id,
            values=serializer.validated_data,
        )
        _audit(request, "Updated elective candidate assignments for", Exam.objects.get(id=exam_id))
        return _success(data)


class ExamDuplicateView(APIView):
    permission_classes = (IsActiveInstituteWebSession,)

    def post(self, request, exam_id):
        serializer = ExamDuplicateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        receipt, replayed = duplicate_exam(
            actor=request.user,
            institute=request.institute,
            source_id=exam_id,
            values=serializer.validated_data,
        )
        if not replayed:
            _audit(request, "Duplicated", receipt.exam)
        if replayed:
            return _success(exam_receipt_data(receipt), status.HTTP_200_OK)
        section_ids = (
            list(receipt.exam.targets.values_list("class_section_id", flat=True))
            if receipt.exam_id
            else []
        )
        if receipt.exam_id and has_scope(
            request.user,
            "assessment.view",
            request.institute.id,
            receipt.exam.branch_id,
            section_ids,
        ):
            return _success(_detail_data(receipt.exam, request), status.HTTP_201_CREATED)
        return _success(exam_receipt_data(receipt), status.HTTP_201_CREATED)


class _ExamListPaginator:
    page_size = 25
    max_page_size = 100

    def paginate_queryset(self, queryset, request):
        from platform_core.api.pagination import AdminPageNumberPagination

        self._paginator = AdminPageNumberPagination()
        return self._paginator.paginate_queryset(queryset, request)

    def get_page_data(self, items):
        return self._paginator.get_page_data(items)


class _OptionsPaginator(_ExamListPaginator):
    def paginate_queryset(self, queryset, request):
        self._paginator = AdminPageNumberPagination()
        self._paginator.page_size = 100
        self._paginator.max_page_size = 100
        return self._paginator.paginate_queryset(queryset, request)


class _SectionOptionSerializer:
    def __init__(self, instance, many=False, context=None):
        self.data = [self._item(item) for item in instance] if many else self._item(instance)

    @staticmethod
    def _item(section):
        return {
            "id": str(section.id),
            "campusId": str(section.branch_id),
            "campusName": section.branch.name,
            "academicYearId": str(section.academic_year_id),
            "academicYearName": section.academic_year.name,
            "classId": str(section.grade_id),
            "className": section.grade.name,
            "sectionName": section.section_name,
            "name": section.section_name,
        }


def _audit(request, verb, exam):
    try:
        audit_mutation(
            request=request,
            verb=verb,
            target_label=f"exam draft '{exam.name}'",
            target_type="exam",
            target_id=exam.id,
            extra_meta={"revision": exam.revision},
        )
    except Exception:
        # Draft commit is authoritative; optional audit telemetry cannot reverse it.
        return
