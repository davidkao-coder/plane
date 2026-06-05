# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# TMS dashboards – cross-project overview (PM) + personal queue (dev). Phase 2.

from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Issue, IssueAssignee, Project, ProjectMember, Stage
from plane.utils.tms_health import (
    is_issue_overdue,
    stage_health,
    completion_ratio,
    rollup_project_health,
)
from plane.utils.tms_schedule import bucket_by_week, week_offset, week_start, BUCKET_ORDER

from .. import BaseAPIView

# Default weekly capacity (hours) when a member has no explicit setting.
DEFAULT_WEEKLY_CAPACITY = 40.0


class TMSDashboardEndpoint(BaseAPIView):
    """Cross-project health overview for PMs.

    GET /workspaces/<slug>/tms-dashboard/
    Returns one summary row per project the user can access, including
    rolled-up health, completion and overdue counts.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        today = timezone.now().date()

        # Projects the user is an active member of
        project_ids = ProjectMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).values_list("project_id", flat=True)

        projects = (
            Project.objects.filter(id__in=project_ids, archived_at__isnull=True)
            .select_related("template_applied")
            .order_by("name")
        )

        # Pre-aggregate stage issue counts per project (single query)
        stages = (
            Stage.objects.filter(project_id__in=project_ids, deleted_at__isnull=True)
            .exclude(key="unsorted")
            .annotate(
                total=Count("stage_issues", filter=Q(stage_issues__deleted_at__isnull=True)),
                completed=Count(
                    "stage_issues",
                    filter=Q(
                        stage_issues__deleted_at__isnull=True,
                        stage_issues__state__group__in=["completed", "cancelled"],
                    ),
                ),
            )
            .order_by("sort_order")
        )
        stages_by_project: dict = {}
        for s in stages:
            stages_by_project.setdefault(s.project_id, []).append(s)

        # Overdue issue counts per project (single query)
        overdue_qs = (
            Issue.issue_objects.filter(
                project_id__in=project_ids,
                target_date__lt=today,
            )
            .exclude(state__group__in=["completed", "cancelled"])
            .values("project_id")
            .annotate(c=Count("id"))
        )
        overdue_by_project = {row["project_id"]: row["c"] for row in overdue_qs}

        # Total / completed issue counts per project across ALL issues (not
        # just stage-tagged ones — backfilled issues have no stage). This is
        # the authoritative completion source.
        totals_qs = (
            Issue.issue_objects.filter(project_id__in=project_ids)
            .values("project_id")
            .annotate(
                total=Count("id"),
                completed=Count(
                    "id", filter=Q(state__group__in=["completed", "cancelled"])
                ),
            )
        )
        totals_by_project = {
            row["project_id"]: (row["total"], row["completed"]) for row in totals_qs
        }

        data = []
        for p in projects:
            p_stages = stages_by_project.get(p.id, [])
            stage_summaries = []
            healths = []
            for s in p_stages:
                total = s.total or 0
                completed = s.completed or 0
                h = stage_health(s.target_date, total, completed, today)
                healths.append(h)
                stage_summaries.append(
                    {
                        "id": str(s.id),
                        "key": s.key,
                        "name": s.name,
                        "target_date": s.target_date.isoformat() if s.target_date else None,
                        "total_issues": total,
                        "completed_issues": completed,
                        "health": h,
                        "completion_ratio": round(completion_ratio(total, completed), 4),
                    }
                )
            # Authoritative project-wide counts (all issues, not just tagged)
            total_all, completed_all = totals_by_project.get(p.id, (0, 0))
            overdue_count = overdue_by_project.get(p.id, 0)
            data.append(
                {
                    "id": str(p.id),
                    "name": p.name,
                    "identifier": p.identifier,
                    "client_name": p.client_name,
                    "contract_no": p.contract_no,
                    "client_pic": p.client_pic,
                    "health": rollup_project_health(
                        total_all, completed_all, overdue_count, healths
                    ),
                    "total_issues": total_all,
                    "completed_issues": completed_all,
                    "completion_ratio": round(completion_ratio(total_all, completed_all), 4),
                    "overdue_issues": overdue_count,
                    "stages": stage_summaries,
                }
            )

        # Sort worst-health first so PM sees problem projects on top
        severity = {"overdue": 4, "at_risk": 3, "no_target": 2, "on_track": 1, "done": 0, "empty": 0}
        data.sort(key=lambda d: (-severity.get(d["health"], 0), -d["overdue_issues"], d["name"]))

        return Response(data, status=status.HTTP_200_OK)


class MyQueueEndpoint(BaseAPIView):
    """Personal task queue for developers / leads.

    GET /workspaces/<slug>/my-queue/[?user_id=<uuid>]
    Returns the current user's (or, for managers, a chosen user's) open
    assigned issues bucketed by overdue / this_week / next_week / later /
    no_date.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        today = timezone.now().date()

        # Default to self; managers/admins may inspect another user's queue.
        target_user_id = request.query_params.get("user_id") or request.user.id

        # Projects the requesting user can access
        project_ids = ProjectMember.objects.filter(
            workspace__slug=slug,
            member=request.user,
            is_active=True,
        ).values_list("project_id", flat=True)

        issues = (
            Issue.issue_objects.filter(
                project_id__in=project_ids,
                issue_assignee__assignee_id=target_user_id,
                issue_assignee__deleted_at__isnull=True,
            )
            .exclude(state__group__in=["completed", "cancelled"])
            .select_related(
                "project",
                "state",
                "stage",
                "process_step",
                "feature",
                "feature__requirement",
                "feature__requirement__module",
            )
            .distinct()
            .order_by("target_date")
        )

        buckets: dict = {b: [] for b in BUCKET_ORDER}
        for i in issues:
            feat = i.feature
            req = feat.requirement if feat else None
            mod = req.module if req else None
            b = bucket_by_week(i.target_date, today)
            buckets[b].append(
                {
                    "id": str(i.id),
                    "name": i.name,
                    "sequence_id": i.sequence_id,
                    "project_id": str(i.project_id),
                    "project_name": i.project.name,
                    "project_identifier": i.project.identifier,
                    "target_date": i.target_date.isoformat() if i.target_date else None,
                    "is_overdue": is_issue_overdue(
                        i.target_date, i.state.group if i.state else None, today
                    ),
                    "priority": i.priority,
                    "estimate_hours": float(i.estimate_hours) if i.estimate_hours is not None else None,
                    "state_name": i.state.name if i.state else None,
                    "state_group": i.state.group if i.state else None,
                    "stage_name": i.stage.name if i.stage else None,
                    "process_step_name": i.process_step.name if i.process_step else None,
                    "module_name": mod.name if mod else None,
                    "feature_name": feat.name if feat else None,
                }
            )

        result = {
            "buckets": [
                {"key": b, "issues": buckets[b], "count": len(buckets[b])}
                for b in BUCKET_ORDER
            ],
            "total": sum(len(v) for v in buckets.values()),
        }
        return Response(result, status=status.HTTP_200_OK)


class CapacityEndpoint(BaseAPIView):
    """Resource capacity planner for PC / leads.

    GET /workspaces/<slug>/capacity/?weeks=4
    Returns, for each active member of accessible projects, the sum of
    estimate_hours of their OPEN assigned issues allocated to the week of
    each issue's target_date — for the next N weeks. Overdue (past weeks)
    and undated work get their own columns. Cells over weekly capacity are
    flagged so the planner can spot overload.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        today = timezone.now().date()
        try:
            num_weeks = max(1, min(12, int(request.query_params.get("weeks", 4))))
        except (TypeError, ValueError):
            num_weeks = 4

        project_ids = list(
            ProjectMember.objects.filter(
                workspace__slug=slug, member=request.user, is_active=True
            ).values_list("project_id", flat=True)
        )

        # Active members across accessible projects (deduped)
        members = (
            ProjectMember.objects.filter(
                project_id__in=project_ids, is_active=True, member__is_bot=False
            )
            .select_related("member")
            .values(
                "member_id",
                "member__display_name",
                "member__email",
                "member__avatar_url",
                "member__role",
            )
            .distinct()
        )
        member_map = {}
        for m in members:
            mid = m["member_id"]
            if mid in member_map:
                continue
            member_map[mid] = {
                "user_id": str(mid),
                "display_name": m["member__display_name"] or m["member__email"],
                "avatar_url": m["member__avatar_url"],
                "role": m["member__role"],
                "capacity": DEFAULT_WEEKLY_CAPACITY,
                # columns: overdue, week_0..week_{n-1}, undated
                "overdue": 0.0,
                "weeks": [0.0] * num_weeks,
                "undated": 0.0,
                "total": 0.0,
            }

        # Open assigned issues with an estimate
        assignees = (
            IssueAssignee.objects.filter(
                project_id__in=project_ids,
                deleted_at__isnull=True,
            )
            .exclude(issue__state__group__in=["completed", "cancelled"])
            .select_related("issue")
            .values(
                "assignee_id",
                "issue__estimate_hours",
                "issue__target_date",
            )
        )

        for a in assignees:
            mid = a["assignee_id"]
            if mid not in member_map:
                continue
            hours = float(a["issue__estimate_hours"] or 0)
            if hours <= 0:
                continue
            td = a["issue__target_date"]
            offset = week_offset(td, today)
            bucket = member_map[mid]
            bucket["total"] += hours
            if offset is None:
                bucket["undated"] += hours
            elif offset < 0:
                bucket["overdue"] += hours
            elif offset < num_weeks:
                bucket["weeks"][offset] += hours
            else:
                # beyond the visible horizon – fold into undated/“later”
                bucket["undated"] += hours

        # Week column labels (Monday date of each upcoming week)
        this_monday = week_start(today)
        week_labels = [
            (this_monday + timedelta(days=7 * i)).isoformat() for i in range(num_weeks)
        ]

        rows = sorted(member_map.values(), key=lambda r: -r["total"])
        return Response(
            {
                "weeks": num_weeks,
                "week_labels": week_labels,
                "default_capacity": DEFAULT_WEEKLY_CAPACITY,
                "members": rows,
            },
            status=status.HTTP_200_OK,
        )
