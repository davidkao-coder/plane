# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# TMS health / overdue computation – pure functions (Phase 2).
#
# These are intentionally side-effect free (no DB access, today passed in)
# so they can be unit-tested in isolation and reused across serializers,
# dashboard endpoints and management commands.

from datetime import date
from typing import Optional

# State groups that count as "finished" work.
COMPLETED_STATE_GROUPS = {"completed", "cancelled"}

# An item whose deadline is within this many days (and not done) is "at risk".
AT_RISK_WINDOW_DAYS = 7

# Health status constants
HEALTH_DONE = "done"
HEALTH_OVERDUE = "overdue"
HEALTH_AT_RISK = "at_risk"
HEALTH_ON_TRACK = "on_track"
HEALTH_NO_TARGET = "no_target"
HEALTH_EMPTY = "empty"


def is_issue_overdue(
    target_date: Optional[date],
    state_group: Optional[str],
    today: date,
) -> bool:
    """An issue is overdue when it has a target date in the past and is not
    in a completed / cancelled state.
    """
    if target_date is None:
        return False
    if state_group in COMPLETED_STATE_GROUPS:
        return False
    return target_date < today


def stage_health(
    target_date: Optional[date],
    total_issues: int,
    completed_issues: int,
    today: date,
    at_risk_window: int = AT_RISK_WINDOW_DAYS,
) -> str:
    """Compute a health label for a Stage (or any deadline-bearing container).

    Returns one of:
      * "empty"      – no issues yet
      * "done"       – all issues completed
      * "overdue"    – target date passed, not all done
      * "at_risk"    – target date within `at_risk_window` days, not all done
      * "on_track"   – target date comfortably ahead
      * "no_target"  – has work but no target date set
    """
    if total_issues <= 0:
        return HEALTH_EMPTY
    if completed_issues >= total_issues:
        return HEALTH_DONE
    if target_date is None:
        return HEALTH_NO_TARGET
    if target_date < today:
        return HEALTH_OVERDUE
    days_left = (target_date - today).days
    if days_left <= at_risk_window:
        return HEALTH_AT_RISK
    return HEALTH_ON_TRACK


def completion_ratio(total_issues: int, completed_issues: int) -> float:
    """Fraction 0.0–1.0 of completed work. 0.0 when there are no issues."""
    if total_issues <= 0:
        return 0.0
    ratio = completed_issues / total_issues
    if ratio < 0:
        return 0.0
    if ratio > 1:
        return 1.0
    return ratio


# Severity ordering used to roll a set of stage healths up into a single
# project-level status (worst wins, ignoring done/empty).
_HEALTH_SEVERITY = {
    HEALTH_OVERDUE: 4,
    HEALTH_AT_RISK: 3,
    HEALTH_NO_TARGET: 2,
    HEALTH_ON_TRACK: 1,
    HEALTH_DONE: 0,
    HEALTH_EMPTY: 0,
}


def project_health(stage_healths: list[str]) -> str:
    """Roll up a list of per-stage health labels into one project status.

    The worst (highest-severity) non-trivial status wins. If everything is
    done/empty the project is "done" (if any work exists) or "empty".
    """
    if not stage_healths:
        return HEALTH_EMPTY
    worst = HEALTH_EMPTY
    worst_sev = -1
    for h in stage_healths:
        sev = _HEALTH_SEVERITY.get(h, 0)
        if sev > worst_sev:
            worst_sev = sev
            worst = h
    # If the worst is trivial (done/empty), decide between done and empty.
    if worst_sev == 0:
        return HEALTH_DONE if any(h == HEALTH_DONE for h in stage_healths) else HEALTH_EMPTY
    return worst


def rollup_project_health(
    total_issues: int,
    completed_issues: int,
    overdue_issues: int,
    stage_healths: list[str],
) -> str:
    """Authoritative project health that counts ALL project issues, not just
    stage-tagged ones.

    Precedence:
      * "empty"    – project has no issues at all
      * "done"     – every issue completed / cancelled
      * "overdue"  – at least one issue is past its target date
      * "at_risk"  – a stage deadline is approaching (stage health at_risk)
      * "on_track" – work in progress, nothing late
    """
    if total_issues <= 0:
        return HEALTH_EMPTY
    if completed_issues >= total_issues:
        return HEALTH_DONE
    if overdue_issues > 0:
        return HEALTH_OVERDUE
    if any(h == HEALTH_AT_RISK for h in stage_healths):
        return HEALTH_AT_RISK
    return HEALTH_ON_TRACK
