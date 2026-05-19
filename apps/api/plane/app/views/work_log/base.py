# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# WorkLog ViewSet – TMS customization.
#
# Policy enforced here (NOT on the model so management commands / data
# migrations stay clean):
#
#   * BACKFILL WINDOW: a new WorkLog's log_date must be within the last 14 days
#     (inclusive) and may not be in the future.
#   * EDIT/DELETE WINDOW: a user can edit / delete their own WorkLog only if it
#     was created within the last 7 days. Users with role == "manager" can
#     edit / delete any WorkLog.

from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import WorkLogSerializer
from plane.db.models import Issue, WorkLog

from .. import BaseViewSet


BACKFILL_DAYS = 14
SELF_EDIT_DAYS = 7


def _is_manager(user) -> bool:
    return getattr(user, "role", "member") == "manager"


class WorkLogViewSet(BaseViewSet):
    """Per-issue work logs.

    URL: /workspaces/<slug>/projects/<project_id>/issues/<issue_id>/work-logs/
    """

    serializer_class = WorkLogSerializer
    model = WorkLog

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(issue_id=self.kwargs.get("issue_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("user", "project", "workspace")
            .order_by("-log_date", "-created_at")
            .distinct()
        )

    # ─── list / create ──────────────────────────────────────────────────────

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id, issue_id):
        qs = self.get_queryset()
        # Optional filters
        user_id = request.query_params.get("user_id")
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if user_id:
            qs = qs.filter(user_id=user_id)
        if date_from:
            qs = qs.filter(log_date__gte=date_from)
        if date_to:
            qs = qs.filter(log_date__lte=date_to)
        return Response(WorkLogSerializer(qs, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id, issue_id):
        # Make sure the issue exists in this project / workspace
        try:
            Issue.objects.get(pk=issue_id, project_id=project_id, workspace__slug=slug)
        except Issue.DoesNotExist:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        # Backfill window check (skipped for managers – they can adjust historical data)
        log_date = request.data.get("log_date")
        if log_date and not _is_manager(request.user):
            try:
                from datetime import date as _date
                parsed = _date.fromisoformat(str(log_date))
            except ValueError:
                return Response(
                    {"error": "log_date must be ISO format (YYYY-MM-DD)"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            today = timezone.now().date()
            if parsed > today:
                return Response(
                    {"error": "log_date cannot be in the future"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if (today - parsed).days > BACKFILL_DAYS:
                return Response(
                    {
                        "error": (
                            f"log_date is older than {BACKFILL_DAYS} days. "
                            "Ask a manager to enter historical work logs."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = WorkLogSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(
                project_id=project_id,
                issue_id=issue_id,
                user=request.user if not request.data.get("user") else None or request.user,
            )
            # Sync denormalized cache on Issue.actual_hours
            _resync_issue_actual_hours(issue_id)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # ─── retrieve / update / delete ─────────────────────────────────────────

    def _get_object_or_404(self, slug, project_id, issue_id, pk):
        try:
            return WorkLog.objects.get(
                pk=pk,
                project_id=project_id,
                issue_id=issue_id,
                workspace__slug=slug,
            )
        except WorkLog.DoesNotExist:
            return None

    def _can_edit(self, request, work_log) -> tuple[bool, str]:
        """Edit window enforcement."""
        if _is_manager(request.user):
            return True, ""
        if work_log.user_id != request.user.id:
            return False, "You can only edit your own work logs."
        age = (timezone.now() - work_log.created_at).days
        if age > SELF_EDIT_DAYS:
            return False, f"Work logs older than {SELF_EDIT_DAYS} days are read-only."
        return True, ""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, issue_id, pk):
        wl = self._get_object_or_404(slug, project_id, issue_id, pk)
        if wl is None:
            return Response({"error": "Work log not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(WorkLogSerializer(wl).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def partial_update(self, request, slug, project_id, issue_id, pk):
        wl = self._get_object_or_404(slug, project_id, issue_id, pk)
        if wl is None:
            return Response({"error": "Work log not found"}, status=status.HTTP_404_NOT_FOUND)

        ok, reason = self._can_edit(request, wl)
        if not ok:
            return Response({"error": reason}, status=status.HTTP_403_FORBIDDEN)

        serializer = WorkLogSerializer(wl, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            _resync_issue_actual_hours(issue_id)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, issue_id, pk):
        wl = self._get_object_or_404(slug, project_id, issue_id, pk)
        if wl is None:
            return Response({"error": "Work log not found"}, status=status.HTTP_404_NOT_FOUND)

        ok, reason = self._can_edit(request, wl)
        if not ok:
            return Response({"error": reason}, status=status.HTTP_403_FORBIDDEN)

        wl.delete()
        _resync_issue_actual_hours(issue_id)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _resync_issue_actual_hours(issue_id):
    """Recompute Issue.actual_hours = SUM(WorkLog.hours).

    Kept as a denormalized cache so legacy queries that read the raw column
    stay correct until Phase 1.9 swaps them all to the Subquery annotation.
    """
    from django.db.models import Sum
    from decimal import Decimal

    total = (
        WorkLog.objects.filter(issue_id=issue_id, deleted_at__isnull=True)
        .aggregate(t=Sum("hours"))
        .get("t")
        or Decimal("0")
    )
    Issue.objects.filter(pk=issue_id).update(actual_hours=total)
