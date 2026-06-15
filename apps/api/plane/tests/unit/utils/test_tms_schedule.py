# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Unit tests for plane.utils.tms_schedule pure functions (Phase 2).

from datetime import date

import pytest

from plane.utils.tms_schedule import (
    week_start,
    week_offset,
    bucket_by_week,
    weekly_bucket_key,
    BUCKET_OVERDUE,
    BUCKET_THIS_WEEK,
    BUCKET_NEXT_WEEK,
    BUCKET_LATER,
    BUCKET_NO_DATE,
)

# 2026-06-05 is a Friday. Monday of that week = 2026-06-01.
FRIDAY = date(2026, 6, 5)


@pytest.mark.unit
class TestWeekStart:
    def test_friday_to_monday(self):
        assert week_start(FRIDAY) == date(2026, 6, 1)

    def test_monday_is_itself(self):
        assert week_start(date(2026, 6, 1)) == date(2026, 6, 1)

    def test_sunday_to_previous_monday(self):
        assert week_start(date(2026, 6, 7)) == date(2026, 6, 1)


@pytest.mark.unit
class TestBucketByWeek:
    def test_no_date(self):
        assert bucket_by_week(None, FRIDAY) == BUCKET_NO_DATE

    def test_yesterday_is_overdue(self):
        assert bucket_by_week(date(2026, 6, 4), FRIDAY) == BUCKET_OVERDUE

    def test_today_is_this_week(self):
        assert bucket_by_week(FRIDAY, FRIDAY) == BUCKET_THIS_WEEK

    def test_this_sunday_is_this_week(self):
        # Sunday 2026-06-07 is end of current week
        assert bucket_by_week(date(2026, 6, 7), FRIDAY) == BUCKET_THIS_WEEK

    def test_next_monday_is_next_week(self):
        assert bucket_by_week(date(2026, 6, 8), FRIDAY) == BUCKET_NEXT_WEEK

    def test_next_sunday_is_next_week(self):
        # 2026-06-14 is Sunday of next week
        assert bucket_by_week(date(2026, 6, 14), FRIDAY) == BUCKET_NEXT_WEEK

    def test_two_weeks_out_is_later(self):
        assert bucket_by_week(date(2026, 6, 15), FRIDAY) == BUCKET_LATER

    def test_far_future_is_later(self):
        assert bucket_by_week(date(2026, 12, 31), FRIDAY) == BUCKET_LATER


@pytest.mark.unit
class TestWeekOffset:
    def test_no_date(self):
        assert week_offset(None, FRIDAY) is None

    def test_today_is_zero(self):
        assert week_offset(FRIDAY, FRIDAY) == 0

    def test_this_sunday_is_zero(self):
        assert week_offset(date(2026, 6, 7), FRIDAY) == 0

    def test_next_monday_is_one(self):
        assert week_offset(date(2026, 6, 8), FRIDAY) == 1

    def test_two_weeks_out_is_two(self):
        assert week_offset(date(2026, 6, 15), FRIDAY) == 2

    def test_last_week_is_negative_one(self):
        assert week_offset(date(2026, 5, 28), FRIDAY) == -1


@pytest.mark.unit
class TestWeeklyBucketKey:
    def test_no_date(self):
        assert weekly_bucket_key(None, FRIDAY, 4) == "no_date"

    def test_overdue(self):
        # 2026-05-28 is in last week -> overdue
        assert weekly_bucket_key(date(2026, 5, 28), FRIDAY, 4) == "overdue"

    def test_this_week_is_week_0(self):
        assert weekly_bucket_key(FRIDAY, FRIDAY, 4) == "week_0"

    def test_next_week_is_week_1(self):
        assert weekly_bucket_key(date(2026, 6, 8), FRIDAY, 4) == "week_1"

    def test_third_week_is_week_2(self):
        assert weekly_bucket_key(date(2026, 6, 15), FRIDAY, 4) == "week_2"

    def test_fourth_week_is_week_3(self):
        assert weekly_bucket_key(date(2026, 6, 22), FRIDAY, 4) == "week_3"

    def test_beyond_horizon_is_later(self):
        # 5th week out with horizon 4 -> later
        assert weekly_bucket_key(date(2026, 6, 29), FRIDAY, 4) == "later"

    def test_horizon_2_collapses_third_week(self):
        assert weekly_bucket_key(date(2026, 6, 15), FRIDAY, 2) == "later"
