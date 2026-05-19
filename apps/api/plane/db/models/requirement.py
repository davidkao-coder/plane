# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Requirement – TMS customization.
# Stores customer / business requirements that are then mapped (M:N) to
# Features. requirement_id is human-readable "REQ-001" auto-generated.

from django.db import models, connection
from django.db.models import Q

from .project import ProjectBaseModel


PRIORITY_CHOICES = (
    ("urgent", "Urgent"),
    ("high", "High"),
    ("medium", "Medium"),
    ("low", "Low"),
    ("none", "None"),
)


def _convert_uuid_to_integer(uuid_val) -> int:
    """Same idea as plane.db.models.issue – stable int from project UUID."""
    return int(str(uuid_val).replace("-", "")[:15], 16)


class Requirement(ProjectBaseModel):
    sequence_id = models.IntegerField(default=1, verbose_name="Requirement Sequence ID")
    description = models.TextField()
    source = models.CharField(max_length=100, blank=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default="medium")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["sequence_id", "project"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_unique_seq_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Requirement"
        verbose_name_plural = "Requirements"
        db_table = "requirements"
        ordering = ("-created_at",)

    def save(self, *args, **kwargs):
        if self._state.adding:
            # Per-project transaction-level lock to avoid duplicate sequence
            lock_key = _convert_uuid_to_integer(self.project_id)
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_key])
            largest = Requirement.objects.filter(project=self.project).aggregate(
                largest=models.Max("sequence_id")
            )["largest"]
            self.sequence_id = (largest or 0) + 1
        super().save(*args, **kwargs)

    @property
    def requirement_id(self) -> str:
        """Human-readable id used in UI: REQ-001."""
        return f"REQ-{self.sequence_id:03d}"

    def __str__(self):
        return f"{self.requirement_id} {self.description[:30]}"
