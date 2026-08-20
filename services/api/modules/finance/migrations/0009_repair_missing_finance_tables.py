"""Repair databases where finance migrations are marked applied but tables are absent."""

from django.db import migrations

FINANCE_MODELS = ("FinanceSettings", "FeePlan", "FeeInvoice", "FeePayment", "FinanceRecord")


def create_missing_finance_tables(apps, schema_editor):
    connection = schema_editor.connection
    existing_tables = set(connection.introspection.table_names())

    # FeeInvoice has an optional FK to DocumentTemplate. Some deployments
    # recorded the documents migration without actually creating its table.
    document_template = apps.get_model("documents", "DocumentTemplate")
    if document_template._meta.db_table not in existing_tables:
        schema_editor.create_model(document_template)
        existing_tables.add(document_template._meta.db_table)

    # Respect FK order when a database is missing more than one finance table.
    for model_name in FINANCE_MODELS:
        model = apps.get_model("finance", model_name)
        if model._meta.db_table not in existing_tables:
            schema_editor.create_model(model)
            existing_tables.add(model._meta.db_table)


class Migration(migrations.Migration):
    dependencies = [("finance", "0008_retarget_template_to_documents")]

    operations = [
        migrations.RunPython(
            create_missing_finance_tables,
            migrations.RunPython.noop,
        ),
    ]
