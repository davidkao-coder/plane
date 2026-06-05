# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Risk register – TMS Phase 2 / B4.
# Lets the PC log, track and close project risks ("客戶下週要驗收但前端只
#完成 80%").

from django.conf import settings
from django.db import models

from .project import ProjectBaseModel


SEVERITY_CHOICES = (
    ("low", "Low"),
    ("medium", "Medium"),
    ("high", "High"),
    ("critical", "Critical"),
)

LIKELIHOOD_CHOICES = (
    ("low", "Low"),
    ("medium", "Medium"),
    ("high", "High"),
)

RISK_STATUS_CHOICES = (
    ("open", "Open"),
    ("mitigating", "Mitigating"),
    ("closed", "Closed"),
)


class Risk(ProjectBaseModel):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default="medium")
    likelihood = models.CharField(max_length=20, choices=LIKELIHOOD_CHOICES, default="medium")
    status = models.CharField(max_length=20, choices=RISK_STATUS_CHOICES, default="open")
    mitigation = models.TextField(blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="owned_risks",
    )
    due_date = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name = "Risk"
        verbose_name_plural = "Risks"
        db_table = "risks"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.title} <{self.project_id}>"
