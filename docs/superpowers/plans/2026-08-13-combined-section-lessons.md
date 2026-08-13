# Cross-Section Combined Lessons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a timetable lesson span multiple sections of the same grade (joint block), with optional parallel elective options (French/Spanish/German at the same period), per the spec at `docs/superpowers/specs/2026-08-13-combined-section-lessons-design.md`.

**Architecture:** Replace `SubjectTeacherAssignment.class_section` FK with a `class_sections` M2M plus a `combined_slot_label` text field; validation moves to a service function. The client-side solver groups labeled assignments sharing a section set into joint tasks that block every section/teacher/room at one slot; entries carry `classIds` (array) plus legacy `classId` (first element) for old readers.

**Tech Stack:** Django 5 / DRF (services/api, pytest), React + Vitest (apps/institute-admin-web).

**Working setup:** Implementation must NOT go on `feature/finance-suite-redesign`. Before Task 1: `git checkout master && git checkout -b feature/combined-section-lessons` (the spec doc commit `82b9871` can be cherry-picked: `git cherry-pick 82b9871`). Backend commands run from `services/api`; frontend commands from `apps/institute-admin-web`.

**Key naming (used consistently everywhere below):**
- Backend model field: `class_sections` (M2M), `combined_slot_label` (CharField).
- API JSON: `classSectionIds` (array, read+write), `classSections` (read-only detail array), `classSectionId` (legacy: first section on read; single-section write), `combinedSlotLabel`.
- Solver bundle assignment: `classIds` (array), `combinedSlotLabel`.
- Solver entry: `classIds` (array), `classId` (= `classIds[0]`, legacy), `slotGroupId` (string, only on entries from a labeled joint group, same value for all entries of one placed occurrence).

---

### Task 1: Backend model + migrations

**Files:**
- Modify: `services/api/modules/academics/models.py:292-335`
- Create: `services/api/modules/academics/migrations/0003_assignment_multi_section.py` (number = next free; check `ls services/api/modules/academics/migrations/`)
- Test: `services/api/tests/test_academics_models.py`

- [ ] **Step 1: Write failing model tests**

Append to `services/api/tests/test_academics_models.py` (reuse this file's existing fixtures/factories — read its imports first and construct `ClassSection`/`Subject`/teacher the same way neighbouring tests do):

```python
@pytest.mark.django_db
def test_assignment_supports_multiple_sections(section_factory, subject, teacher):
    # section_factory: use/adapt however existing tests build two ClassSections
    # for the SAME grade+branch+year with section_name "A" and "B".
    section_a = section_factory(section_name="A")
    section_b = section_factory(section_name="B")
    assignment = SubjectTeacherAssignment.objects.create(
        subject=subject, teacher=teacher, combined_slot_label="Second Language"
    )
    assignment.class_sections.set([section_a, section_b])
    assert assignment.class_sections.count() == 2
    assert assignment.combined_slot_label == "Second Language"


@pytest.mark.django_db
def test_assignment_label_defaults_blank(section_factory, subject, teacher):
    assignment = SubjectTeacherAssignment.objects.create(subject=subject, teacher=teacher)
    assignment.class_sections.set([section_factory(section_name="A")])
    assert assignment.combined_slot_label == ""
```

- [ ] **Step 2: Run tests, verify they fail**

Run (cwd `services/api`): `pytest tests/test_academics_models.py -k "multiple_sections or label_defaults" -v`
Expected: FAIL — `SubjectTeacherAssignment() got unexpected keyword` / no `class_sections` attribute.

- [ ] **Step 3: Change the model**

In `services/api/modules/academics/models.py`, replace the `SubjectTeacherAssignment` class body (lines 292-335) with:

```python
class SubjectTeacherAssignment(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    class_sections = models.ManyToManyField(
        ClassSection, related_name="subject_teacher_assignments", blank=True
    )
    subject = models.ForeignKey(
        Subject, on_delete=models.PROTECT, related_name="section_teacher_assignments"
    )
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="subject_teacher_assignments",
    )
    # Blank for ordinary lessons. Assignments sharing the same label AND the
    # same section set are parallel options forced onto one day+period.
    combined_slot_label = models.CharField(max_length=120, blank=True, default="")

    class Meta:
        db_table = "subject_teacher_assignments"
        ordering = ("subject__name",)
        indexes = [models.Index(fields=("teacher",))]

    def save(self, *args, **kwargs):
        self.combined_slot_label = self.combined_slot_label.strip()
        self.full_clean()
        return super().save(*args, **kwargs)
```

Notes: the old `clean()` (institute/teacher checks) and the `uq_section_subject_teacher` constraint are removed here — section-dependent validation cannot run in `clean()` for M2M (sections attach after save) and moves to the service in Task 2. Delete the old FK-based `Meta.indexes` entries.

- [ ] **Step 4: Generate + hand-edit migrations**

Run: `python manage.py makemigrations academics --name assignment_multi_section`

makemigrations will produce RemoveConstraint/RemoveField/AddField ops. Edit the generated file so data is preserved — final operations order (three phases in ONE file is fine since RunPython sits between schema ops):

```python
from django.db import migrations, models


def copy_sections_forward(apps, schema_editor):
    Assignment = apps.get_model("academics", "SubjectTeacherAssignment")
    Through = Assignment.class_sections.through
    rows = [
        Through(subjectteacherassignment_id=a_id, classsection_id=s_id)
        for a_id, s_id in Assignment.objects.values_list("id", "class_section_id")
        if s_id is not None
    ]
    Through.objects.bulk_create(rows, batch_size=500)


def copy_sections_backward(apps, schema_editor):
    Assignment = apps.get_model("academics", "SubjectTeacherAssignment")
    for assignment in Assignment.objects.prefetch_related("class_sections"):
        first = assignment.class_sections.first()
        assignment.class_section_id = first.id if first else None
        assignment.save(update_fields=["class_section"])


class Migration(migrations.Migration):
    dependencies = [("academics", "<previous_migration_name>")]
    operations = [
        migrations.AddField(
            model_name="subjectteacherassignment",
            name="class_sections",
            field=models.ManyToManyField(
                blank=True, related_name="subject_teacher_assignments",
                to="academics.classsection",
            ),
        ),
        migrations.AddField(
            model_name="subjectteacherassignment",
            name="combined_slot_label",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
        migrations.RunPython(copy_sections_forward, copy_sections_backward),
        migrations.RemoveConstraint(
            model_name="subjectteacherassignment", name="uq_section_subject_teacher",
        ),
        migrations.RemoveIndex(...),   # keep whatever makemigrations generated for the two old FK indexes
        migrations.RemoveField(model_name="subjectteacherassignment", name="class_section"),
        migrations.AddIndex(...),      # keep the generated teacher index op
    ]
```

CAUTION: the M2M `related_name="subject_teacher_assignments"` collides with the old FK's related_name, so `AddField` for the M2M MUST come after... it does not — Django never has both live simultaneously in DB, but the *model state* would clash. If `makemigrations` complains, temporarily rename the FK's `related_name` is NOT needed — the FK is already deleted from models.py in Step 3, so state is consistent; only the migration file orders DB ops.

- [ ] **Step 5: Migrate and run the new tests**

Run: `python manage.py migrate academics && pytest tests/test_academics_models.py -v`
Expected: new tests PASS. Some OLD tests in this file and `tests/test_academics_api.py` will now FAIL (they use `class_section=`) — that is expected; they are fixed in Tasks 2–3. Note the failing test names for later verification.

- [ ] **Step 6: Commit**

```bash
git add services/api/modules/academics/models.py services/api/modules/academics/migrations/ services/api/tests/test_academics_models.py
git commit -m "feat(academics): assignments target multiple sections with combined-slot label"
```

---

### Task 2: Backend validation service

**Files:**
- Modify: `services/api/modules/academics/services.py`
- Test: `services/api/tests/test_academics_models.py`

- [ ] **Step 1: Write failing tests** (same file as Task 1; imports: `from modules.academics.services import validate_assignment_sections`)

```python
@pytest.mark.django_db
def test_validate_rejects_cross_grade_sections(section_factory, other_grade_section, subject, teacher):
    # other_grade_section: a ClassSection under a DIFFERENT Grade, same branch/year.
    with pytest.raises(ValidationError) as exc:
        validate_assignment_sections(
            sections=[section_factory(section_name="A"), other_grade_section],
            subject=subject, teacher=teacher, combined_slot_label="", assignment_id=None,
        )
    assert "same class" in str(exc.value)


@pytest.mark.django_db
def test_validate_rejects_duplicate_subject_for_same_section_set(section_factory, subject, teacher):
    a, b = section_factory(section_name="A"), section_factory(section_name="B")
    existing = SubjectTeacherAssignment.objects.create(subject=subject, teacher=teacher)
    existing.class_sections.set([a, b])
    with pytest.raises(ValidationError) as exc:
        validate_assignment_sections(
            sections=[a, b], subject=subject, teacher=teacher,
            combined_slot_label="", assignment_id=None,
        )
    assert "already mapped" in str(exc.value)


@pytest.mark.django_db
def test_validate_allows_same_subject_for_different_section_set(section_factory, subject, teacher):
    a, b = section_factory(section_name="A"), section_factory(section_name="B")
    existing = SubjectTeacherAssignment.objects.create(subject=subject, teacher=teacher)
    existing.class_sections.set([a])
    validate_assignment_sections(  # must not raise
        sections=[b], subject=subject, teacher=teacher,
        combined_slot_label="", assignment_id=None,
    )
```

- [ ] **Step 2: Run, verify fail** — `pytest tests/test_academics_models.py -k validate -v` → ImportError.

- [ ] **Step 3: Implement in `services/api/modules/academics/services.py`** (append; match the file's existing import style):

```python
def validate_assignment_sections(*, sections, subject, teacher, combined_slot_label, assignment_id):
    """Set-level rules for SubjectTeacherAssignment that clean() can't express (M2M).

    Raises DRF/Django ValidationError with a field-keyed dict.
    """
    from django.core.exceptions import ValidationError

    if not sections:
        raise ValidationError({"classSectionIds": "Select at least one section."})
    grades = {s.grade_id for s in sections}
    branches = {s.branch_id for s in sections}
    years = {s.academic_year_id for s in sections}
    if len(grades) > 1 or len(branches) > 1 or len(years) > 1:
        raise ValidationError(
            {"classSectionIds": "All sections must belong to the same class, branch, and academic year."}
        )
    institute_id = sections[0].branch.institute_id
    if subject.institute_id != institute_id:
        raise ValidationError({"subjectId": "Subject must belong to the sections' institute."})
    from modules.academics.models import _validate_teacher
    _validate_teacher(
        teacher=teacher, institute_id=institute_id,
        branch_id=sections[0].branch_id, field_name="teacherId",
    )
    # One teacher per subject per exact section set ("already mapped" rule).
    from modules.academics.models import SubjectTeacherAssignment
    target = {s.id for s in sections}
    candidates = (
        SubjectTeacherAssignment.objects.filter(subject=subject, class_sections__in=list(target))
        .exclude(id=assignment_id)
        .prefetch_related("class_sections")
        .distinct()
    )
    for other in candidates:
        if {s.id for s in other.class_sections.all()} == target:
            raise ValidationError(
                {"subjectId": "This subject is already mapped for the selected sections."}
            )
```

- [ ] **Step 4: Run, verify pass** — `pytest tests/test_academics_models.py -k validate -v` → PASS.
- [ ] **Step 5: Commit** — `git add -A services/api && git commit -m "feat(academics): section-set validation service for assignments"`

---

### Task 3: Serializers + views (API contract)

**Files:**
- Modify: `services/api/modules/academics/api/serializers.py:302-331`
- Modify: `services/api/modules/academics/api/views.py:624-734`
- Test: `services/api/tests/test_academics_api.py`

- [ ] **Step 1: Write failing API tests** (append to `test_academics_api.py`, reusing its existing authed-client fixtures):

```python
@pytest.mark.django_db
def test_create_assignment_with_multiple_sections(admin_client, two_sections, subject, teacher):
    a, b = two_sections
    response = admin_client.post(
        "/api/v1/admin/academics/section-subject-teachers",
        {"classSectionIds": [str(a.id), str(b.id)], "subjectId": str(subject.id),
         "teacherId": str(teacher.id), "combinedSlotLabel": "Second Language"},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()["data"]
    assert sorted(body["classSectionIds"]) == sorted([str(a.id), str(b.id)])
    assert body["combinedSlotLabel"] == "Second Language"
    assert body["classSectionId"] in {str(a.id), str(b.id)}  # legacy field still present


@pytest.mark.django_db
def test_create_assignment_legacy_single_section_still_works(admin_client, two_sections, subject, teacher):
    a, _ = two_sections
    response = admin_client.post(
        "/api/v1/admin/academics/section-subject-teachers",
        {"classSectionId": str(a.id), "subjectId": str(subject.id), "teacherId": str(teacher.id)},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["data"]["classSectionIds"] == [str(a.id)]


@pytest.mark.django_db
def test_create_assignment_rejects_cross_grade(admin_client, two_sections, other_grade_section, subject, teacher):
    a, _ = two_sections
    response = admin_client.post(
        "/api/v1/admin/academics/section-subject-teachers",
        {"classSectionIds": [str(a.id), str(other_grade_section.id)],
         "subjectId": str(subject.id), "teacherId": str(teacher.id)},
        format="json",
    )
    assert response.status_code == 400
```

(Adjust URL prefix to match this file's existing assignment tests — copy it verbatim from a neighbouring test.)

- [ ] **Step 2: Run, verify fail** — `pytest tests/test_academics_api.py -k "assignment and (multiple or legacy_single or cross_grade)" -v`

- [ ] **Step 3: Rewrite the serializers** (replace lines 302-331):

```python
class SubjectTeacherAssignmentSerializer(serializers.ModelSerializer):
    classSectionIds = serializers.SerializerMethodField()
    classSections = serializers.SerializerMethodField()
    classSectionId = serializers.SerializerMethodField()      # legacy: first section
    classSectionLabel = serializers.SerializerMethodField()
    combinedSlotLabel = serializers.CharField(source="combined_slot_label", read_only=True)
    subject = SubjectSummarySerializer(read_only=True)
    teacher = UserSummarySerializer(read_only=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = SubjectTeacherAssignment
        fields = ("id", "classSectionIds", "classSections", "classSectionId",
                  "classSectionLabel", "combinedSlotLabel", "subject", "teacher",
                  "createdAt", "updatedAt")

    def _sections(self, obj):
        return sorted(obj.class_sections.all(), key=lambda s: s.section_name)

    def get_classSectionIds(self, obj):
        return [str(s.id) for s in self._sections(obj)]

    def get_classSections(self, obj):
        return [
            {"id": str(s.id), "label": f"{s.grade.name} {s.section_name}",
             "grade": s.grade.name, "sectionName": s.section_name}
            for s in self._sections(obj)
        ]

    def get_classSectionId(self, obj):
        sections = self._sections(obj)
        return str(sections[0].id) if sections else None

    def get_classSectionLabel(self, obj):
        sections = self._sections(obj)
        if not sections:
            return ""
        return f"{sections[0].grade.name} " + "/".join(s.section_name for s in sections)


class SubjectTeacherAssignmentWriteSerializer(StrictSerializer):
    classSectionIds = serializers.ListField(
        child=serializers.UUIDField(), required=False, allow_empty=False, max_length=30
    )
    classSectionId = serializers.UUIDField(required=False, allow_null=True)  # legacy
    classId = serializers.UUIDField(source="class_id", required=False)
    subjectId = serializers.UUIDField(source="subject_id")
    teacherId = serializers.UUIDField(source="teacher_id")
    combinedSlotLabel = serializers.CharField(
        source="combined_slot_label", required=False, allow_blank=True, max_length=120
    )
```

Query efficiency: everywhere the read serializer is used over a list, the view queryset must add `.prefetch_related("class_sections__grade")` (see Step 4).

- [ ] **Step 4: Rewrite the views** (`views.py:624-734`). Key changes:

`SubjectTeacherAssignmentListCreateView.get` — replace the queryset + filters:

```python
        assignments = (
            SubjectTeacherAssignment.objects.filter(
                class_sections__branch__institute=institute
            )
            .select_related("subject", "teacher")
            .prefetch_related("class_sections__grade")
            .distinct()
        )
        section_id = request.query_params.get("classSectionId")
        if section_id:
            get_object_or_404(_section_queryset(institute), id=section_id)
            assignments = assignments.filter(class_sections__id=section_id)
        student_id = request.query_params.get("studentId")
        if student_id:
            active_section_ids = StudentEnrollment.objects.filter(
                student_id=student_id, student__institute=institute, left_at__isnull=True
            ).values_list("class_section_id", flat=True)
            assignments = assignments.filter(class_sections__id__in=active_section_ids)
```

(`subjectId`/`teacherId` filters unchanged.)

`post` — resolve a section LIST, validate via the service, then create + `.set()`:

```python
    def post(self, request):
        institute = _institute(request)
        serializer = SubjectTeacherAssignmentWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        sections = []
        section_ids = data.get("classSectionIds") or (
            [data["classSectionId"]] if data.get("classSectionId") else []
        )
        if section_ids:
            sections = list(_section_queryset(institute).filter(id__in=section_ids))
            if len(sections) != len(set(section_ids)):
                raise ValidationError({"classSectionIds": "One or more sections were not found."})
        elif data.get("class_id"):
            # (keep the existing grade→auto-"Main"-section block verbatim, then:)
            sections = [section]
        if not sections:
            raise ValidationError({"classId": "Select a class."})
        subject = get_object_or_404(Subject, id=data["subject_id"], institute=institute)
        teacher = _teacher(institute=institute, branch=sections[0].branch, teacher_id=data["teacher_id"])
        validate_assignment_sections(
            sections=sections, subject=subject, teacher=teacher,
            combined_slot_label=data.get("combined_slot_label", ""), assignment_id=None,
        )
        assignment = SubjectTeacherAssignment(
            subject=subject, teacher=teacher,
            combined_slot_label=data.get("combined_slot_label", ""),
        )
        _save(assignment)
        assignment.class_sections.set(sections)
        return _success(SubjectTeacherAssignmentSerializer(assignment).data, status.HTTP_201_CREATED)
```

`SubjectTeacherAssignmentDetailView` — `get_object` filter becomes `class_sections__branch__institute=...` with `.prefetch_related("class_sections__grade").distinct()`; `patch` resolves `classSectionIds`/`classSectionId` the same way, calls `validate_assignment_sections(..., assignment_id=assignment.id)` before saving, applies `combined_slot_label` when present, and calls `assignment.class_sections.set(sections)` after `_save` when sections were provided. Teacher re-validation uses `assignment.class_sections.first().branch`.

Add imports: `from modules.academics.services import validate_assignment_sections`.

Also update `views.py:747` mapping: `"branchId": "class_sections__branch_id"` (this is the audit/filter map that referenced `class_section__branch_id` — check the surrounding dict at 737-760 and update every `class_section__` prefix to `class_sections__`).

- [ ] **Step 5: Fix other backend callers of the old FK** (all found by `rg -n "class_section[^s]" services/api --glob '!*/migrations/*'` — rerun this grep and fix every SubjectTeacherAssignment-related hit; StudentEnrollment/ClassSection hits are unrelated, leave them):
  - `services/api/modules/people/api/staff.py:453-474` and `:703-725`: filter becomes `class_sections__branch__institute=institute` (+ `.distinct()`, `.prefetch_related("class_sections__grade", "class_sections__branch")`, drop the old `select_related` of class_section); the per-assignment dict becomes (both sites, same shape):

```python
        for assignment in assignments:
            sections = sorted(assignment.class_sections.all(), key=lambda s: s.section_name)
            if not sections:
                continue
            grade = sections[0].grade
            assignment_map[str(assignment.teacher_id)].append(
                {
                    "id": str(assignment.id),
                    "classSectionId": str(sections[0].id),
                    "classSectionIds": [str(s.id) for s in sections],
                    "sectionLabel": f"{grade.name} " + "/".join(s.section_name for s in sections),
                    "subjectId": str(assignment.subject_id),
                    "subjectName": assignment.subject.name,
                    "periodsPerWeek": int(class_subject_periods.get(
                        (str(grade.id), str(assignment.subject_id)), 0) or 0),
                }
            )
```

  (Site :453 also has a `branch_id` filter → `class_sections__branch_id=branch_id`.)
  - `services/api/modules/institutes/management/commands/seed_test_institute.py:371-390`: build assignments without `class_section=`, then set M2M — replace the bulk_create block with a loop: create each `SubjectTeacherAssignment(subject=..., teacher=...)` guarded by an existence check `SubjectTeacherAssignment.objects.filter(class_sections=section, subject=subjects[subject_name]).exists()`, then `.class_sections.add(section)`.
  - `seed_realistic_institutes.py:314-317`: `get_or_create(class_section=section, ...)` → look up `filter(class_sections=section, subject=subject).first()`; if none, create then `.class_sections.add(section)`.

- [ ] **Step 6: Fix the pre-existing tests that broke in Task 1.** Update every `SubjectTeacherAssignment(class_section=...)`/`objects.create(class_section=...)` in `tests/` to create-then-`.class_sections.set([section])`. Find them: `rg -n "class_section=" services/api/tests`.

- [ ] **Step 7: Run the full backend suite** — `pytest tests/test_academics_api.py tests/test_academics_models.py tests/test_admin_staff_api.py -v` → all PASS, then `pytest` (whole suite) → no new failures vs. the pre-branch baseline.

- [ ] **Step 8: Commit** — `git commit -am "feat(academics): multi-section assignment API with combined-slot label"`

---

### Task 4: Frontend API layer + Teacher Mapping UI

**Files:**
- Modify: `apps/institute-admin-web/src/features/academics/academics.api.ts:81-93`
- Modify: `apps/institute-admin-web/src/features/academics/academics.types.ts` (find the `SubjectTeacherAssignment` type: `rg -n "SubjectTeacherAssignment" src/features/academics/academics.types.ts`)
- Modify: `apps/institute-admin-web/src/features/academics/AcademicStructurePage.tsx:306-348` (TeacherMapping)

- [ ] **Step 1: Update types + api.** In `academics.types.ts` add to the `SubjectTeacherAssignment` type: `classSectionIds: string[]`, `classSections?: Array<{ id: string; label: string; grade: string; sectionName: string }>`, `combinedSlotLabel?: string` (keep `classSectionId`/`classSectionLabel`). In `academics.api.ts`:

```ts
export function createSubjectTeacherAssignment(accessToken: string, input: { classSectionIds?: string[]; classSectionId?: string; classId?: string; subjectId: string; teacherId: string; combinedSlotLabel?: string }) {
  return adminRequest<SubjectTeacherAssignment>(accessToken, 'academics/section-subject-teachers', { method: 'POST', body: JSON.stringify(input) })
}
```

Mirror the same input type on `updateSubjectTeacherAssignment`.

- [ ] **Step 2: Rework `TeacherMapping`** (AcademicStructurePage.tsx:306-348). State change: `sectionId: string` → `sectionIds: string[]`, add `combinedSlot: string`. Replace the single-section `<select>` with a checkbox group + "All sections", and show the combined-slot input when 2+ sections are picked:

```tsx
  const [sectionIds, setSectionIds] = useState<string[]>([])
  const [combinedSlot, setCombinedSlot] = useState('')
  const classSections = sections.filter((section) => section.grade.id === classId)
  const allSelected = classSections.length > 0 && sectionIds.length === classSections.length
  const toggleSection = (id: string) => setSectionIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  const toggleAll = () => setSectionIds(allSelected ? [] : classSections.map((section) => section.id))
```

In the toolbar JSX, replace the section `<select>` block with:

```tsx
{classSections.length > 0 && <fieldset className="section-multiselect" aria-label="Mapping sections"><legend>Sections</legend>
  <label><input type="checkbox" checked={allSelected} onChange={toggleAll} /> All sections</label>
  {classSections.map((section) => <label key={section.id}><input type="checkbox" checked={sectionIds.includes(section.id)} onChange={() => toggleSection(section.id)} /> {section.sectionName}</label>)}
</fieldset>}
{sectionIds.length > 1 && <input aria-label="Combined slot label" placeholder="Combined slot (optional, e.g. Second Language)" value={combinedSlot} onChange={(event) => setCombinedSlot(event.target.value)} maxLength={120} />}
```

`save()` becomes:

```tsx
  const save = async () => {
    if (!classId || !subjectId || !teacherId || (classSections.length > 0 && sectionIds.length === 0)) { setError(classSections.length ? 'Select a class, at least one section, a subject, and a teacher.' : 'Select a class, subject, and teacher.'); return }
    setBusy(true); setError('')
    try {
      await createSubjectTeacherAssignment(accessToken, sectionIds.length
        ? { classSectionIds: sectionIds, subjectId, teacherId, ...(sectionIds.length > 1 && combinedSlot.trim() ? { combinedSlotLabel: combinedSlot.trim() } : {}) }
        : { classId, subjectId, teacherId })
      setClassId(''); setSectionIds([]); setSubjectId(''); setTeacherId(''); setCombinedSlot(''); setRevision((value) => value + 1)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Teacher mapping could not be saved.') } finally { setBusy(false) }
  }
```

`changeClass` resets `setSectionIds([])` instead of `setSectionId('')`. The assignments table's first cell (`assignment.classSectionLabel`) already shows the merged label from the API; add a small badge when `assignment.combinedSlotLabel`: `{assignment.combinedSlotLabel && <small className="status-badge tone-info">{assignment.combinedSlotLabel}</small>}`. Add minimal `.section-multiselect` styles inline or in the page's existing CSS if a stylesheet exists (`display:flex; gap:.5rem; flex-wrap:wrap; border:1px solid var(--color-border); border-radius:8px; padding:.35rem .6rem`).

- [ ] **Step 3: Typecheck + lint** — (cwd `apps/institute-admin-web`) `npm run typecheck && npm run lint` → clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(academics-web): multi-section teacher mapping with combined slot"`

---

### Task 5: Solver — joint tasks, multi-section entries (TDD)

**Files:**
- Modify: `apps/institute-admin-web/src/features/timetable/TimetableGenerator.jsx:176-504`
- Test: `apps/institute-admin-web/src/features/timetable/TimetableGenerator.solver.test.jsx`

The solver's bundle assignment shape becomes `{id, teacherId, subjectId, classIds: string[], combinedSlotLabel?: string, periodsPerWeek, avoidRepeatSameDay}`. Entries become `{assignmentId, teacherId, subjectId, classIds, classId /* = classIds[0] */, slotGroupId|null, day, periods, roomId}`.

- [ ] **Step 1: Write failing solver tests.** Read the existing test file's helper/bundle builders first and reuse them, migrating their fixture assignments from `classId: 'x'` to `classIds: ['x']`. Add:

```jsx
describe("combined section lessons", () => {
  const base = makeBundle(); // reuse/extend the file's existing fixture factory

  it("blocks every participating section at the joint slot", () => {
    const bundle = withAssignments(base, [
      { id: "asg_joint", teacherId: "t1", subjectId: "s1", classIds: ["c1", "c2"], periodsPerWeek: 2, avoidRepeatSameDay: true },
      { id: "asg_math", teacherId: "t2", subjectId: "s2", classIds: ["c1"], periodsPerWeek: 4, avoidRepeatSameDay: true },
    ]);
    const result = generateTimetable(bundle, { attempts: 5 });
    expect(result.feasible).toBe(true);
    const joint = result.entries.filter((e) => e.assignmentId === "asg_joint");
    for (const entry of joint) {
      expect(entry.classIds).toEqual(["c1", "c2"]);
      const clash = result.entries.find((other) => other !== entry && other.day === entry.day &&
        other.periods.some((p) => entry.periods.includes(p)) &&
        other.classIds.some((c) => entry.classIds.includes(c)));
      expect(clash).toBeUndefined();
    }
  });

  it("co-locates parallel options sharing a combined slot label", () => {
    const bundle = withAssignments(base, [
      { id: "asg_fr", teacherId: "t1", subjectId: "s_fr", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 3, avoidRepeatSameDay: true },
      { id: "asg_es", teacherId: "t2", subjectId: "s_es", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 3, avoidRepeatSameDay: true },
    ]);
    const result = generateTimetable(bundle, { attempts: 5 });
    expect(result.feasible).toBe(true);
    const fr = result.entries.filter((e) => e.assignmentId === "asg_fr");
    const es = result.entries.filter((e) => e.assignmentId === "asg_es");
    expect(fr).toHaveLength(3);
    expect(es).toHaveLength(3);
    const key = (e) => `${e.day}-${e.periods.join(",")}`;
    expect(fr.map(key).sort()).toEqual(es.map(key).sort());   // identical slots, every occurrence
    for (const e of [...fr, ...es]) expect(e.slotGroupId).toBeTruthy();
  });

  it("rejects a joint group whose options share a teacher", () => {
    const bundle = withAssignments(base, [
      { id: "a1", teacherId: "t1", subjectId: "s_fr", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 2, avoidRepeatSameDay: true },
      { id: "a2", teacherId: "t1", subjectId: "s_es", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 2, avoidRepeatSameDay: true },
    ]);
    const result = generateTimetable(bundle, { attempts: 2 });
    expect(result.feasible).toBe(false);
    expect(result.diagnostics.join(" ")).toMatch(/same teacher/i);
  });

  it("keeps single-section behavior identical (classIds length 1)", () => {
    const result = generateTimetable(base, { attempts: 5 }); // base uses only single-section assignments
    expect(result.feasible).toBe(true);
    for (const e of result.entries) { expect(e.classIds).toHaveLength(1); expect(e.classId).toBe(e.classIds[0]); expect(e.slotGroupId).toBeFalsy(); }
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/features/timetable/TimetableGenerator.solver.test.jsx` → new tests FAIL (and pre-existing ones too once fixtures use `classIds`; that's the migration pressure).

- [ ] **Step 3: Implement the solver changes.** All in `TimetableGenerator.jsx`; the shape of each change:

(a) Helpers near line 176:

```jsx
function assignmentClassIds(a) { return a.classIds || (a.classId ? [a.classId] : []); }
function groupKeyOf(a) {
  const label = (a.combinedSlotLabel || "").trim();
  return label ? `${label.toLowerCase()}|${assignmentClassIds(a).slice().sort().join(",")}` : null;
}
// A "unit" is what the queue schedules: one plain assignment, or a labeled
// group of parallel assignments that must land on the same slot.
function buildUnits(assignments) {
  const byKey = new Map();
  const units = [];
  for (const a of assignments) {
    const key = groupKeyOf(a);
    if (!key) { units.push({ id: a.id, assignments: [a] }); continue; }
    if (!byKey.has(key)) { const unit = { id: `grp_${key}`, assignments: [] }; byKey.set(key, unit); units.push(unit); }
    byKey.get(key).assignments.push(a);
  }
  return units;
}
```

(b) `validateTimetableInput` — replace the per-assignment class checks: `const cls = classById[a.classId]` becomes a loop over `assignmentClassIds(a)` (error if any id is unknown); `classLoad` is computed from UNITS, not assignments (`for (const unit of buildUnits(assignments))` → for each classId of `unit.assignments[0]`, `classLoad[classId] += unit.assignments[0].periodsPerWeek`). Add group sanity checks per multi-assignment unit: mismatched `periodsPerWeek` → error `"Parallel options under '<label>' must all have the same periods/week."`; duplicate `teacherId` within a unit → `"Parallel options under '<label>' share the same teacher — one teacher can't run two options at once."`; duplicate non-null `requiresRoomId` → similar room error; mixed `isDouble` → error.

(c) `buildTaskQueue` — build from units. `slack` = min over the unit's teachers of available slots, minus periodsPerWeek. Locked-count keying stays per assignmentId but a unit is "satisfied" using its FIRST assignment's locked count. Scope filter: skip unit when `generateScope !== "all" && !assignmentClassIds(unit.assignments[0]).includes(generateScope)`. Task shape: `{ unit, unitType }`.

(d) `getSingleCandidates(task, data, state)` — for each teaching slot: EVERY assignment in `task.unit.assignments` must have its teacher available + not busy + day-cap ok, and its room (if any) free; EVERY classId of the unit must have `classBusy` false. Candidate: `{ day, periods: [p], placements: task.unit.assignments.map((a) => ({ assignment: a, roomId: subjectById[a.subjectId].requiresRoomId || null })) }`. `getDoubleCandidates` mirrors this for consecutive pairs.

(e) `placeCandidate(candidate, task, data, state)` — `const slotGroupId = task.unit.assignments.length > 1 ? uid("slot") : null;` then for each placement: mark `teacherBusy`, `roomBusy`, bump `teacherDayCount`/`assignmentDayCount`/`assignmentPeriodCount` (per assignment), and push one entry per placement: `{ assignmentId, teacherId, subjectId, classIds, classId: classIds[0], slotGroupId, day, periods, roomId }`. Mark `classBusy` once per classId of the unit. NOTE: locked-entry replay at `greedyConstruct:373-376` calls `placeCandidate(e, {assignmentId})` — change it to reconstruct a unit from the entry's assignment (`placeLockedEntry(e, data, state)` helper that marks busy maps directly from the entry's own fields; simplest is a new small function rather than forcing locked entries through the unit path).

(f) `scoreCandidate` — use `task.unit.assignments[0]` for the repeat/period-stability terms; the teacher-day term becomes the SUM over placements' teachers.

(g) `canPlaceAt(entry, day, period, data, entries)` — the conflict loop adds: `if (entry.slotGroupId && other.slotGroupId === entry.slotGroupId) continue;` and class clash becomes `if (other.classIds.some((c) => entry.classIds.includes(c))) return false;`.

(h) `localSearchImprove` — the swappable index filter adds `&& !current[i].slotGroupId` (joint blocks are never separated; plain multi-section entries stay swappable since `canPlaceAt` now checks the whole `classIds`).

(i) `generateTimetable` diagnostics (line 493-502) — class name becomes `assignmentClassIds(a).map((id) => classById[id]?.name).filter(Boolean).join(" + ")`.

(j) Migrate the demo data (lines ~807-823) and `storage.js`/sanitize block (TimetableGenerator.jsx ~872-879): demo entries get `classIds: ["cls_6a"]`-style arrays; sanitize accepts `a.classIds?.length || a.classId` and normalizes to `classIds` via `assignmentClassIds`, keeping `combinedSlotLabel: a.combinedSlotLabel || ""`.

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/features/timetable/TimetableGenerator.solver.test.jsx` → ALL tests pass (old + new).
- [ ] **Step 5: Commit** — `git commit -am "feat(timetable): solver schedules joint multi-section blocks with parallel options"`

---

### Task 6: Timetable UI — grid, drag/drop, exports, AssignmentsTab, mapBundle

**Files:**
- Modify: `apps/institute-admin-web/src/features/timetable/TimetableGenerator.jsx` (grid ~1600-1900, AssignmentsTab 1252-1295, CSV export ~1714)
- Modify: `apps/institute-admin-web/src/features/timetable/TimetablePage.tsx:35-40, 112-138, 190-203`
- Test: `apps/institute-admin-web/src/features/timetable/TimetablePage.test.tsx`

- [ ] **Step 1: Update `TimetablePage.test.tsx`** — the mocked assignment fixture (line 22) becomes `{ id: 'assignment-1', classSectionIds: ['section-1'], classSectionId: 'section-1', subject: {...}, teacher: {...} }`; add a second fixture with two sections + `combinedSlotLabel: 'Lang'` and assert the built bundle assignment has `classIds` of length 2 (follow this file's existing assertion style). Run `npx vitest run src/features/timetable/TimetablePage.test.tsx` → FAIL.

- [ ] **Step 2: `TimetablePage.tsx` changes:**
  - `AssignmentRecord` type: add `classSectionIds: string[]`, `combinedSlotLabel?: string` (keep `classSectionId`).
  - `mapBundle` assignments block:

```ts
    assignments: assignments
      .map((assignment) => ({ ...assignment, sectionIds: (assignment.classSectionIds ?? [assignment.classSectionId]).filter((id) => sectionIds.has(id)) }))
      .filter((assignment) => assignment.sectionIds.length > 0 && teacherIds.has(assignment.teacher.id) && subjectIds.has(assignment.subject.id))
      .map((assignment) => {
        const gradeId = currentSections.find((section) => section.id === assignment.sectionIds[0])?.grade.id
        const mapping = curriculumByClassAndSubject.get(`${gradeId}:${assignment.subject.id}`)
        return {
          id: assignment.id, teacherId: assignment.teacher.id, subjectId: assignment.subject.id,
          classIds: assignment.sectionIds, combinedSlotLabel: assignment.combinedSlotLabel ?? '',
          curriculumId: mapping?.id, periodsPerWeek: mapping?.periodsPerWeek ?? 0, avoidRepeatSameDay: true,
        }
      }),
```

  - `saveAssignment` input gains `classSectionIds: string[]` and `combinedSlotLabel?: string`; the `assignmentInput` becomes `{ classSectionIds: input.classSectionIds, subjectId: input.subjectId, teacherId: input.teacherId, ...(input.combinedSlotLabel ? { combinedSlotLabel: input.combinedSlotLabel } : {}) }`. (Callers inside the generator pass through unchanged fields; adjust the `TimetableGenerator.d.ts` declaration accordingly — find `saveAssignment` in that file.)

- [ ] **Step 3: Grid + interactions in `TimetableGenerator.jsx`.** Introduce `const entryClassIds = (e) => e.classIds || (e.classId ? [e.classId] : []);` near the grid code, then:
  - Grid filter (~line 1700): `view === "class" ? entryClassIds(e).includes(focusId) : e.teacherId === focusId`.
  - Cell rendering (~1841): when the slot has multiple entries sharing one `slotGroupId`, render them stacked in the one cell ("French — Mrs. X" / "Spanish — Mr. Y") with a small "Combined" badge; the existing single-entry path renders unchanged. In class view, the "other" line for a multi-section entry shows the section list: `bundle.classes.filter((c) => entryClassIds(entry).includes(c.id)).map((c) => c.name).join(", ")`.
  - `conflictingIds` (~1642) and the drag handler (~1635-1665): class-clash checks become intersection tests via `entryClassIds`; drag payload carries `classIds` instead of `classId`; entries with a `slotGroupId` are not draggable (`draggable={!entry.slotGroupId && ...}`) and locked out of drop targets — a joint block moves only by regenerating.
  - CSV export (~1714): one row per `(entry, classId)` pair: `for (const e of sorted) for (const cid of entryClassIds(e)) for (const p of e.periods) rows.push([e.day, p, classById[cid]?.name, subjectById[e.subjectId]?.name, teacherById[e.teacherId]?.name]);`.

- [ ] **Step 4: `AssignmentsTab` (1252-1295):** the CLASS cell shows all sections: `const className = (ids) => ids.map((id) => classes.find((c) => c.id === id)?.name || "—").join(", ")` called with `assignmentClassIds(a)`; add a COMBINED SLOT column rendering `a.combinedSlotLabel || "—"`.

- [ ] **Step 5: Run all frontend tests + typecheck** — `npx vitest run && npm run typecheck` → PASS/clean.
- [ ] **Step 6: Commit** — `git commit -am "feat(timetable-web): render and export joint multi-section blocks"`

---

### Task 7: Bulk import + backend staff-timetable compatibility

**Files:**
- Modify: `apps/institute-admin-web/src/features/timetable/TimetableGenerator.jsx:612-663` (importAssignmentsRows), template text ~678-705
- Modify: `services/api/modules/admin_console/timetable_views.py:227-260`
- Test: solver test file (import section, if present) + `services/api/tests/test_admin_console_api.py`

- [ ] **Step 1: `importAssignmentsRows`** — the Class cell accepts multiple names separated by `;` or `/`, plus an optional Combined Slot column:

```jsx
    const classNamesRaw = String(className).split(/[;/]/).map((s) => s.trim()).filter(Boolean);
    const combinedSlotLabel = String(getVal(row, ["combinedslot", "combinedslotlabel", "commonslot"]) || "").trim();
    const clsList = classNamesRaw.map((n) => findByNameCI(refs.classes, n));
    const missingName = classNamesRaw[clsList.findIndex((c) => !c)];
    if (missingName !== undefined) { errors.push(`Assignments row ${i + 2}: class "${missingName}" not found — add it in the Classes sheet first.`); return; }
    const classIds = clsList.map((c) => c.id);
    const sameSet = (a) => a.classIds.length === classIds.length && a.classIds.every((id) => classIds.includes(id));
    const existing = assignments.find((a) => a.teacherId === teacher.id && a.subjectId === subject.id && sameSet(a));
    if (existing) { Object.assign(existing, { periodsPerWeek, avoidRepeatSameDay, combinedSlotLabel }); updated++; }
    else { assignments.push({ id: uid("asg"), teacherId: teacher.id, subjectId: subject.id, classIds, combinedSlotLabel, periodsPerWeek, avoidRepeatSameDay }); added++; }
```

Update the template instructions sheet: Assignments columns become `Teacher, Subject, Class (use "6A; 6B" for combined lessons), Combined Slot (optional), Periods/Week, Avoid Repeat Same Day`.

- [ ] **Step 2: `StaffTimetableView` (timetable_views.py:227-260)** — teacher entries may now span sections: `class_ids = entry.get("classIds") or ([entry.get("classId")] if entry.get("classId") else [])`, look up each in `classes_map`, join names for the label, and emit `"classId": class_ids[0] if class_ids else ""` plus `"classIds": class_ids` in the response dict. Old saved bundles (entries with only `classId`) keep working via the fallback.

- [ ] **Step 3: Tests.** Frontend: add an import test (same solver test file or wherever `applyBulkImport` is currently tested — check with `rg -n "applyBulkImport" src`; if untested, add a small `describe("bulk import combined")` in the solver test file exercising a `Class: "6A; 6B"` + `Combined Slot: "Lang"` row and asserting the resulting assignment's `classIds`/`combinedSlotLabel`). Backend: in `tests/test_admin_console_api.py`, find the existing staff-timetable test, add a case where a saved bundle entry has `classIds: [id_a, id_b]` and assert the endpoint returns the joined label and both ids.

- [ ] **Step 4: Run** — `npx vitest run` (frontend cwd) and `pytest tests/test_admin_console_api.py -v` (backend cwd) → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(timetable): combined-section bulk import and staff-view compatibility"`

---

### Task 8: End-to-end verification + finish

- [ ] **Step 1: Full suites.** Backend: `pytest`. Frontend: `npx vitest run && npm run typecheck && npm run lint`. All green.
- [ ] **Step 2: Manual smoke (dev servers).** Create two sections (10-A, 10-B) → map French/T1 and Spanish/T2 to both with combined slot "Second Language" (3 periods/week) → open Generate Timetable → generate → verify: both sections show French/Spanish stacked at identical slots ×3; nothing else occupies those slots for either section; a plain single-section subject still schedules normally; save + publish; staff timetable for T1 shows "Class 10 A/B".
- [ ] **Step 3: Finish.** Use superpowers:finishing-a-development-branch (merge/PR decision with the user).

---

## Self-review notes (already applied)

- Spec coverage: model/label (T1), validation rules (T2), API (T3), "All sections" UI + combined-slot field (T4), joint-block + parallel co-location + pre-flight load + atomic local search (T5), grid/exports/inline errors (T4/T6), bulk import + publish-path compatibility (T7), migration correctness exercised by pre-existing tests updated in T3.
- Type consistency: `classIds`/`classSectionIds`/`combinedSlotLabel`/`slotGroupId` used identically across tasks; `entryClassIds`/`assignmentClassIds` helpers defined in T5/T6 before use.
- Known judgment calls an implementer may adjust with evidence: exact fixture names in backend tests must be adapted to `test_academics_models.py`'s real fixtures; migration file number; the `RemoveIndex` op names come from makemigrations output.
