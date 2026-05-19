"""
TMS customization – Stage layer.

Creates `stages` table, adds nullable `stage_id` to `modules`, and backfills
existing Module rows: for each Project that has modules, create a default
Stage "未分類階段" and point all of that project's modules at it.

Reversible: data migration is no-op on reverse (we keep stage rows + FK).
"""

from django.db import migrations, models
import uuid


def create_default_stages_and_backfill(apps, schema_editor):
    Module = apps.get_model("db", "Module")
    Stage = apps.get_model("db", "Stage")

    # Group modules by project
    project_ids = (
        Module.objects.filter(deleted_at__isnull=True)
        .values_list("project_id", flat=True)
        .distinct()
    )

    for project_id in project_ids:
        # Resolve workspace from any module of this project
        any_module = (
            Module.objects.filter(project_id=project_id, deleted_at__isnull=True)
            .only("workspace_id")
            .first()
        )
        if not any_module:
            continue

        default_stage, _ = Stage.objects.get_or_create(
            project_id=project_id,
            name="未分類階段",
            defaults={
                "workspace_id": any_module.workspace_id,
                "description": "由 Stage 階層擴充自動建立，用於放置尚未分類的 Module。",
                "sort_order": 65535,
            },
        )

        Module.objects.filter(project_id=project_id, stage__isnull=True).update(
            stage_id=default_stage.id
        )


def noop_reverse(apps, schema_editor):
    """No-op – keep stages on rollback so users don't lose data."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0123_user_role"),
    ]

    operations = [
        migrations.CreateModel(
            name="Stage",
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
                ("name", models.CharField(max_length=255, verbose_name="Stage Name")),
                ("description", models.TextField(blank=True, verbose_name="Stage Description")),
                ("sort_order", models.FloatField(default=65535)),
                ("start_date", models.DateField(blank=True, null=True)),
                ("target_date", models.DateField(blank=True, null=True)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("logo_props", models.JSONField(default=dict)),
                ("external_source", models.CharField(blank=True, max_length=255, null=True)),
                ("external_id", models.CharField(blank=True, max_length=255, null=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="stage_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="stage_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="project_stage",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="workspace_stage",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Stage",
                "verbose_name_plural": "Stages",
                "db_table": "stages",
                "ordering": ("sort_order", "-created_at"),
            },
        ),
        migrations.AddConstraint(
            model_name="stage",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("name", "project"),
                name="stage_unique_name_project_when_deleted_at_null",
            ),
        ),
        migrations.AddField(
            model_name="module",
            name="stage",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="stage_modules",
                to="db.stage",
            ),
        ),
        migrations.RunPython(
            create_default_stages_and_backfill,
            reverse_code=noop_reverse,
        ),
    ]
