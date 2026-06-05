"""
TMS Phase 2 / B4 – Risk register table.
"""

import uuid

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("db", "0134_feature_dependency"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Risk",
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
                ("title", models.CharField(max_length=255)),
                ("description", models.TextField(blank=True)),
                ("severity", models.CharField(default="medium", max_length=20)),
                ("likelihood", models.CharField(default="medium", max_length=20)),
                ("status", models.CharField(default="open", max_length=20)),
                ("mitigation", models.TextField(blank=True)),
                ("due_date", models.DateField(blank=True, null=True)),
                (
                    "owner",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="owned_risks",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "project",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="project_risk",
                        to="db.project",
                    ),
                ),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="workspace_risk",
                        to="db.workspace",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="risk_created_by",
                        to="db.user",
                        verbose_name="Created By",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="risk_updated_by",
                        to="db.user",
                        verbose_name="Last Modified By",
                    ),
                ),
            ],
            options={
                "verbose_name": "Risk",
                "verbose_name_plural": "Risks",
                "db_table": "risks",
                "ordering": ("-created_at",),
            },
        ),
    ]
