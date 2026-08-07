from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("people", "0009_student_aadhar_number_and_more")]

    operations = [
        migrations.AddField(model_name="staffprofile", name="monthly_salary", field=models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
        migrations.AddField(model_name="staffprofile", name="salary_currency", field=models.CharField(default="INR", max_length=3)),
        migrations.AddField(model_name="staffprofile", name="pay_frequency", field=models.CharField(default="MONTHLY", max_length=16)),
        migrations.AddField(model_name="staffprofile", name="bank_name", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="staffprofile", name="bank_account_last4", field=models.CharField(blank=True, max_length=4)),
        migrations.AddField(model_name="staffprofile", name="bank_ifsc", field=models.CharField(blank=True, max_length=20)),
        migrations.AddField(model_name="staffprofile", name="date_of_joining", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="staffprofile", name="date_of_birth", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="staffprofile", name="gender", field=models.CharField(blank=True, max_length=32)),
        migrations.AddField(model_name="staffprofile", name="blood_group", field=models.CharField(blank=True, max_length=12)),
        migrations.AddField(model_name="staffprofile", name="qualification", field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name="staffprofile", name="experience_years", field=models.PositiveSmallIntegerField(blank=True, null=True)),
        migrations.AddField(model_name="staffprofile", name="marital_status", field=models.CharField(blank=True, max_length=32)),
        migrations.AddField(model_name="staffprofile", name="father_name", field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name="staffprofile", name="mother_name", field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name="staffprofile", name="pan_or_id_number", field=models.CharField(blank=True, max_length=64)),
        migrations.AddField(model_name="staffprofile", name="current_address", field=models.TextField(blank=True)),
        migrations.AddField(model_name="staffprofile", name="permanent_address", field=models.TextField(blank=True)),
        migrations.AddField(model_name="staffprofile", name="previous_school_name", field=models.CharField(blank=True, max_length=200)),
        migrations.AddField(model_name="staffprofile", name="previous_school_address", field=models.TextField(blank=True)),
        migrations.AddField(model_name="staffprofile", name="previous_school_phone", field=models.CharField(blank=True, max_length=20)),
        migrations.AddField(model_name="staffprofile", name="bank_branch", field=models.CharField(blank=True, max_length=120)),
        migrations.AddField(model_name="staffprofile", name="shift", field=models.CharField(blank=True, max_length=64)),
        migrations.AddField(model_name="staffprofile", name="work_location", field=models.CharField(blank=True, max_length=160)),
        migrations.AddField(model_name="staffprofile", name="social_links", field=models.JSONField(blank=True, default=dict)),
    ]
