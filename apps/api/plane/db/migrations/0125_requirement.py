"""
TMS customization – Requirement table.
"""

from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0124_stage_and_module_stage"),
    ]

    operations = [
        migrations.CreateModel(
            name="Requirement",
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
                (
                    "sequence_id",
                    models.IntegerField(default=1, verbose_name="Requirement Sequence ID"),
                ),
                ("description", models.TextField()),
                ("source", models.CharField(blank=True, max_length=100)),
                (
                    "priority",
                    models.CharField(
                        choices=[
                            ("urgent", "Urgent"),
                            ("high", "High"),
                            ("medium", "Medium"),
                            ("low", "Low"),
                            ("none", "None"),
                        ],
                        default="medium",
                        max_length=20,
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="requirement_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=models.deletion.SET_NULL,
                        related_name="requirement_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="project_requirement",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="workspace_requirement",
                        to="db.workspace",
                    ),
                ),
            ],
            options={
                "verbose_name": "Requirement",
                "verbose_name_plural": "Requirements",
                "db_table": "requirements",
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddConstraint(
            model_name="requirement",
            constraint=models.UniqueConstraint(
                condition=models.Q(("deleted_at__isnull", True)),
                fields=("sequence_id", "project"),
                name="requirement_unique_seq_project_when_deleted_at_null",
            ),
        ),
    ]
