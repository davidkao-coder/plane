# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# TMS notification helpers – Phase 2 / B4.

COMPLETED_GROUPS = {"completed"}


def create_tms_notification(receiver_id, workspace_id, project_id, issue, title, message, triggered_by_id=None):
    """Create one in-app Notification row. Best-effort; callers wrap in try/except."""
    from plane.db.models import Notification

    if receiver_id is None:
        return None
    # don't notify yourself
    if triggered_by_id is not None and str(receiver_id) == str(triggered_by_id):
        return None
    return Notification.objects.create(
        workspace_id=workspace_id,
        project_id=project_id,
        entity_identifier=issue.id,
        entity_name="issue",
        title=title,
        sender="tms.workflow",
        triggered_by_id=triggered_by_id,
        receiver_id=receiver_id,
        message_html=f"<p>{message}</p>",
        message_stripped=message,
        data={
            "issue": {
                "id": str(issue.id),
                "name": issue.name,
                "sequence_id": issue.sequence_id,
            }
        },
    )


def find_next_step_issue(completed_issue):
    """Given a just-completed Issue that carries a process_step, return the
    next not-yet-done sibling Issue in the same Feature, ordered by
    (stage.sort_order, process_step.sort_order). Returns None if there is no
    successor.
    """
    from plane.db.models import Issue

    if completed_issue.feature_id is None or completed_issue.process_step_id is None:
        return None

    siblings = list(
        Issue.issue_objects.filter(feature_id=completed_issue.feature_id)
        .select_related("stage", "process_step", "state")
        .exclude(id=completed_issue.id)
    )

    def order_key(i):
        return (
            i.stage.sort_order if i.stage else 1e9,
            i.process_step.sort_order if i.process_step else 1e9,
            i.created_at,
        )

    this_key = (
        completed_issue.stage.sort_order if completed_issue.stage else 1e9,
        completed_issue.process_step.sort_order if completed_issue.process_step else 1e9,
        completed_issue.created_at,
    )

    successors = sorted(
        [i for i in siblings if order_key(i) > this_key], key=order_key
    )
    for nxt in successors:
        grp = nxt.state.group if nxt.state else None
        if grp not in {"completed", "cancelled"}:
            return nxt
    return None


def notify_next_process_step(completed_issue, triggered_by_id=None):
    """When a process-step issue is completed, notify the assignee(s) of the
    next step's issue that it's their turn. Best-effort."""
    from plane.db.models import IssueAssignee

    nxt = find_next_step_issue(completed_issue)
    if nxt is None:
        return 0

    assignee_ids = list(
        IssueAssignee.objects.filter(issue_id=nxt.id, deleted_at__isnull=True).values_list(
            "assignee_id", flat=True
        )
    )
    step_name = completed_issue.process_step.name if completed_issue.process_step else "上一個工序"
    feature_name = completed_issue.feature.name if completed_issue.feature_id else ""
    title = f"輪到你了：{nxt.name}"
    message = f"「{feature_name}」的「{step_name}」已完成，接下來該進行「{nxt.process_step.name if nxt.process_step else nxt.name}」。"

    count = 0
    for aid in assignee_ids:
        if create_tms_notification(
            receiver_id=aid,
            workspace_id=nxt.workspace_id,
            project_id=nxt.project_id,
            issue=nxt,
            title=title,
            message=message,
            triggered_by_id=triggered_by_id,
        ):
            count += 1
    return count
