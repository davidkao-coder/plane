# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Feature – TMS customization (Phase 1.5: now strictly 1:N under Requirement).
# Sits between Requirement and Issue. Stage is NOT an attribute of Feature —
# it lives on each spawned Issue instead.

from django.db import models, connection
from django.db.models import Q

from .project import ProjectBaseModel


def _convert_uuid_to_integer(uuid_val) -> int:
    return int(str(uuid_val).replace("-", "")[:15], 16)


class Feature(ProjectBaseModel):
    sequence_id = models.IntegerField(default=1, verbose_name="Feature Sequence ID")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # TMS Phase 1.5: Feature now belongs to exactly one Requirement (1:N).
    # nullable for migration window only; backfilled to "未分類" Requirement.
    requirement = models.ForeignKey(
        "db.Requirement",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="features",
    )
    estimated_hours = models.DecimalField(
        max_digits=7, decimal_places=1, null=True, blank=True
    )
    sort_order = models.FloatField(default=65535)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["sequence_id", "project"],
                condition=Q(deleted_at__isnull=True),
                name="feature_unique_seq_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Feature"
        verbose_name_plural = "Features"
        db_table = "features"
        ordering = ("sort_order", "-created_at")

    def save(self, *args, **kwargs):
        if self._state.adding:
            lock_key = _convert_uuid_to_integer(self.project_id)
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_key])
            largest = Feature.objects.filter(project=self.project).aggregate(
                largest=models.Max("sequence_id")
            )["largest"]
            self.sequence_id = (largest or 0) + 1
        super().save(*args, **kwargs)

    @property
    def feature_id(self) -> str:
        return f"FEA-{self.sequence_id:03d}"

    def __str__(self):
        return f"{self.feature_id} {self.name}"


class RequirementFeature(ProjectBaseModel):
    """M:N pivot – Requirement ↔ Feature."""

    requirement = models.ForeignKey(
        "db.Requirement",
        on_delete=models.CASCADE,
        related_name="feature_links",
    )
    feature = models.ForeignKey(
        "db.Feature",
        on_delete=models.CASCADE,
        related_name="requirement_links",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["requirement", "feature"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_feature_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Requirement-Feature Link"
        verbose_name_plural = "Requirement-Feature Links"
        db_table = "requirement_features"
