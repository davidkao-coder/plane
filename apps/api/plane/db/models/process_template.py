# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# ProcessTemplate + ProcessStep – TMS customization (Phase 1.5)
#
# Workspace-level reusable definition of "the disciplines that get auto-
# spawned as Issues when a Feature is created under a Stage".
#
# Each Stage in a Project may FK to ONE ProcessTemplate; that template's
# steps determine which Issues get auto-created. The mapping is by
# convention only — a workspace typically seeds one template per stage_key
# (e.g. one for "dev", one for "design", ...) and Stages get hooked up
# during project setup.

from django.db import models
from django.db.models import Q

from .workspace import WorkspaceBaseModel


class ProcessTemplate(WorkspaceBaseModel):
    """Reusable list of disciplines / work steps tied to a stage_key.

    Created at workspace level. Seeded by migration with 7 standard
    templates (one per stage_key, except "unsorted" which has none).
    """

    name = models.CharField(max_length=255)
    stage_key = models.CharField(max_length=50)
    description = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "stage_key"],
                condition=Q(deleted_at__isnull=True),
                name="process_template_unique_workspace_stage_key",
            ),
        ]
        verbose_name = "Process Template"
        verbose_name_plural = "Process Templates"
        db_table = "process_templates"
        ordering = ("stage_key", "name")

    def __str__(self):
        return f"{self.name} <{self.workspace.slug}>"


class ProcessStep(models.Model):
    """One discipline / step inside a ProcessTemplate."""

    id = models.UUIDField(primary_key=True, default=__import__("uuid").uuid4, editable=False)
    template = models.ForeignKey(
        ProcessTemplate, on_delete=models.CASCADE, related_name="steps"
    )
    name = models.CharField(max_length=100)
    sort_order = models.FloatField(default=65535)
    # Free-text role hint (e.g. "前端工程師", "QA"). Front-end can suggest
    # values from a dropdown but doesn't enforce.
    default_role = models.CharField(max_length=50, blank=True)
    # Hours (≤ 8.0, in 0.5 steps). Engineers split larger tasks themselves.
    default_estimated_hours = models.DecimalField(
        max_digits=4, decimal_places=1, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Process Step"
        verbose_name_plural = "Process Steps"
        db_table = "process_steps"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.name} ({self.template.name})"
