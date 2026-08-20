from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("attendance", "0010_repair_missing_attendance_tables"),
        ("identity", "0006_use_generic_users_table"),
        ("people", "0027_use_generic_students_table"),
    ]

    operations = [
        migrations.AlterModelTable(name="studentattendance", table="attendance_records"),
        migrations.AlterModelTable(name="attendanceauditlog", table="attendance_audit_log"),
        migrations.AlterModelTable(name="leavetype", table="leave_types"),
        migrations.AlterModelTable(name="leaveapplication", table="leave_applications"),
        migrations.AlterModelTable(name="leavebalance", table="leave_balances"),
    ]
