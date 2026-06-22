/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * TMS dashboards – cross-project overview + personal queue (Phase 2).
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type THealth = "done" | "overdue" | "at_risk" | "on_track" | "no_target" | "empty";

export type TDashboardStage = {
  id: string;
  key: string | null;
  name: string;
  target_date: string | null;
  total_issues: number;
  completed_issues: number;
  health: THealth;
  completion_ratio: number;
};

export type TDashboardProject = {
  id: string;
  name: string;
  identifier: string;
  client_name: string;
  contract_no: string;
  client_pic: string;
  health: THealth;
  total_issues: number;
  completed_issues: number;
  completion_ratio: number;
  overdue_issues: number;
  stages: TDashboardStage[];
};

export type TQueueIssue = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  project_name: string;
  project_identifier: string;
  target_date: string | null;
  is_overdue: boolean;
  priority: string;
  estimate_hours: number | null;
  state_name: string | null;
  state_group: string | null;
  stage_name: string | null;
  process_step_name: string | null;
  module_name: string | null;
  feature_name: string | null;
};

export type TQueueBucket = {
  /** "overdue" | "week_0" | "week_1" | ... | "later" | "no_date" */
  key: string;
  /** Monday ISO date for week_<n> buckets; null otherwise */
  week_start?: string | null;
  issues: TQueueIssue[];
  count: number;
};

export type TMyQueue = {
  horizon: number;
  buckets: TQueueBucket[];
  total: number;
};

export type TDailyReportItem = {
  issue_id: string | null;
  name: string;
  project_name: string;
  state_name: string | null;
  state_group: string | null;
  stage_name: string | null;
  hours: number;
};

export type TDailyReportMember = {
  user_id: string;
  display_name: string;
  email: string;
  logged_hours: number;
  items: TDailyReportItem[];
  open_assigned: number;
  overdue_assigned: number;
};

export type TDailyReportProject = {
  project_id: string;
  identifier: string;
  name: string;
  total: number;
  done: number;
  in_progress: number;
  overdue: number;
  progress_pct: number;
  hours_today: number;
};

export type TDailyReport = {
  date: string;
  generated_at: string | null;
  per_member: TDailyReportMember[];
  per_project: TDailyReportProject[];
  totals: { members_reported: number; logged_hours: number; projects: number };
};

export type TReportIssue = {
  id: string;
  sequence_id: number;
  name: string;
  state_name: string | null;
  stage_name: string | null;
  target_date: string | null;
};

export type TCapacityMember = {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  role: string;
  capacity: number;
  overdue: number;
  weeks: number[];
  undated: number;
  total: number;
};

export type TCapacity = {
  weeks: number;
  week_labels: string[];
  default_capacity: number;
  members: TCapacityMember[];
};

export class TMSDashboardService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getDashboard(slug: string): Promise<TDashboardProject[]> {
    return this.get(`/api/workspaces/${slug}/tms-dashboard/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async getMyQueue(slug: string, opts: { userId?: string; weeks?: number } = {}): Promise<TMyQueue> {
    const params: Record<string, string | number> = {};
    if (opts.userId) params.user_id = opts.userId;
    if (opts.weeks) params.weeks = opts.weeks;
    return this.get(`/api/workspaces/${slug}/my-queue/`, { params })
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async getCapacity(slug: string, weeks = 4): Promise<TCapacity> {
    return this.get(`/api/workspaces/${slug}/capacity/`, { params: { weeks } })
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async getWeeklyReport(
    slug: string,
    projectId: string
  ): Promise<{
    week_start: string;
    week_end: string;
    completed_this_week: { count: number; issues: TReportIssue[] };
    in_progress: { count: number; issues: TReportIssue[] };
    overdue: { count: number; issues: TReportIssue[] };
    planned_next_week: { count: number; issues: TReportIssue[] };
  }> {
    return this.get(`/api/workspaces/${slug}/projects/${projectId}/weekly-report/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async escalateIssue(
    slug: string,
    projectId: string,
    issueId: string,
    reason: string
  ): Promise<{ escalated: boolean; notified: number; priority: string }> {
    return this.post(
      `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/escalate/`,
      { reason }
    )
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  /** Build the export-report download URL (auth via session cookie). */
  exportReportUrl(slug: string, projectId: string): string {
    return `/api/workspaces/${slug}/projects/${projectId}/export-report/`;
  }

  async getMyHours(
    slug: string,
    opts: { user_id?: string; date_from?: string; date_to?: string } = {}
  ): Promise<{
    date_from: string;
    date_to: string;
    total_hours: number;
    by_day: { date: string; hours: number }[];
    by_project: { project_id: string; project_name: string; hours: number }[];
  }> {
    return this.get(`/api/workspaces/${slug}/my-hours/`, { params: opts })
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async getDailyReport(slug: string, date?: string): Promise<TDailyReport> {
    return this.get(`/api/workspaces/${slug}/daily-report/`, { params: date ? { date } : {} })
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}
