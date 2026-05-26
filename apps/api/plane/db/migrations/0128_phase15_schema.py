"""
TMS Phase 1.5 – Schema-only changes.

Creates new tables (ProcessTemplate / ProcessStep / ProjectTemplate / +children)
and adds nullable FK fields to Stage / Requirement / Feature / Issue / Project.

No data migration in this file – see 0129 (seed) and 0130 (backfill).
"""

import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0127_work_log"),
    ]

    operations = [
        # ── ProcessTemplate ────────────────────────────────────────────────
        migrations.CreateModel(
            name="ProcessTemplate",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
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
                ("name", models.CharField(max_length=255)),
                ("stage_key", models.CharField(max_length=50)),
                ("description", models.TextField(blank=True)),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="workspace_process_template",
                        to="db.workspace",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="processtemplate_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="processtemplate_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Process Template",
                "verbose_name_plural": "Process Templates",
                "db_table": "process_templates",
                "ordering": ("stage_key", "name"),
            },
        ),
        migrations.AddConstraint(
            model_name="processtemplate",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "stage_key"),
                name="process_template_unique_workspace_stage_key",
            ),
        ),

        # ── ProcessStep ────────────────────────────────────────────────────
        migrations.CreateModel(
            name="ProcessStep",
            fields=[
                (
                    "id",
                    models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
                ),
                ("name", models.CharField(max_length=100)),
                ("sort_order", models.FloatField(default=65535)),
                ("default_role", models.CharField(blank=True, max_length=50)),
                (
                    "default_estimated_hours",
                    models.DecimalField(blank=True, decimal_places=1, max_digits=4, null=True),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "template",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="steps",
                        to="db.processtemplate",
                    ),
                ),
            ],
            options={
                "verbose_name": "Process Step",
                "verbose_name_plural": "Process Steps",
                "db_table": "process_steps",
                "ordering": ("sort_order",),
            },
        ),

        # ── ProjectTemplate ────────────────────────────────────────────────
        migrations.CreateModel(
            name="ProjectTemplate",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Created At")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Last Modified At")),
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
                ("name", models.CharField(max_length=100)),
                ("description", models.TextField(blank=True)),
                ("icon", models.CharField(blank=True, max_length=50)),
                ("is_default", models.BooleanField(default=False)),
                ("sort_order", models.FloatField(default=65535)),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="workspace_project_template",
                        to="db.workspace",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="projecttemplate_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="projecttemplate_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Project Template",
                "verbose_name_plural": "Project Templates",
                "db_table": "project_templates",
                "ordering": ("sort_order", "name"),
            },
        ),
        migrations.AddConstraint(
            model_name="projecttemplate",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("workspace", "name"),
                name="project_template_unique_workspace_name",
            ),
        ),

        # ── ProjectTemplateModule ──────────────────────────────────────────
        migrations.CreateModel(
            name="ProjectTemplateModule",
            fields=[
                (
                    "id",
                    models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
                ),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("sort_order", models.FloatField(default=65535)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "template",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="modules",
                        to="db.projecttemplate",
                    ),
                ),
            ],
            options={
                "verbose_name": "Project Template – Module",
                "verbose_name_plural": "Project Template – Modules",
                "db_table": "project_template_modules",
                "ordering": ("sort_order",),
            },
        ),

        # ── ProjectTemplateRequirement ─────────────────────────────────────
        migrations.CreateModel(
            name="ProjectTemplateRequirement",
            fields=[
                (
                    "id",
                    models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False),
                ),
                ("description", models.TextField()),
                ("source", models.CharField(blank=True, max_length=100)),
                ("priority", models.CharField(default="medium", max_length=20)),
                ("sort_order", models.FloatField(default=65535)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "template_module",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="requirements",
                        to="db.projecttemplatemodule",
                    ),
                ),
            ],
            options={
                "verbose_name": "Project Template – Requirement",
                "verbose_name_plural": "Project Template – Requirements",
                "db_table": "project_template_requirements",
                "ordering": ("sort_order",),
            },
        ),

        # ── Stage: add key + process_template ──────────────────────────────
        migrations.AddField(
            model_name="stage",
            name="key",
            field=models.CharField(
                blank=True,
                choices=[
                    ("req_analysis", "需求分析"),
                    ("design", "設計與規劃"),
                    ("poc", "技術 POC"),
                    ("dev", "開發"),
                    ("testing", "測試與驗收"),
                    ("deployment", "上線部署"),
                    ("maintenance", "維護"),
                    ("unsorted", "未分類"),
                ],
                max_length=50,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="stage",
            name="process_template",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="stages",
                to="db.processtemplate",
            ),
        ),

        # ── Requirement: add module FK (nullable; backfilled in 0130) ──────
        migrations.AddField(
            model_name="requirement",
            name="module",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="requirements",
                to="db.module",
            ),
        ),

        # ── Feature: add requirement FK (nullable; backfilled in 0130) ─────
        migrations.AddField(
            model_name="feature",
            name="requirement",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="features",
                to="db.requirement",
            ),
        ),

        # ── Issue: add feature/stage/process_step FKs ──────────────────────
        migrations.AddField(
            model_name="issue",
            name="feature",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.CASCADE,
                related_name="issues",
                to="db.feature",
            ),
        ),
        migrations.AddField(
            model_name="issue",
            name="stage",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="stage_issues",
                to="db.stage",
            ),
        ),
        migrations.AddField(
            model_name="issue",
            name="process_step",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="spawned_issues",
                to="db.processstep",
            ),
        ),

        # ── Project: add template_applied FK ───────────────────────────────
        migrations.AddField(
            model_name="project",
            name="template_applied",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.deletion.SET_NULL,
                related_name="projects",
                to="db.projecttemplate",
            ),
        ),
    ]
