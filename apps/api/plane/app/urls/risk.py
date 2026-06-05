# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import RiskViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/risks/",
        RiskViewSet.as_view({"get": "list", "post": "create"}),
        name="project-risks",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/risks/<uuid:pk>/",
        RiskViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="project-risk-detail",
    ),
]
