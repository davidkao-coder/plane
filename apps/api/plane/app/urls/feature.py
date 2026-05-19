# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import FeatureViewSet, RequirementFeatureLinkEndpoint


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/features/",
        FeatureViewSet.as_view({"get": "list", "post": "create"}),
        name="project-features",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/features/<uuid:pk>/",
        FeatureViewSet.as_view(
            {
                "get": "retrieve",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-feature-detail",
    ),
    # Requirement ↔ Feature pivot (attach / detach / list)
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/<uuid:requirement_id>/features/",
        RequirementFeatureLinkEndpoint.as_view(),
        name="requirement-feature-links",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/<uuid:requirement_id>/features/<uuid:feature_id>/",
        RequirementFeatureLinkEndpoint.as_view(),
        name="requirement-feature-detail",
    ),
]
