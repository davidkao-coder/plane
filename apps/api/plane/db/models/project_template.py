# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# ProjectTemplate (+ Module / Requirement) – TMS customization (Phase 1.5)
#
# Workspace-level "what does a typical project of type X look like" kit.
# When a new Project is created, the user picks a ProjectTemplate and the
# system clones the template's modules + requirements into the project.
#
# The template itself does NOT carry Stages – those come from
# ProcessTemplate(s) and the 7 fixed stage_keys.

import uuid

from django.db import models
from django.db.models import Q

from .workspace import WorkspaceBaseModel


class ProjectTemplate(WorkspaceBaseModel):
    """Top-level project blueprint (e.g. "電商網站", "APP 開發")."""

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)
    is_default = models.BooleanField(default=False)
    sort_order = models.FloatField(default=65535)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="project_template_unique_workspace_name",
            ),
        ]
        verbose_name = "Project Template"
        verbose_name_plural = "Project Templates"
        db_table = "project_templates"
        ordering = ("sort_order", "name")

    def __str__(self):
        return f"{self.name} <{self.workspace.slug}>"


class ProjectTemplateModule(models.Model):
    """A business module that comes pre-bundled with a ProjectTemplate."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template = models.ForeignKey(
        ProjectTemplate, on_delete=models.CASCADE, related_name="modules"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    sort_order = models.FloatField(default=65535)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Project Template – Module"
        verbose_name_plural = "Project Template – Modules"
        db_table = "project_template_modules"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.name} ({self.template.name})"


class ProjectTemplateRequirement(models.Model):
    """An example requirement pre-bundled under a ProjectTemplateModule."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    template_module = models.ForeignKey(
        ProjectTemplateModule,
        on_delete=models.CASCADE,
        related_name="requirements",
    )
    description = models.TextField()
    source = models.CharField(max_length=100, blank=True)
    priority = models.CharField(max_length=20, default="medium")
    sort_order = models.FloatField(default=65535)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = "Project Template – Requirement"
        verbose_name_plural = "Project Template – Requirements"
        db_table = "project_template_requirements"
        ordering = ("sort_order",)

    def __str__(self):
        return f"{self.description[:30]} ({self.template_module.name})"
