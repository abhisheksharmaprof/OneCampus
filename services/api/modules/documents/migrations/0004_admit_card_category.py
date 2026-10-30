from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("documents", "0003_document_template_versions")]

    operations = [
        migrations.AlterField(
            model_name="documenttemplate",
            name="category",
            field=models.CharField(
                choices=[
                    ("FEE_INVOICE", "Fee invoice"),
                    ("FEE_RECEIPT", "Fee receipt"),
                    ("MARKSHEET", "Mark sheet"),
                    ("ID_CARD", "ID card"),
                    ("ADMIT_CARD", "Admit card"),
                    ("CERTIFICATE", "Certificate"),
                ],
                max_length=20,
            ),
        )
    ]
