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
  key: "overdue" | "this_week" | "next_week" | "later" | "no_date";
  issues: TQueueIssue[];
  count: number;
};

export type TMyQueue = {
  buckets: TQueueBucket[];
  total: number;
};

export type TCapacityMember = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
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

  async getMyQueue(slug: string, userId?: string): Promise<TMyQueue> {
    return this.get(`/api/workspaces/${slug}/my-queue/`, {
      params: userId ? { user_id: userId } : {},
    })
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
}
