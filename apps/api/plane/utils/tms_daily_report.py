# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# TMS #8 – build the end-of-day snapshot for a workspace/date:
#   per_member  – each member's logged hours + items + their open/overdue load
#   per_project – each project's totals / progress / hours logged that day

from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

DONE_GROUPS = ["completed", "cancelled"]


def _f(v):
    return float(v) if v is not None else 0.0


def build_daily_report(workspace, report_date) -> dict:
    from plane.db.models import (
        Project,
        Issue,
        IssueAssignee,
        WorkLog,
        WorkspaceMember,
        User,
    )

    # ── per project ────────────────────────────────────────────────────────
    per_project = []
    projects = (
        Project.objects.filter(
            workspace=workspace, deleted_at__isnull=True, archived_at__isnull=True
        ).order_by("name")
    )
    for p in projects:
        issues = Issue.objects.filter(project=p, deleted_at__isnull=True)
        total = issues.count()
        done = issues.filter(state__group__in=DONE_GROUPS).count()
        in_progress = issues.filter(state__group="started").count()
        overdue = (
            issues.filter(target_date__lt=report_date)
            .exclude(state__group__in=DONE_GROUPS)
            .count()
        )
        hours_today = WorkLog.objects.filter(
            project=p, log_date=report_date, deleted_at__isnull=True
        ).aggregate(s=Sum("hours"))["s"]
        per_project.append(
            {
                "project_id": str(p.id),
                "identifier": p.identifier,
                "name": p.name,
                "total": total,
                "done": done,
                "in_progress": in_progress,
                "overdue": overdue,
                "progress_pct": round(done * 100 / total) if total else 0,
                "hours_today": _f(hours_today),
            }
        )

    # ── per member ─────────────────────────────────────────────────────────
    per_member = []
    member_ids = list(
        WorkspaceMember.objects.filter(
            workspace=workspace, is_active=True, deleted_at__isnull=True
        ).values_list("member_id", flat=True)
    )
    users = User.objects.filter(id__in=member_ids, is_bot=False)
    for u in users:
        logs = WorkLog.objects.filter(
            workspace=workspace, user=u, log_date=report_date, deleted_at__isnull=True
        ).select_related("issue", "issue__state", "issue__stage", "project")
        items = []
        hours_today = Decimal("0")
        for l in logs:
            hours_today += l.hours or Decimal("0")
            iss = l.issue
            items.append(
                {
                    "issue_id": str(iss.id) if iss else None,
                    "name": iss.name if iss else "",
                    "project_name": l.project.name if l.project else "",
                    "state_name": iss.state.name if (iss and iss.state) else None,
                    "state_group": iss.state.group if (iss and iss.state) else None,
                    "stage_name": iss.stage.name if (iss and iss.stage) else None,
                    "hours": _f(l.hours),
                }
            )
        assigned = IssueAssignee.objects.filter(
            workspace=workspace,
            assignee=u,
            deleted_at__isnull=True,
            issue__deleted_at__isnull=True,
        )
        open_assigned = assigned.exclude(issue__state__group__in=DONE_GROUPS).count()
        overdue_assigned = (
            assigned.filter(issue__target_date__lt=report_date)
            .exclude(issue__state__group__in=DONE_GROUPS)
            .count()
        )
        # Keep the report concise: skip members with no activity and no open work.
        if not items and open_assigned == 0:
            continue
        per_member.append(
            {
                "user_id": str(u.id),
                "display_name": u.display_name or u.first_name or u.email,
                "email": u.email,
                "logged_hours": _f(hours_today),
                "items": items,
                "open_assigned": open_assigned,
                "overdue_assigned": overdue_assigned,
            }
        )
    per_member.sort(key=lambda m: m["logged_hours"], reverse=True)

    totals = {
        "members_reported": len(per_member),
        "logged_hours": round(sum(m["logged_hours"] for m in per_member), 2),
        "projects": len(per_project),
    }
    return {"per_member": per_member, "per_project": per_project, "totals": totals}


def upsert_daily_report(workspace, report_date):
    """Build + persist (idempotent) the snapshot for a workspace/date."""
    from plane.db.models import DailyReport

    data = build_daily_report(workspace, report_date)
    obj = DailyReport.objects.filter(
        workspace=workspace, report_date=report_date, deleted_at__isnull=True
    ).first()
    if obj:
        obj.data = data
        obj.generated_at = timezone.now()
        obj.save(update_fields=["data", "generated_at", "updated_at"])
    else:
        obj = DailyReport.objects.create(
            workspace=workspace,
            report_date=report_date,
            data=data,
            generated_at=timezone.now(),
        )
    return obj
