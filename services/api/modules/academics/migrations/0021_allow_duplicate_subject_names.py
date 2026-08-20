from django.db import migrations, models


def remove_subject_name_constraint(apps, schema_editor):
    subject = apps.get_model("academics", "Subject")
    constraint = next(
        constraint
        for constraint in subject._meta.constraints
        if constraint.name == "uq_subject_name_per_institute"
    )
    if schema_editor.connection.vendor == "sqlite":
        original_constraints = subject._meta.constraints
        subject._meta.constraints = [
            item for item in original_constraints if item.name != constraint.name
        ]
        try:
            schema_editor._remake_table(subject)
        finally:
            subject._meta.constraints = original_constraints
        return
    existing_name = next(
        iter(
            schema_editor._constraint_names(
                subject, ["institute_id", "name"], unique=True
            )
        ),
        None,
    )
    if existing_name:
        schema_editor.remove_constraint(
            subject,
            models.UniqueConstraint(
                fields=("institute", "name"), name=existing_name
            ),
        )


class Migration(migrations.Migration):
    dependencies = [
        ("academics", "0020_repair_missing_class_subject_is_lab"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(remove_subject_name_constraint, migrations.RunPython.noop),
            ],
            state_operations=[
                migrations.RemoveConstraint(
                    model_name="subject",
                    name="uq_subject_name_per_institute",
                ),
            ],
        ),
    ]
