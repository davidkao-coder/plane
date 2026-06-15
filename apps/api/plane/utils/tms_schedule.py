# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# TMS scheduling buckets – pure functions (Phase 2).
#
# Used by the personal task queue ("我的隊列") to group a user's assigned
# work items into overdue / this week / next week / later / someday.

from datetime import date, timedelta
from typing import Optional

BUCKET_OVERDUE = "overdue"
BUCKET_THIS_WEEK = "this_week"
BUCKET_NEXT_WEEK = "next_week"
BUCKET_LATER = "later"
BUCKET_NO_DATE = "no_date"

# Display order for the front-end
BUCKET_ORDER = [
    BUCKET_OVERDUE,
    BUCKET_THIS_WEEK,
    BUCKET_NEXT_WEEK,
    BUCKET_LATER,
    BUCKET_NO_DATE,
]


def week_start(today: date) -> date:
    """Monday of the week containing `today`."""
    return today - timedelta(days=today.weekday())


def week_offset(target_date: Optional[date], today: date) -> Optional[int]:
    """Whole-week offset of `target_date` from the week containing `today`.

      * 0   – this week
      * 1   – next week
      * -1  – last week
      * None – no target date

    Used by the capacity planner to place an item's estimate into a column.
    """
    if target_date is None:
        return None
    delta_days = (week_start(target_date) - week_start(today)).days
    return delta_days // 7


def weekly_bucket_key(target_date: Optional[date], today: date, horizon: int) -> str:
    """Bucket key for the engineer queue with per-week breakdown.

    Returns:
      * "no_date"   – no target date
      * "overdue"   – before this week
      * "week_<n>"  – n weeks ahead, for 0 <= n < horizon (0 = this week)
      * "later"     – beyond the horizon

    Unlike bucket_by_week (which collapses everything past next week into
    "later"), this gives a distinct bucket for each of the next `horizon`
    weeks so engineers can see week 3, week 4, ... separately.
    """
    if target_date is None:
        return "no_date"
    off = week_offset(target_date, today)
    if off is None:
        return "no_date"
    if off < 0:
        return "overdue"
    if off < horizon:
        return f"week_{off}"
    return "later"


def bucket_by_week(target_date: Optional[date], today: date) -> str:
    """Bucket a target date relative to today's week.

    * no target            -> "no_date"
    * target < today       -> "overdue"
    * within this week      -> "this_week"   (today .. Sunday)
    * within next week      -> "next_week"
    * beyond next week      -> "later"
    """
    if target_date is None:
        return BUCKET_NO_DATE
    if target_date < today:
        return BUCKET_OVERDUE
    this_monday = week_start(today)
    this_sunday = this_monday + timedelta(days=6)
    next_sunday = this_sunday + timedelta(days=7)
    if target_date <= this_sunday:
        return BUCKET_THIS_WEEK
    if target_date <= next_sunday:
        return BUCKET_NEXT_WEEK
    return BUCKET_LATER
