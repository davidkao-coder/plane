# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import ProcessTemplateViewSet, ProcessStepBulkEndpoint


urlpatterns = [
    path(
        "workspaces/<str:slug>/process-templates/",
        ProcessTemplateViewSet.as_view({"get": "list", "post": "create"}),
        name="process-templates",
    ),
    path(
        "workspaces/<str:slug>/process-templates/<uuid:pk>/",
        ProcessTemplateViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="process-template-detail",
    ),
    path(
        "workspaces/<str:slug>/process-templates/<uuid:template_id>/steps/",
        ProcessStepBulkEndpoint.as_view(),
        name="process-template-steps",
    ),
]
