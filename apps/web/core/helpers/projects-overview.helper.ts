/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Pure functions for computing the workspace-level Projects Overview
 * (cross-project Gantt blocks + per-member loading statistics).
 *
 * Stateless / no side effects so the same calculations can be reused
 * for an Excel export later.
 */

import type { IState, IUserLite, TIssue } from "@plane/types";

// ─── View modes ──────────────────────────────────────────────────────────────

export type TOverviewMode = "project" | "main" | "sub";

// ─── Output types ────────────────────────────────────────────────────────────

export type TOverviewBlock = {
  id: string;
  name: string;
  /** Optional secondary line (e.g. project name for main / parent name for sub). */
  subtitle?: string;
  startDate: Date | null;
  targetDate: Date | null;
  /** Group key used to render hierarchy in the sidebar (e.g. projectId, parentIssueId). */
  groupId: string | null;
  groupName: string;
  // progress
  totalTasks: number;
  completedTasks: number;
  taskCompletionRate: number; // 0-100
  estimateHours: number;
  completedHours: number;
  hoursCompletionRate: number; // 0-100
};

export type TMemberLoading = {
  memberId: string;
  memberName: string;
  // Counts
  totalIssues: number;
  inProgressIssues: number;
  overdueIssues: number;
  // Hours
  estimateHours: number;
  actualHours: number;
  remainingHours: number;
  // Rates (0-100)
  taskCompletionRate: number;
  hoursCompletionRate: number;
  // Project distribution
  projectDistribution: {
    projectId: string;
    projectName: string;
    count: number;
  }[];
};

// ─── Internal helpers ────────────────────────────────────────────────────────

const round1 = (n: number) => Math.round(n * 10) / 10;

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isCompletedGroup(group: string | undefined): boolean {
  return group === "completed";
}

function isFinishedGroup(group: string | undefined): boolean {
  return group === "completed" || group === "cancelled";
}

function isStartedGroup(group: string | undefined): boolean {
  return group === "started";
}

// ─── Block computation ───────────────────────────────────────────────────────

type ProjectLike = { id: string; name: string };

/**
 * Build the Gantt blocks for the selected view mode.
 *
 * - "project": one block per project; date range derived from min/max of its
 *   issue start/target dates; progress aggregated from those issues.
 * - "main":    one block per issue with parent_id === null.
 * - "sub":     one block per issue with parent_id !== null.
 */
export function computeOverviewBlocks(
  mode: TOverviewMode,
  issues: TIssue[],
  projects: ProjectLike[],
  states: IState[]
): TOverviewBlock[] {
  const stateGroupMap = new Map<string, string>(states.map((s) => [s.id, s.group]));
  const projectMap = new Map<string, ProjectLike>(projects.map((p) => [p.id, p]));
  const issueMap = new Map<string, TIssue>(issues.map((i) => [i.id, i]));

  if (mode === "project") {
    // Aggregate per project
    type Agg = {
      total: number;
      completed: number;
      estimate: number;
      completedHours: number;
      minStart: Date | null;
      maxTarget: Date | null;
    };
    const agg = new Map<string, Agg>();
    for (const p of projects) {
      agg.set(p.id, { total: 0, completed: 0, estimate: 0, completedHours: 0, minStart: null, maxTarget: null });
    }
    for (const issue of issues) {
      const pid = issue.project_id;
      if (!pid) continue;
      let a = agg.get(pid);
      if (!a) {
        a = { total: 0, completed: 0, estimate: 0, completedHours: 0, minStart: null, maxTarget: null };
        agg.set(pid, a);
      }
      a.total++;
      const group = stateGroupMap.get(issue.state_id ?? "");
      if (isCompletedGroup(group)) a.completed++;
      a.estimate += issue.estimate_hours ?? 0;
      a.completedHours += issue.completed_hours ?? 0;
      const s = parseDate(issue.start_date);
      const t = parseDate(issue.target_date);
      if (s && (!a.minStart || s < a.minStart)) a.minStart = s;
      if (t && (!a.maxTarget || t > a.maxTarget)) a.maxTarget = t;
    }

    return [...agg.entries()]
      .map(([projectId, a]): TOverviewBlock => {
        const project = projectMap.get(projectId);
        return {
          id: projectId,
          name: project?.name ?? projectId,
          startDate: a.minStart,
          targetDate: a.maxTarget,
          groupId: null,
          groupName: "",
          totalTasks: a.total,
          completedTasks: a.completed,
          taskCompletionRate: pct(a.completed, a.total),
          estimateHours: round1(a.estimate),
          completedHours: round1(a.completedHours),
          hoursCompletionRate: pct(a.completedHours, a.estimate),
        };
      })
      .filter((b) => b.totalTasks > 0)
      .sort((a, b) => (b.totalTasks - a.totalTasks) || a.name.localeCompare(b.name));
  }

  // "main" or "sub" – iterate issues directly
  const filtered = issues.filter((i) =>
    mode === "main" ? i.parent_id === null : i.parent_id !== null
  );

  // pre-compute sub-issue rollups so a "main" block can show its subtask progress
  const childrenByParent = new Map<string, TIssue[]>();
  for (const i of issues) {
    if (i.parent_id) {
      const list = childrenByParent.get(i.parent_id);
      if (list) list.push(i);
      else childrenByParent.set(i.parent_id, [i]);
    }
  }

  return filtered
    .map((issue): TOverviewBlock => {
      const group = stateGroupMap.get(issue.state_id ?? "");
      const completed = isCompletedGroup(group) ? 1 : 0;
      const projectName = projectMap.get(issue.project_id ?? "")?.name ?? "";

      let totalTasks = 1;
      let completedTasks = completed;
      let estimateHours = issue.estimate_hours ?? 0;
      let completedHours = issue.completed_hours ?? 0;

      if (mode === "main") {
        const kids = childrenByParent.get(issue.id) ?? [];
        if (kids.length > 0) {
          totalTasks = kids.length;
          completedTasks = kids.filter((k) =>
            isCompletedGroup(stateGroupMap.get(k.state_id ?? ""))
          ).length;
          estimateHours = kids.reduce((s, k) => s + (k.estimate_hours ?? 0), 0) || estimateHours;
          completedHours = kids.reduce((s, k) => s + (k.completed_hours ?? 0), 0) || completedHours;
        }
      }

      // grouping
      const groupId =
        mode === "main"
          ? issue.project_id
          : issue.parent_id;
      const groupName =
        mode === "main"
          ? projectName
          : issueMap.get(issue.parent_id ?? "")?.name ?? "";

      return {
        id: issue.id,
        name: issue.name,
        subtitle: mode === "main" ? projectName : groupName,
        startDate: parseDate(issue.start_date),
        targetDate: parseDate(issue.target_date),
        groupId,
        groupName,
        totalTasks,
        completedTasks,
        taskCompletionRate: pct(completedTasks, totalTasks),
        estimateHours: round1(estimateHours),
        completedHours: round1(completedHours),
        hoursCompletionRate: pct(completedHours, estimateHours),
      };
    })
    .sort((a, b) => {
      const an = a.groupName.localeCompare(b.groupName);
      if (an !== 0) return an;
      const at = a.startDate ? a.startDate.getTime() : Number.POSITIVE_INFINITY;
      const bt = b.startDate ? b.startDate.getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
}

// ─── Member loading ──────────────────────────────────────────────────────────

export function computeMemberLoading(
  issues: TIssue[],
  members: IUserLite[],
  states: IState[],
  projects: ProjectLike[]
): TMemberLoading[] {
  const stateGroupMap = new Map<string, string>(states.map((s) => [s.id, s.group]));
  const memberMap = new Map<string, IUserLite>(members.map((m) => [m.id, m]));
  const projectMap = new Map<string, ProjectLike>(projects.map((p) => [p.id, p]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  type Bucket = {
    total: number;
    inProgress: number;
    overdue: number;
    completed: number;
    estimate: number;
    actual: number;
    remaining: number;
    completedHours: number;
    byProject: Map<string, number>;
  };

  const buckets = new Map<string, Bucket>();
  const bucket = (id: string): Bucket => {
    let b = buckets.get(id);
    if (!b) {
      b = {
        total: 0,
        inProgress: 0,
        overdue: 0,
        completed: 0,
        estimate: 0,
        actual: 0,
        remaining: 0,
        completedHours: 0,
        byProject: new Map(),
      };
      buckets.set(id, b);
    }
    return b;
  };

  for (const issue of issues) {
    const assignees = issue.assignee_ids?.length ? issue.assignee_ids : [];
    if (assignees.length === 0) continue; // skip unassigned for "member" loading

    const group = stateGroupMap.get(issue.state_id ?? "");
    const finished = isFinishedGroup(group);
    const completed = isCompletedGroup(group);
    const started = isStartedGroup(group);

    let overdue = false;
    if (!finished && issue.target_date) {
      const td = parseDate(issue.target_date);
      if (td && td < today) overdue = true;
    }

    for (const memberId of assignees) {
      const b = bucket(memberId);
      b.total++;
      if (started) b.inProgress++;
      if (overdue) b.overdue++;
      if (completed) b.completed++;
      b.estimate += issue.estimate_hours ?? 0;
      b.actual += issue.actual_hours ?? 0;
      b.remaining += issue.remaining_hours ?? 0;
      b.completedHours += issue.completed_hours ?? 0;
      if (issue.project_id) {
        b.byProject.set(issue.project_id, (b.byProject.get(issue.project_id) ?? 0) + 1);
      }
    }
  }

  return [...buckets.entries()]
    .map(([memberId, b]): TMemberLoading => ({
      memberId,
      memberName: memberMap.get(memberId)?.display_name ?? memberId,
      totalIssues: b.total,
      inProgressIssues: b.inProgress,
      overdueIssues: b.overdue,
      estimateHours: round1(b.estimate),
      actualHours: round1(b.actual),
      remainingHours: round1(b.remaining),
      taskCompletionRate: pct(b.completed, b.total),
      hoursCompletionRate: pct(b.completedHours, b.estimate),
      projectDistribution: [...b.byProject.entries()]
        .map(([projectId, count]) => ({
          projectId,
          projectName: projectMap.get(projectId)?.name ?? projectId,
          count,
        }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.totalIssues - a.totalIssues);
}

// ─── Date-range / scaling helpers (for the custom Gantt) ─────────────────────

export type TTimeScale = "week" | "month" | "quarter";

/**
 * Compute the visible date window for a set of blocks.
 * Falls back to a sensible default centered on today when no dates exist.
 */
export function computeDateWindow(blocks: TOverviewBlock[]): { start: Date; end: Date } {
  let min: Date | null = null;
  let max: Date | null = null;
  for (const b of blocks) {
    if (b.startDate && (!min || b.startDate < min)) min = b.startDate;
    if (b.targetDate && (!max || b.targetDate > max)) max = b.targetDate;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!min && !max) {
    // ±30 days around today
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    const end = new Date(today);
    end.setDate(end.getDate() + 60);
    return { start, end };
  }

  const start = new Date(min ?? today);
  const end = new Date(max ?? today);
  // include today
  if (today < start) start.setTime(today.getTime());
  if (today > end) end.setTime(today.getTime());
  // small padding (3 days each side)
  start.setDate(start.getDate() - 3);
  end.setDate(end.getDate() + 3);
  return { start, end };
}

/** Get a unit width (in px) for the given scale. */
export function pxPerDay(scale: TTimeScale): number {
  switch (scale) {
    case "week":
      return 32; // 32px per day → a 7-day week is 224px
    case "month":
      return 8;
    case "quarter":
    default:
      return 3;
  }
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
