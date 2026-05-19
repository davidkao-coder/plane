# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# WorkLog – TMS customization.
# Multiple work-log entries per Issue. Replaces the old single
# Issue.actual_hours field (which becomes a denormalized cache; see Phase 1.9).
#
# Policy decisions (per project plan):
#   * Backfill window: users may add a WorkLog dated at most 14 days ago.
#   * Edit window: a user can edit / delete their OWN WorkLog only if it is
#     ≤ 7 days old. Managers (User.role == "manager") can edit / delete any
#     WorkLog regardless of age.
#   * Enforcement of those policies lives in the API view layer, not on the
#     model itself, to keep migrations / management commands clean.

from django.db import models
from django.db.models import CheckConstraint, Q
from django.conf import settings

from .project import ProjectBaseModel


class WorkLog(ProjectBaseModel):
    issue = models.ForeignKey(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="work_logs",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="work_logs",
    )
    log_date = models.DateField()
    # 0.25 ~ 24.00 hours per entry
    hours = models.DecimalField(max_digits=5, decimal_places=2)
    note = models.TextField(blank=True)

    class Meta:
        verbose_name = "Work Log"
        verbose_name_plural = "Work Logs"
        db_table = "work_logs"
        ordering = ("-log_date", "-created_at")
        indexes = [
            models.Index(fields=["issue", "log_date"]),
            models.Index(fields=["user", "log_date"]),
        ]
        constraints = [
            CheckConstraint(
                check=Q(hours__gt=0) & Q(hours__lte=24),
                name="work_log_hours_between_0_and_24",
            ),
        ]

    def __str__(self):
        return f"{self.user_id} {self.log_date} {self.hours}h"
