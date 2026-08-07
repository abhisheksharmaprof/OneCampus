import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("finance", "0002_initial")]
    operations = [migrations.CreateModel(name="FinanceRecord", fields=[
        ("created_at", models.DateTimeField(auto_now_add=True)), ("updated_at", models.DateTimeField(auto_now=True)),
        ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
        ("kind", models.CharField(choices=[("EXPENSE", "Expense"), ("PAYROLL", "Payroll"), ("BUDGET", "Budget")], max_length=16)),
        ("title", models.CharField(max_length=200)), ("category", models.CharField(blank=True, max_length=80)),
        ("amount", models.DecimalField(decimal_places=2, default=0, max_digits=12)), ("entry_date", models.DateField()),
        ("status", models.CharField(default="Draft", max_length=24)), ("metadata", models.JSONField(blank=True, default=dict)),
        ("branch", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="finance_records", to="institutes.branch")),
        ("institute", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="finance_records", to="institutes.institute")),
    ], options={"ordering": ("-entry_date", "-created_at"), "indexes": [models.Index(fields=["institute", "branch", "kind", "entry_date"], name="finance_fin_institu_deb4ca_idx")]})]
