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
from plane.utils.tms_schedule import weekly_bucket_key, week_offset, week_start

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

    GET /workspaces/<slug>/my-queue/[?user_id=<uuid>][&weeks=<n>]
    Returns the current user's (or, for managers, a chosen user's) open
    assigned issues bucketed by overdue / this_week / next_week / each of the
    next `weeks` weeks individually / later / no_date.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        today = timezone.now().date()
        try:
            horizon = max(2, min(8, int(request.query_params.get("weeks", 4))))
        except (TypeError, ValueError):
            horizon = 4

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

        # Dynamic bucket order: overdue, week_0..week_{horizon-1}, later, no_date
        order = (
            ["overdue"]
            + [f"week_{i}" for i in range(horizon)]
            + ["later", "no_date"]
        )
        buckets: dict = {k: [] for k in order}
        for i in issues:
            feat = i.feature
            req = feat.requirement if feat else None
            mod = req.module if req else None
            key = weekly_bucket_key(i.target_date, today, horizon)
            buckets[key].append(
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

        this_monday = week_start(today)
        week_starts = {
            f"week_{i}": (this_monday + timedelta(days=7 * i)).isoformat()
            for i in range(horizon)
        }

        result = {
            "horizon": horizon,
            "buckets": [
                {
                    "key": k,
                    "week_start": week_starts.get(k),
                    "issues": buckets[k],
                    "count": len(buckets[k]),
                }
                for k in order
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


class WeeklyReportEndpoint(BaseAPIView):
    """Auto-generated weekly progress report for a project (PC).

    GET /workspaces/<slug>/projects/<project_id>/weekly-report/
    Summarises: completed this week, currently in progress, overdue, and
    planned for next week — so the PC doesn't assemble it by hand.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        today = timezone.now().date()
        this_monday = week_start(today)
        this_sunday = this_monday + timedelta(days=6)
        next_monday = this_monday + timedelta(days=7)
        next_sunday = next_monday + timedelta(days=6)

        base = Issue.issue_objects.filter(
            project_id=project_id, workspace__slug=slug
        ).select_related("state", "stage")

        def serialize(qs, limit=200):
            out = []
            for i in qs[:limit]:
                out.append(
                    {
                        "id": str(i.id),
                        "sequence_id": i.sequence_id,
                        "name": i.name,
                        "state_name": i.state.name if i.state else None,
                        "stage_name": i.stage.name if i.stage else None,
                        "target_date": i.target_date.isoformat() if i.target_date else None,
                    }
                )
            return out

        completed_this_week = base.filter(
            state__group="completed",
            completed_at__date__gte=this_monday,
            completed_at__date__lte=this_sunday,
        )
        in_progress = base.filter(state__group="started")
        overdue = base.filter(target_date__lt=today).exclude(
            state__group__in=["completed", "cancelled"]
        )
        planned_next_week = base.filter(
            target_date__gte=next_monday, target_date__lte=next_sunday
        ).exclude(state__group__in=["completed", "cancelled"])

        return Response(
            {
                "week_start": this_monday.isoformat(),
                "week_end": this_sunday.isoformat(),
                "completed_this_week": {
                    "count": completed_this_week.count(),
                    "issues": serialize(completed_this_week),
                },
                "in_progress": {
                    "count": in_progress.count(),
                    "issues": serialize(in_progress),
                },
                "overdue": {"count": overdue.count(), "issues": serialize(overdue)},
                "planned_next_week": {
                    "count": planned_next_week.count(),
                    "issues": serialize(planned_next_week),
                },
            },
            status=status.HTTP_200_OK,
        )


class MyHoursEndpoint(BaseAPIView):
    """Personal work-hours statistics for the current user (or a chosen user).

    GET /workspaces/<slug>/my-hours/?date_from=&date_to=[&user_id=]
    Aggregates WorkLog hours: total, per-day, per-project.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        from django.db.models import Sum
        from plane.db.models import WorkLog

        target_user_id = request.query_params.get("user_id") or request.user.id
        today = timezone.now().date()
        date_from = request.query_params.get("date_from") or (
            week_start(today) - timedelta(days=21)
        ).isoformat()
        date_to = request.query_params.get("date_to") or today.isoformat()

        project_ids = ProjectMember.objects.filter(
            workspace__slug=slug, member=request.user, is_active=True
        ).values_list("project_id", flat=True)

        logs = WorkLog.objects.filter(
            project_id__in=project_ids,
            user_id=target_user_id,
            log_date__gte=date_from,
            log_date__lte=date_to,
            deleted_at__isnull=True,
        )

        total = float(logs.aggregate(t=Sum("hours")).get("t") or 0)

        by_day_qs = (
            logs.values("log_date").annotate(h=Sum("hours")).order_by("log_date")
        )
        by_day = [
            {"date": row["log_date"].isoformat(), "hours": float(row["h"] or 0)}
            for row in by_day_qs
        ]

        by_project_qs = (
            logs.values("project_id", "project__name")
            .annotate(h=Sum("hours"))
            .order_by("-h")
        )
        by_project = [
            {
                "project_id": str(row["project_id"]),
                "project_name": row["project__name"],
                "hours": float(row["h"] or 0),
            }
            for row in by_project_qs
        ]

        return Response(
            {
                "date_from": date_from,
                "date_to": date_to,
                "total_hours": total,
                "by_day": by_day,
                "by_project": by_project,
            },
            status=status.HTTP_200_OK,
        )


class DailyReportEndpoint(BaseAPIView):
    """TMS #8 — end-of-day snapshot for the workspace.

    GET /workspaces/<slug>/daily-report/?date=YYYY-MM-DD
    (date defaults to today in Asia/Taipei). Returns the stored snapshot,
    generating it on-demand if it doesn't exist yet (the Celery beat task
    pre-generates it at 23:30 Taipei each day).
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        from datetime import date as _date, datetime
        from zoneinfo import ZoneInfo
        from plane.db.models import Workspace, DailyReport
        from plane.utils.tms_daily_report import upsert_daily_report

        ws = Workspace.objects.filter(slug=slug).first()
        if ws is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        date_str = request.query_params.get("date")
        if date_str:
            try:
                report_date = _date.fromisoformat(date_str)
            except ValueError:
                return Response(
                    {"error": "date must be YYYY-MM-DD"}, status=status.HTTP_400_BAD_REQUEST
                )
        else:
            report_date = datetime.now(ZoneInfo("Asia/Taipei")).date()

        report = DailyReport.objects.filter(
            workspace=ws, report_date=report_date, deleted_at__isnull=True
        ).first()
        # Generate on-demand if missing, or refresh today's (live data).
        if report is None or report_date == datetime.now(ZoneInfo("Asia/Taipei")).date():
            report = upsert_daily_report(ws, report_date)

        return Response(
            {
                "date": report_date.isoformat(),
                "generated_at": report.generated_at.isoformat() if report.generated_at else None,
                **(report.data or {}),
            },
            status=status.HTTP_200_OK,
        )
