import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        (
            "institutes",
            "0002_remove_institutemembership_uq_membership_scope_role_and_more",
        ),
        ("people", "0003_parentprofile_studentguardian_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AcademicYear",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("name", models.CharField(max_length=20)),
                ("start_date", models.DateField()),
                ("end_date", models.DateField()),
                ("is_current", models.BooleanField(default=False)),
                (
                    "institute",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="academic_years",
                        to="institutes.institute",
                    ),
                ),
            ],
            options={
                "db_table": "academic_years",
                "ordering": ("-start_date", "name"),
            },
        ),
        migrations.CreateModel(
            name="Grade",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("name", models.CharField(max_length=50)),
                ("sort_order", models.PositiveIntegerField(default=0)),
                (
                    "institute",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="grades",
                        to="institutes.institute",
                    ),
                ),
            ],
            options={
                "db_table": "classes",
                "ordering": ("sort_order", "name"),
            },
        ),
        migrations.CreateModel(
            name="ClassSection",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("section_name", models.CharField(max_length=20)),
                ("max_strength", models.PositiveIntegerField(blank=True, null=True)),
                (
                    "academic_year",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="class_sections",
                        to="academics.academicyear",
                    ),
                ),
                (
                    "branch",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="class_sections",
                        to="institutes.branch",
                    ),
                ),
                (
                    "class_teacher",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="class_teacher_sections",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "grade",
                    models.ForeignKey(
                        db_column="class_id",
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="sections",
                        to="academics.grade",
                    ),
                ),
            ],
            options={
                "db_table": "class_sections",
                "ordering": ("grade__sort_order", "grade__name", "section_name"),
            },
        ),
        migrations.CreateModel(
            name="StudentEnrollment",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("roll_number", models.CharField(max_length=20)),
                ("enrolled_at", models.DateTimeField(auto_now_add=True)),
                ("left_at", models.DateTimeField(blank=True, null=True)),
                (
                    "academic_year",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="student_enrollments",
                        to="academics.academicyear",
                    ),
                ),
                (
                    "class_section",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="student_enrollments",
                        to="academics.classsection",
                    ),
                ),
                (
                    "student",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="academic_enrollments",
                        to="people.student",
                    ),
                ),
            ],
            options={
                "db_table": "student_enrollments",
                "ordering": ("class_section", "roll_number"),
            },
        ),
        migrations.CreateModel(
            name="Subject",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("name", models.CharField(max_length=100)),
                ("subject_code", models.CharField(blank=True, max_length=20)),
                (
                    "institute",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="subjects",
                        to="institutes.institute",
                    ),
                ),
            ],
            options={
                "db_table": "subjects",
                "ordering": ("name", "subject_code"),
            },
        ),
        migrations.CreateModel(
            name="SubjectTeacherAssignment",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                (
                    "class_section",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="subject_teacher_assignments",
                        to="academics.classsection",
                    ),
                ),
                (
                    "subject",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="section_teacher_assignments",
                        to="academics.subject",
                    ),
                ),
                (
                    "teacher",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="subject_teacher_assignments",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "subject_teacher_assignments",
                "ordering": ("subject__name",),
            },
        ),
        migrations.AddIndex(
            model_name="academicyear",
            index=models.Index(
                fields=["institute", "is_current", "start_date"],
                name="academic_ye_institu_53d841_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="academicyear",
            constraint=models.UniqueConstraint(
                fields=("institute", "name"), name="uq_academic_year_name_per_institute"
            ),
        ),
        migrations.AddConstraint(
            model_name="academicyear",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_current", True)),
                fields=("institute",),
                name="uq_current_academic_year_per_institute",
            ),
        ),
        migrations.AddConstraint(
            model_name="academicyear",
            constraint=models.CheckConstraint(
                condition=models.Q(("end_date__gte", models.F("start_date"))),
                name="ck_academic_year_date_order",
            ),
        ),
        migrations.AddIndex(
            model_name="grade",
            index=models.Index(
                fields=["institute", "sort_order", "name"],
                name="classes_institu_7d146f_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="grade",
            constraint=models.UniqueConstraint(
                fields=("institute", "name"), name="uq_class_name_per_institute"
            ),
        ),
        migrations.AddIndex(
            model_name="classsection",
            index=models.Index(
                fields=["branch", "academic_year"],
                name="class_secti_branch__6eefdd_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="classsection",
            index=models.Index(
                fields=["grade", "academic_year"], name="class_secti_class_i_46f3ac_idx"
            ),
        ),
        migrations.AddConstraint(
            model_name="classsection",
            constraint=models.UniqueConstraint(
                fields=("branch", "grade", "academic_year", "section_name"),
                name="uq_class_section_scope",
            ),
        ),
        migrations.AddConstraint(
            model_name="classsection",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("max_strength__isnull", True),
                    ("max_strength__gt", 0),
                    _connector="OR",
                ),
                name="ck_class_section_positive_capacity",
            ),
        ),
        migrations.AddIndex(
            model_name="studentenrollment",
            index=models.Index(
                fields=["student"], name="student_enr_student_754696_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="studentenrollment",
            index=models.Index(
                fields=["class_section", "academic_year"],
                name="student_enr_class_s_76042a_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="studentenrollment",
            index=models.Index(
                fields=["academic_year", "left_at"],
                name="student_enr_academi_f0242f_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="studentenrollment",
            constraint=models.UniqueConstraint(
                fields=("class_section", "roll_number"), name="uq_section_roll_number"
            ),
        ),
        migrations.AddConstraint(
            model_name="studentenrollment",
            constraint=models.UniqueConstraint(
                fields=("student", "academic_year"), name="uq_student_academic_year"
            ),
        ),
        migrations.AddConstraint(
            model_name="studentenrollment",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    ("left_at__isnull", True),
                    ("left_at__gte", models.F("enrolled_at")),
                    _connector="OR",
                ),
                name="ck_enrollment_left_after_enrolled",
            ),
        ),
        migrations.AddIndex(
            model_name="subject",
            index=models.Index(
                fields=["institute", "name"], name="subjects_institu_e27355_idx"
            ),
        ),
        migrations.AddConstraint(
            model_name="subject",
            constraint=models.UniqueConstraint(
                fields=("institute", "name"), name="uq_subject_name_per_institute"
            ),
        ),
        migrations.AddConstraint(
            model_name="subject",
            constraint=models.UniqueConstraint(
                condition=models.Q(("subject_code", ""), _negated=True),
                fields=("institute", "subject_code"),
                name="uq_subject_code_per_institute",
            ),
        ),
        migrations.AddIndex(
            model_name="subjectteacherassignment",
            index=models.Index(
                fields=["class_section", "teacher"],
                name="subject_tea_class_s_a49ff8_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="subjectteacherassignment",
            index=models.Index(
                fields=["teacher", "class_section"],
                name="subject_tea_teacher_605058_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="subjectteacherassignment",
            constraint=models.UniqueConstraint(
                fields=("class_section", "subject"), name="uq_section_subject_teacher"
            ),
        ),
    ]
