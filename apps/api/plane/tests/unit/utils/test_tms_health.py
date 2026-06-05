# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
#
# Unit tests for plane.utils.tms_health pure functions (Phase 2).

from datetime import date

import pytest

from plane.utils.tms_health import (
    is_issue_overdue,
    stage_health,
    completion_ratio,
    project_health,
    rollup_project_health,
    HEALTH_DONE,
    HEALTH_OVERDUE,
    HEALTH_AT_RISK,
    HEALTH_ON_TRACK,
    HEALTH_NO_TARGET,
    HEALTH_EMPTY,
)


TODAY = date(2026, 6, 5)


@pytest.mark.unit
class TestIsIssueOverdue:
    def test_no_target_date_is_not_overdue(self):
        assert is_issue_overdue(None, "started", TODAY) is False

    def test_past_target_unstarted_is_overdue(self):
        assert is_issue_overdue(date(2026, 6, 1), "started", TODAY) is True

    def test_past_target_but_completed_is_not_overdue(self):
        assert is_issue_overdue(date(2026, 6, 1), "completed", TODAY) is False

    def test_past_target_but_cancelled_is_not_overdue(self):
        assert is_issue_overdue(date(2026, 6, 1), "cancelled", TODAY) is False

    def test_future_target_is_not_overdue(self):
        assert is_issue_overdue(date(2026, 7, 1), "started", TODAY) is False

    def test_target_exactly_today_is_not_overdue(self):
        # due today is still "on time"
        assert is_issue_overdue(TODAY, "started", TODAY) is False


@pytest.mark.unit
class TestStageHealth:
    def test_empty_stage(self):
        assert stage_health(None, 0, 0, TODAY) == HEALTH_EMPTY

    def test_all_completed_is_done(self):
        assert stage_health(date(2026, 6, 1), 5, 5, TODAY) == HEALTH_DONE

    def test_all_completed_even_past_due_is_done(self):
        # done beats overdue
        assert stage_health(date(2026, 1, 1), 3, 3, TODAY) == HEALTH_DONE

    def test_has_work_no_target(self):
        assert stage_health(None, 5, 2, TODAY) == HEALTH_NO_TARGET

    def test_past_target_not_done_is_overdue(self):
        assert stage_health(date(2026, 6, 1), 5, 2, TODAY) == HEALTH_OVERDUE

    def test_within_window_is_at_risk(self):
        # target 3 days out, not done
        assert stage_health(date(2026, 6, 8), 5, 2, TODAY) == HEALTH_AT_RISK

    def test_window_boundary_is_at_risk(self):
        # exactly 7 days out
        assert stage_health(date(2026, 6, 12), 5, 2, TODAY) == HEALTH_AT_RISK

    def test_far_future_is_on_track(self):
        # 8 days out -> on track
        assert stage_health(date(2026, 6, 13), 5, 2, TODAY) == HEALTH_ON_TRACK

    def test_custom_window(self):
        assert stage_health(date(2026, 6, 13), 5, 2, TODAY, at_risk_window=10) == HEALTH_AT_RISK


@pytest.mark.unit
class TestCompletionRatio:
    def test_zero_issues(self):
        assert completion_ratio(0, 0) == 0.0

    def test_half_done(self):
        assert completion_ratio(4, 2) == 0.5

    def test_all_done(self):
        assert completion_ratio(4, 4) == 1.0

    def test_clamp_over_one(self):
        assert completion_ratio(4, 6) == 1.0

    def test_clamp_below_zero(self):
        assert completion_ratio(4, -1) == 0.0


@pytest.mark.unit
class TestProjectHealth:
    def test_empty_list(self):
        assert project_health([]) == HEALTH_EMPTY

    def test_all_empty(self):
        assert project_health([HEALTH_EMPTY, HEALTH_EMPTY]) == HEALTH_EMPTY

    def test_all_done(self):
        assert project_health([HEALTH_DONE, HEALTH_DONE]) == HEALTH_DONE

    def test_done_and_empty_mix_is_done(self):
        assert project_health([HEALTH_DONE, HEALTH_EMPTY]) == HEALTH_DONE

    def test_overdue_wins(self):
        assert (
            project_health([HEALTH_ON_TRACK, HEALTH_OVERDUE, HEALTH_AT_RISK])
            == HEALTH_OVERDUE
        )

    def test_at_risk_beats_on_track(self):
        assert project_health([HEALTH_ON_TRACK, HEALTH_AT_RISK]) == HEALTH_AT_RISK

    def test_on_track_when_only_on_track_and_done(self):
        assert project_health([HEALTH_ON_TRACK, HEALTH_DONE]) == HEALTH_ON_TRACK


@pytest.mark.unit
class TestRollupProjectHealth:
    def test_empty_project(self):
        assert rollup_project_health(0, 0, 0, []) == HEALTH_EMPTY

    def test_all_done(self):
        assert rollup_project_health(10, 10, 0, [HEALTH_DONE]) == HEALTH_DONE

    def test_overdue_issues_make_project_overdue(self):
        # has work, not all done, 5 overdue -> overdue regardless of stages
        assert rollup_project_health(10, 3, 5, [HEALTH_EMPTY]) == HEALTH_OVERDUE

    def test_overdue_beats_stage_at_risk(self):
        assert rollup_project_health(10, 3, 2, [HEALTH_AT_RISK]) == HEALTH_OVERDUE

    def test_at_risk_when_stage_at_risk_no_overdue(self):
        assert rollup_project_health(10, 3, 0, [HEALTH_AT_RISK, HEALTH_ON_TRACK]) == HEALTH_AT_RISK

    def test_on_track_with_work_no_signal(self):
        # backfilled issues, no stage tags, nothing overdue -> on_track
        assert rollup_project_health(81, 0, 0, []) == HEALTH_ON_TRACK

    def test_done_beats_overdue_when_complete(self):
        # if everything is done, even with stale overdue count, it's done
        assert rollup_project_health(10, 10, 0, [HEALTH_DONE]) == HEALTH_DONE
