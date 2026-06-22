# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views import (
    TMSDashboardEndpoint,
    MyQueueEndpoint,
    CapacityEndpoint,
    WeeklyReportEndpoint,
    MyHoursEndpoint,
    DailyReportEndpoint,
    IssueEscalateEndpoint,
    TMSExportEndpoint,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/tms-dashboard/",
        TMSDashboardEndpoint.as_view(),
        name="tms-dashboard",
    ),
    path(
        "workspaces/<str:slug>/my-queue/",
        MyQueueEndpoint.as_view(),
        name="tms-my-queue",
    ),
    path(
        "workspaces/<str:slug>/capacity/",
        CapacityEndpoint.as_view(),
        name="tms-capacity",
    ),
    path(
        "workspaces/<str:slug>/my-hours/",
        MyHoursEndpoint.as_view(),
        name="tms-my-hours",
    ),
    path(
        "workspaces/<str:slug>/daily-report/",
        DailyReportEndpoint.as_view(),
        name="tms-daily-report",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/weekly-report/",
        WeeklyReportEndpoint.as_view(),
        name="tms-weekly-report",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/export-report/",
        TMSExportEndpoint.as_view(),
        name="tms-export-report",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/escalate/",
        IssueEscalateEndpoint.as_view(),
        name="tms-issue-escalate",
    ),
]
