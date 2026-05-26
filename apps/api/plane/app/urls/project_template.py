# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    ApplyProjectTemplateEndpoint,
    ProjectTemplateModuleEndpoint,
    ProjectTemplateRequirementEndpoint,
    ProjectTemplateViewSet,
)


urlpatterns = [
    # ── Top-level templates ────────────────────────────────────────────────
    path(
        "workspaces/<str:slug>/project-templates/",
        ProjectTemplateViewSet.as_view({"get": "list", "post": "create"}),
        name="project-templates",
    ),
    path(
        "workspaces/<str:slug>/project-templates/<uuid:pk>/",
        ProjectTemplateViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="project-template-detail",
    ),
    # ── Modules nested under a template ────────────────────────────────────
    path(
        "workspaces/<str:slug>/project-templates/<uuid:template_id>/modules/",
        ProjectTemplateModuleEndpoint.as_view(),
        name="project-template-modules",
    ),
    path(
        "workspaces/<str:slug>/project-templates/<uuid:template_id>/modules/<uuid:module_id>/",
        ProjectTemplateModuleEndpoint.as_view(),
        name="project-template-module-detail",
    ),
    # ── Requirements nested under a template-module ───────────────────────
    path(
        "workspaces/<str:slug>/project-templates/<uuid:template_id>/modules/<uuid:module_id>/requirements/",
        ProjectTemplateRequirementEndpoint.as_view(),
        name="project-template-requirements",
    ),
    path(
        "workspaces/<str:slug>/project-templates/<uuid:template_id>/modules/<uuid:module_id>/requirements/<uuid:requirement_id>/",
        ProjectTemplateRequirementEndpoint.as_view(),
        name="project-template-requirement-detail",
    ),
    # ── Apply a template to an existing project ───────────────────────────
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/apply-template/",
        ApplyProjectTemplateEndpoint.as_view(),
        name="apply-project-template",
    ),
]
