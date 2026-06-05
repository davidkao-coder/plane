# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Quick problem escalation – TMS Phase 2 / B4.
# Lets a developer flag a blocked / problematic work item up to the project
# leads (PC/PM) in one action: bumps priority, drops a comment, notifies.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.db.models import Issue, IssueComment, ProjectMember
from plane.utils.tms_notify import create_tms_notification

from .. import BaseAPIView


class IssueEscalateEndpoint(BaseAPIView):
    """POST /workspaces/<slug>/projects/<pid>/issues/<iid>/escalate/
    Body: { "reason": "卡在第三方 API 沒有測試金鑰" }

    Effects:
      * sets the issue priority to "urgent"
      * adds a comment with the reason (prefixed 🚩 回報問題)
      * notifies the project lead + project admins
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id, issue_id):
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return Response({"error": "reason is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            issue = Issue.objects.select_related("project").get(
                pk=issue_id, project_id=project_id, workspace__slug=slug
            )
        except Issue.DoesNotExist:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # 1) bump priority
        if issue.priority != "urgent":
            issue.priority = "urgent"
            issue.updated_by = request.user
            issue.save(update_fields=["priority", "updated_by", "updated_at"])

        # 2) comment
        comment_text = f"🚩 回報問題：{reason}"
        IssueComment.objects.create(
            issue=issue,
            project_id=project_id,
            workspace=issue.workspace,
            actor=request.user,
            created_by=request.user,
            updated_by=request.user,
            comment_stripped=comment_text,
            comment_html=f"<p>🚩 <b>回報問題</b>：{reason}</p>",
        )

        # 3) notify project leads + admins (role >= 20), plus project_lead
        receiver_ids = set(
            ProjectMember.objects.filter(
                project_id=project_id, is_active=True, role__gte=20
            ).values_list("member_id", flat=True)
        )
        if issue.project.project_lead_id:
            receiver_ids.add(issue.project.project_lead_id)
        receiver_ids.discard(request.user.id)

        title = f"問題回報：{issue.name}"
        message = f"{request.user.display_name or request.user.email} 回報了問題：{reason}"
        notified = 0
        for rid in receiver_ids:
            if create_tms_notification(
                receiver_id=rid,
                workspace_id=issue.workspace_id,
                project_id=project_id,
                issue=issue,
                title=title,
                message=message,
                triggered_by_id=request.user.id,
            ):
                notified += 1

        return Response(
            {"escalated": True, "notified": notified, "priority": issue.priority},
            status=status.HTTP_200_OK,
        )
