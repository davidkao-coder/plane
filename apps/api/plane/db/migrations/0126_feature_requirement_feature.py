"""
TMS customization – Feature + RequirementFeature pivot.
"""

from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0125_requirement"),
    ]

    operations = [
        migrations.CreateModel(
            name="Feature",
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
                ("sequence_id", models.IntegerField(default=1, verbose_name="Feature Sequence ID")),
                ("name", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("estimated_hours", models.DecimalField(blank=True, decimal_places=1, max_digits=7, null=True)),
                ("sort_order", models.FloatField(default=65535)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="feature_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="feature_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="project_feature",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="workspace_feature",
                        to="db.workspace",
                    ),
                ),
                (
                    "stage",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="stage_features",
                        to="db.stage",
                    ),
                ),
            ],
            options={
                "verbose_name": "Feature",
                "verbose_name_plural": "Features",
                "db_table": "features",
                "ordering": ("sort_order", "-created_at"),
            },
        ),
        migrations.AddConstraint(
            model_name="feature",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("sequence_id", "project"),
                name="feature_unique_seq_project_when_deleted_at_null",
            ),
        ),
        migrations.CreateModel(
            name="RequirementFeature",
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
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="requirementfeature_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="requirementfeature_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="project_requirementfeature",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="workspace_requirementfeature",
                        to="db.workspace",
                    ),
                ),
                (
                    "requirement",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="feature_links",
                        to="db.requirement",
                    ),
                ),
                (
                    "feature",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="requirement_links",
                        to="db.feature",
                    ),
                ),
            ],
            options={
                "verbose_name": "Requirement-Feature Link",
                "verbose_name_plural": "Requirement-Feature Links",
                "db_table": "requirement_features",
            },
        ),
        migrations.AddConstraint(
            model_name="requirementfeature",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("requirement", "feature"),
                name="requirement_feature_unique_when_deleted_at_null",
            ),
        ),
    ]
