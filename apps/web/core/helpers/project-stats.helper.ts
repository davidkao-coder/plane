/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Pure functions for computing project statistics from a flat list of issues.
 * No side effects, no store access — easy to test and reuse.
 */

import type { IIssueLabel, IModule, IState, IUserLite, TIssue } from "@plane/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TOverviewStats = {
  total: number;
  completed: number;
  inProgress: number;
  unstarted: number;
  cancelled: number;
  completionRate: number; // 0-100
};

export type THoursStats = {
  estimateHours: number;
  actualHours: number;
  completedHours: number;
  remainingHours: number;
  hoursCompletionRate: number; // 0-100, completed/estimate
  hoursVariance: number; // actual - estimate (positive = over budget)
};

export type TRiskIssue = {
  id: string;
  name: string;
  priority: string;
  targetDate: string | null;
  assigneeNames: string[];
};

export type TRiskStats = {
  overdue: TRiskIssue[];
  dueSoon: TRiskIssue[];
  highPriorityUnfinished: TRiskIssue[];
};

export type TMemberHours = {
  memberId: string;
  memberName: string;
  issueCount: number;
  estimateHours: number;
  actualHours: number;
  completedHours: number;
  remainingHours: number;
};

export type TModuleProgress = {
  moduleId: string;
  moduleName: string;
  issueCount: number;
  completedCount: number;
  completionRate: number; // 0-100
  estimateHours: number;
  actualHours: number;
  remainingHours: number;
};

export type TProjectStats = {
  overview: TOverviewStats;
  hours: THoursStats;
  risk: TRiskStats;
  memberHours: TMemberHours[];
  moduleProgress: TModuleProgress[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DONE_GROUPS = new Set(["completed", "cancelled"]);
const ACTIVE_GROUPS = new Set(["started", "unstarted", "backlog"]);

function isCompleted(issue: TIssue, stateGroupMap: Map<string, string>): boolean {
  const g = stateGroupMap.get(issue.state_id ?? "") ?? "";
  return g === "completed";
}

function isActive(issue: TIssue, stateGroupMap: Map<string, string>): boolean {
  const g = stateGroupMap.get(issue.state_id ?? "") ?? "";
  return ACTIVE_GROUPS.has(g);
}

function isFinished(issue: TIssue, stateGroupMap: Map<string, string>): boolean {
  const g = stateGroupMap.get(issue.state_id ?? "") ?? "";
  return DONE_GROUPS.has(g);
}

// ─── Main compute function ────────────────────────────────────────────────────

export function computeProjectStats(
  issues: TIssue[],
  states: IState[],
  members: IUserLite[],
  modules: IModule[]
): TProjectStats {
  // Build lookup maps
  const stateGroupMap = new Map<string, string>(states.map((s) => [s.id, s.group]));
  const memberMap = new Map<string, IUserLite>(members.map((m) => [m.id, m]));
  const moduleMap = new Map<string, IModule>(modules.map((m) => [m.id, m]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(today.getDate() + 7);

  // ── Overview ────────────────────────────────────────────────────────────────
  let completed = 0;
  let inProgress = 0;
  let unstarted = 0;
  let cancelled = 0;

  for (const issue of issues) {
    const g = stateGroupMap.get(issue.state_id ?? "") ?? "unstarted";
    if (g === "completed") completed++;
    else if (g === "started") inProgress++;
    else if (g === "cancelled") cancelled++;
    else unstarted++; // backlog + unstarted
  }

  const total = issues.length;
  const overview: TOverviewStats = {
    total,
    completed,
    inProgress,
    unstarted,
    cancelled,
    completionRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
  };

  // ── Hours ───────────────────────────────────────────────────────────────────
  let estimateHours = 0;
  let actualHours = 0;
  let completedHours = 0;
  let remainingHours = 0;

  for (const issue of issues) {
    estimateHours += issue.estimate_hours ?? 0;
    actualHours += issue.actual_hours ?? 0;
    completedHours += issue.completed_hours ?? 0;
    remainingHours += issue.remaining_hours ?? 0;
  }

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const hours: THoursStats = {
    estimateHours: round1(estimateHours),
    actualHours: round1(actualHours),
    completedHours: round1(completedHours),
    remainingHours: round1(remainingHours),
    hoursCompletionRate:
      estimateHours > 0 ? Math.round((completedHours / estimateHours) * 1000) / 10 : 0,
    hoursVariance: round1(actualHours - estimateHours),
  };

  // ── Risk ────────────────────────────────────────────────────────────────────
  const toRiskIssue = (issue: TIssue): TRiskIssue => ({
    id: issue.id,
    name: issue.name,
    priority: issue.priority ?? "none",
    targetDate: issue.target_date,
    assigneeNames: (issue.assignee_ids ?? [])
      .map((id) => memberMap.get(id)?.display_name ?? id)
      .filter(Boolean),
  });

  const overdueList: TRiskIssue[] = [];
  const dueSoonList: TRiskIssue[] = [];
  const highPriorityList: TRiskIssue[] = [];

  for (const issue of issues) {
    if (isFinished(issue, stateGroupMap)) continue;

    if (issue.target_date) {
      const dueDate = new Date(issue.target_date);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate < today) {
        overdueList.push(toRiskIssue(issue));
      } else if (dueDate <= in7Days) {
        dueSoonList.push(toRiskIssue(issue));
      }
    }

    if (issue.priority === "urgent" || issue.priority === "high") {
      highPriorityList.push(toRiskIssue(issue));
    }
  }

  const risk: TRiskStats = {
    overdue: overdueList,
    dueSoon: dueSoonList,
    highPriorityUnfinished: highPriorityList,
  };

  // ── Member hours ─────────────────────────────────────────────────────────────
  const memberDataMap = new Map<
    string,
    { issueCount: number; est: number; act: number; comp: number; rem: number }
  >();

  for (const issue of issues) {
    const ids = issue.assignee_ids?.length ? issue.assignee_ids : ["__unassigned__"];
    for (const memberId of ids) {
      if (!memberDataMap.has(memberId)) {
        memberDataMap.set(memberId, { issueCount: 0, est: 0, act: 0, comp: 0, rem: 0 });
      }
      const d = memberDataMap.get(memberId)!;
      d.issueCount++;
      d.est += issue.estimate_hours ?? 0;
      d.act += issue.actual_hours ?? 0;
      d.comp += issue.completed_hours ?? 0;
      d.rem += issue.remaining_hours ?? 0;
    }
  }

  const memberHours: TMemberHours[] = [...memberDataMap.entries()]
    .map(([memberId, d]) => ({
      memberId,
      memberName: memberMap.get(memberId)?.display_name ?? "(未指派)",
      issueCount: d.issueCount,
      estimateHours: round1(d.est),
      actualHours: round1(d.act),
      completedHours: round1(d.comp),
      remainingHours: round1(d.rem),
    }))
    .sort((a, b) => b.issueCount - a.issueCount);

  // ── Module progress ──────────────────────────────────────────────────────────
  const moduleDataMap = new Map<
    string,
    { count: number; completedCount: number; est: number; act: number; rem: number }
  >();

  // Ensure all modules appear even with zero issues
  modules.forEach((m) => {
    if (!moduleDataMap.has(m.id)) {
      moduleDataMap.set(m.id, { count: 0, completedCount: 0, est: 0, act: 0, rem: 0 });
    }
  });

  for (const issue of issues) {
    const moduleIds = issue.module_ids?.length ? issue.module_ids : ["__none__"];
    for (const moduleId of moduleIds) {
      if (!moduleDataMap.has(moduleId)) {
        moduleDataMap.set(moduleId, { count: 0, completedCount: 0, est: 0, act: 0, rem: 0 });
      }
      const d = moduleDataMap.get(moduleId)!;
      d.count++;
      if (isCompleted(issue, stateGroupMap)) d.completedCount++;
      d.est += issue.estimate_hours ?? 0;
      d.act += issue.actual_hours ?? 0;
      d.rem += issue.remaining_hours ?? 0;
    }
  }

  const moduleProgress: TModuleProgress[] = [...moduleDataMap.entries()]
    .map(([moduleId, d]) => ({
      moduleId,
      moduleName: moduleMap.get(moduleId)?.name ?? "(未指定模組)",
      issueCount: d.count,
      completedCount: d.completedCount,
      completionRate: d.count > 0 ? Math.round((d.completedCount / d.count) * 1000) / 10 : 0,
      estimateHours: round1(d.est),
      actualHours: round1(d.act),
      remainingHours: round1(d.rem),
    }))
    .filter((m) => m.moduleId !== "__none__" || m.issueCount > 0)
    .sort((a, b) => b.issueCount - a.issueCount);

  return { overview, hours, risk, memberHours, moduleProgress };
}
