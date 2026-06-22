# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# DailyReport – TMS #8.
# End-of-day snapshot per workspace: each member's work that day (logged
# hours + items + status) and each project's progress. Generated daily by a
# Celery beat task and on-demand (generate-if-missing) by the API endpoint.

from django.db import models
from django.db.models import Q

from .base import BaseModel


class DailyReport(BaseModel):
    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.CASCADE, related_name="daily_reports"
    )
    report_date = models.DateField()
    # Full snapshot: { "per_member": [...], "per_project": [...], "totals": {...} }
    data = models.JSONField(default=dict)
    generated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "report_date"],
                condition=Q(deleted_at__isnull=True),
                name="daily_report_unique_ws_date_when_deleted_at_null",
            )
        ]
        verbose_name = "Daily Report"
        verbose_name_plural = "Daily Reports"
        db_table = "daily_reports"
        ordering = ("-report_date",)

    def __str__(self):
        return f"DailyReport {self.report_date} <{self.workspace_id}>"
