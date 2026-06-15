# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Stage – TMS customization
#
# Inserts a new hierarchy level between Project and Module (now relabeled
# "Category" in the UI):
#
#     Workspace → Project → Stage → Module (=Category) → Issue → Sub-Issue
#
# Stage is organizational (e.g. "需求", "開發", "驗收"); Module/Category is
# the existing sub-grouping; Issue lives under a Module as before.

from django.db import models
from django.db.models import Q

from .project import ProjectBaseModel


STAGE_KEY_CHOICES = (
    ("req_analysis", "需求分析"),
    ("design", "設計與規劃"),
    ("poc", "技術 POC"),
    ("dev", "開發"),
    ("testing", "測試與驗收"),
    ("deployment", "上線部署"),
    ("maintenance", "維護"),
    ("unsorted", "未分類"),  # 特例：default chain fallback
)


class Stage(ProjectBaseModel):
    # Stable key (one of STAGE_KEY_CHOICES) – identifies which slot this
    # Stage occupies. A Project has at most one Stage per non-"unsorted" key.
    # nullable for migration period: older Stages have key = None until
    # backfilled.
    key = models.CharField(
        max_length=50, choices=STAGE_KEY_CHOICES, null=True, blank=True
    )
    name = models.CharField(max_length=255, verbose_name="Stage Name")
    description = models.TextField(verbose_name="Stage Description", blank=True)
    sort_order = models.FloatField(default=65535)
    start_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    logo_props = models.JSONField(default=dict)
    external_source = models.CharField(max_length=255, null=True, blank=True)
    external_id = models.CharField(max_length=255, null=True, blank=True)
    # FK → ProcessTemplate (which workflow runs when Features are created
    # under this Stage). nullable: maintenance / unsorted Stages may have no
    # default workflow.
    process_template = models.ForeignKey(
        "db.ProcessTemplate",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stages",
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True),
                name="stage_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Stage"
        verbose_name_plural = "Stages"
        db_table = "stages"
        ordering = ("sort_order", "-created_at")

    def save(self, *args, **kwargs):
        # TMS Phase 2: only auto-assign sort_order when the caller didn't set
        # one explicitly (i.e. it's still the default 65535). This preserves
        # the seeded standard-stage order (100..700) and the unsorted=9999
        # slot, while manually-added stages append AFTER the standard ones
        # (largest + 100) rather than jumping to the front and breaking the
        # 需求分析→…→維護 ordering.
        if self._state.adding and self.sort_order == 65535:
            largest = (
                Stage.objects.filter(project=self.project)
                .exclude(key="unsorted")
                .aggregate(largest=models.Max("sort_order"))["largest"]
            )
            self.sort_order = (largest or 0) + 100
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} <{self.project.name}>"
