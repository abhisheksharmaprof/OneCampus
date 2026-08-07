from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):
    dependencies = [("academics", "0004_alter_classsection_max_strength")]
    operations = [
        migrations.CreateModel(
            name="Room",
            fields=[
                ("id", models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(max_length=100)),
                ("room_type", models.CharField(default="CLASSROOM", max_length=40)),
                ("capacity", models.PositiveIntegerField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("branch", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rooms", to="institutes.branch")),
                ("institute", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="rooms", to="institutes.institute")),
            ],
            options={"db_table": "rooms", "ordering": ("branch__name", "name")},
        ),
        migrations.AddConstraint(model_name="room", constraint=models.UniqueConstraint(fields=("branch", "name"), name="uq_room_name_per_branch")),
        migrations.AddIndex(model_name="room", index=models.Index(fields=["institute", "branch", "is_active"], name="rooms_institu_b415dd_idx")),
    ]
