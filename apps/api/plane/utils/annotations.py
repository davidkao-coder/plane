# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Shared Django ORM annotation helpers – TMS customization.

from django.db.models import OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from plane.db.models import WorkLog


def worklog_sum_subquery():
    """Subquery returning SUM(WorkLog.hours) per Issue.

    Intended for use as an annotation on Issue querysets:

        Issue.objects.annotate(actual_hours=worklog_sum_subquery())

    Phase 1 keeps Issue.actual_hours as a denormalized cache that the
    WorkLog ViewSet refreshes on every CUD; this annotation is the
    "source of truth" alternative that can be swapped in if/when the
    cache approach proves insufficient (e.g. for cross-process writes
    that don't go through the ViewSet).
    """
    return Coalesce(
        Subquery(
            WorkLog.objects.filter(
                issue_id=OuterRef("pk"),
                deleted_at__isnull=True,
            )
            .values("issue_id")
            .annotate(total=Sum("hours"))
            .values("total")
        ),
        Value(0),
    )
