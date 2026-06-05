"""
TMS Phase 2 / B3 – Feature ↔ Feature dependency table.
"""

import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [("db", "0133_project_client_fields")]

    operations = [
        migrations.CreateModel(
            name="FeatureDependency",
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
                    "feature",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dependencies",
                        to="db.feature",
                    ),
                ),
                (
                    "depends_on",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dependents",
                        to="db.feature",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_featuredependency",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_featuredependency",
                        to="db.workspace",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="featuredependency_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="featuredependency_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Feature Dependency",
                "verbose_name_plural": "Feature Dependencies",
                "db_table": "feature_dependencies",
            },
        ),
        migrations.AddConstraint(
            model_name="featuredependency",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("feature", "depends_on"),
                name="feature_dependency_unique_when_deleted_at_null",
            ),
        ),
    ]
