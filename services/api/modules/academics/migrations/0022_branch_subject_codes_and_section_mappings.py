from django.db import migrations, models
import django.db.models.deletion
from django.db.models import Q


def add_subject_branch_if_missing(apps, schema_editor):
    model = apps.get_model("academics", "Subject")
    columns = {column.name for column in schema_editor.connection.introspection.get_table_description(schema_editor.connection.cursor(), "subjects")}
    if "branch_id" in columns:
        return
    field = models.ForeignKey(
        apps.get_model("institutes", "Branch"), on_delete=django.db.models.deletion.SET_NULL,
        null=True, blank=True, related_name="subjects"
    )
    field.set_attributes_from_name("branch")
    field.model = model
    schema_editor.add_field(model, field)


def add_class_section_if_missing(apps, schema_editor):
    model = apps.get_model("academics", "ClassSubject")
    columns = {column.name for column in schema_editor.connection.introspection.get_table_description(schema_editor.connection.cursor(), "class_subjects")}
    if "class_section_id" in columns:
        return
    field = models.ForeignKey(
        apps.get_model("academics", "ClassSection"), on_delete=django.db.models.deletion.CASCADE,
        null=True, blank=True, related_name="curriculum_subjects"
    )
    field.set_attributes_from_name("class_section")
    field.model = model
    schema_editor.add_field(model, field)


class Migration(migrations.Migration):
    dependencies = [("academics", "0021_allow_duplicate_subject_names")]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(add_subject_branch_if_missing, migrations.RunPython.noop)],
            state_operations=[migrations.AddField(
                model_name="subject",
                name="branch",
                field=models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="subjects", to="institutes.branch",
                ),
            )],
        ),
        migrations.RemoveConstraint(model_name="subject", name="uq_subject_code_per_institute"),
        migrations.AddConstraint(
            model_name="subject",
            constraint=models.UniqueConstraint(
                condition=Q(branch__isnull=False) & ~Q(subject_code=""),
                fields=("branch", "subject_code"),
                name="uq_subject_code_per_institute",
            ),
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[migrations.RunPython(add_class_section_if_missing, migrations.RunPython.noop)],
            state_operations=[migrations.AddField(
                model_name="classsubject",
                name="class_section",
                field=models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.CASCADE,
                    related_name="curriculum_subjects", to="academics.classsection",
                ),
            )],
        ),
        migrations.RemoveConstraint(model_name="classsubject", name="uq_class_subject"),
        migrations.AddConstraint(
            model_name="classsubject",
            constraint=models.UniqueConstraint(
                fields=("class_section", "subject"), name="uq_class_section_subject"
            ),
        ),
    ]
