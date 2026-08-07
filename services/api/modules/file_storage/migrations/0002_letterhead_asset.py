from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("file_storage", "0001_initial")]

    operations = [
        migrations.AlterField(
            model_name="fileasset",
            name="asset_type",
            field=models.CharField(
                choices=[
                    ("PROFILE_PHOTO", "Profile photo"),
                    ("LOGO", "Institute logo"),
                    ("LETTERHEAD", "Institute letterhead"),
                    ("BANNER", "Institute banner"),
                    ("GALLERY_IMAGE", "Gallery image"),
                    ("ID_DOCUMENT", "Identity document"),
                    ("CERTIFICATE", "Certificate"),
                    ("OTHER_DOCUMENT", "Other document"),
                ],
                max_length=32,
            ),
        ),
    ]
