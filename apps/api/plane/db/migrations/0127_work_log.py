"""
TMS customization – WorkLog table.

Adds the work_logs table that replaces the single Issue.actual_hours value with
a per-entry log. The actual_hours column on Issue is retained as a
denormalized cache (see Phase 1.9 for the read-only switch + Subquery
annotation).
"""

from django.conf import settings
from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0126_feature_requirement_feature"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="WorkLog",
            fields=[
                (
                    "created_at",
                    models.DateTimeField(auto_now_add=True, verbose_name="Created At"),
                ),
                (
                    "updated_at",
                    models.DateTimeField(auto_now=True, verbose_name="Last Modified At"),
                ),
                ("deleted_at", models.DateTimeField(null=True)),
                (
                    "id",
                    models.UUIDField(
                        db_index=True,
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                        unique=True,
                    ),
                ),
                ("log_date", models.DateField()),
                ("hours", models.DecimalField(decimal_places=2, max_digits=5)),
                ("note", models.TextField(blank=True)),
                (
                    "issue",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="work_logs",
                        to="db.issue",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=models.deletion.PROTECT,
                        related_name="work_logs",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="project_worklog",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="workspace_worklog",
                        to="db.workspace",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="worklog_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="worklog_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Work Log",
                "verbose_name_plural": "Work Logs",
                "db_table": "work_logs",
                "ordering": ("-log_date", "-created_at"),
            },
        ),
        migrations.AddIndex(
            model_name="worklog",
            index=models.Index(fields=["issue", "log_date"], name="worklog_issue_logdate_idx"),
        ),
        migrations.AddIndex(
            model_name="worklog",
            index=models.Index(fields=["user", "log_date"], name="worklog_user_logdate_idx"),
        ),
        migrations.AddConstraint(
            model_name="worklog",
            constraint=models.CheckConstraint(
                check=models.Q(("hours__gt", 0)) & models.Q(("hours__lte", 24)),
                name="work_log_hours_between_0_and_24",
            ),
        ),
        # Data migration: backfill existing Issue.actual_hours → WorkLog rows
        migrations.RunPython(
            code=lambda apps, schema_editor: _backfill_work_logs(apps),
            reverse_code=migrations.RunPython.noop,
        ),
    ]


def _backfill_work_logs(apps):
    """For every Issue with actual_hours > 0 create one WorkLog using
    updated_at::date as log_date, updated_by as user (or created_by fallback),
    hours = actual_hours, note = "[Migrated]".

    Uses raw SQL because the Issue historical model in a migration context
    doesn't expose Plane's custom IssueManager (`issue_objects`), and the
    default `objects` manager isn't installed on it.
    """
    from django.db import connection

    WorkLog = apps.get_model("db", "WorkLog")

    rows = []
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, project_id, workspace_id,
                   COALESCE(updated_by_id, created_by_id) AS user_id,
                   updated_at::date AS log_date,
                   actual_hours
              FROM issues
             WHERE actual_hours IS NOT NULL
               AND actual_hours > 0
               AND COALESCE(updated_by_id, created_by_id) IS NOT NULL
            """
        )
        rows = cursor.fetchall()

    to_create = []
    for issue_id, project_id, workspace_id, user_id, log_date, actual_hours in rows:
        # Clamp to allowed range (hours > 0 AND hours <= 24). The original
        # actual_hours could be > 24 (multiple days of work compressed into
        # one field); split into 24-hour chunks if so.
        remaining = float(actual_hours or 0)
        chunk_index = 0
        while remaining > 0:
            this_chunk = min(remaining, 24)
            to_create.append(
                WorkLog(
                    issue_id=issue_id,
                    project_id=project_id,
                    workspace_id=workspace_id,
                    user_id=user_id,
                    log_date=log_date,
                    hours=round(this_chunk, 2),
                    note=(
                        "[Migrated]" if chunk_index == 0
                        else f"[Migrated chunk {chunk_index + 1}]"
                    ),
                    created_by_id=user_id,
                    updated_by_id=user_id,
                )
            )
            remaining -= this_chunk
            chunk_index += 1

    if to_create:
        WorkLog.objects.bulk_create(to_create, batch_size=500)
