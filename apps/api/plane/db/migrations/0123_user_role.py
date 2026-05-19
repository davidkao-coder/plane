"""
Add per-user `role` field to User model (TMS customization).

Distinct from workspace role (Admin/Member/Guest); this flag controls
work-log enforcement: managers are exempt from daily logging.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0122_issue_hours_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[("member", "Member"), ("manager", "Manager")],
                default="member",
                max_length=20,
                verbose_name="User Role",
            ),
        ),
    ]
