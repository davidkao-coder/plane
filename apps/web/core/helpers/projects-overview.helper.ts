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

export type TOverviewNodeType = "project" | "main" | "sub";

/**
 * Recursive node for the hierarchical tree view:
 *   project → main task (parent_id === null) → sub task (parent_id !== null)
 */
export type TOverviewNode = {
  id: string;
  type: TOverviewNodeType;
  name: string;
  subtitle?: string;
  startDate: Date | null;
  targetDate: Date | null;
  totalTasks: number;
  completedTasks: number;
  taskCompletionRate: number; // 0-100
  estimateHours: number;
  completedHours: number;
  hoursCompletionRate: number; // 0-100
  children: TOverviewNode[];
};

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

// ─── Tree (hierarchical project → main → sub) ────────────────────────────────

/**
 * Per-project module filter: project_id → Set of allowed module_ids.
 * When a project is absent from the map (or its set is empty), no filter is
 * applied for that project (all of its issues are shown).
 */
export type TModuleFilters = Map<string, Set<string>>;

/**
 * Build a 3-level tree: projects → main tasks → sub tasks.
 * Progress at each level rolls up from its children.
 *
 * If `moduleFilters` is provided, only issues whose `module_ids` intersect
 * the project's allowed module set are kept. A main task is also kept if any
 * of its sub-tasks pass the filter (so the user still sees the parent row).
 */
export function computeOverviewTree(
  issues: TIssue[],
  projects: ProjectLike[],
  states: IState[],
  moduleFilters?: TModuleFilters
): TOverviewNode[] {
  const stateGroupMap = new Map<string, string>(states.map((s) => [s.id, s.group]));
  const projectMap = new Map<string, ProjectLike>(projects.map((p) => [p.id, p]));

  const filterFor = (projectId: string): Set<string> | null => {
    if (!moduleFilters) return null;
    const set = moduleFilters.get(projectId);
    return set && set.size > 0 ? set : null;
  };

  const issuePassesFilter = (issue: TIssue): boolean => {
    const pid = issue.project_id;
    if (!pid) return true;
    const allowed = filterFor(pid);
    if (!allowed) return true;
    const mods = issue.module_ids ?? [];
    if (mods.length === 0) return false;
    for (const m of mods) if (allowed.has(m)) return true;
    return false;
  };

  // group issues by project, separating main vs sub – we delay filtering for
  // main tasks until we know whether any sub-task passes (rollup behaviour).
  type Bucket = { mains: TIssue[]; subs: TIssue[] };
  const byProject = new Map<string, Bucket>();
  for (const p of projects) byProject.set(p.id, { mains: [], subs: [] });

  for (const issue of issues) {
    const pid = issue.project_id;
    if (!pid) continue;
    let b = byProject.get(pid);
    if (!b) {
      b = { mains: [], subs: [] };
      byProject.set(pid, b);
    }
    if (issue.parent_id === null) b.mains.push(issue);
    else b.subs.push(issue);
  }

  // index subs by parent for quick lookup
  const subsByParent = new Map<string, TIssue[]>();
  for (const issue of issues) {
    if (issue.parent_id) {
      const list = subsByParent.get(issue.parent_id);
      if (list) list.push(issue);
      else subsByParent.set(issue.parent_id, [issue]);
    }
  }

  const buildSubNode = (issue: TIssue, projectName: string): TOverviewNode => {
    const group = stateGroupMap.get(issue.state_id ?? "");
    const done = isCompletedGroup(group) ? 1 : 0;
    return {
      id: issue.id,
      type: "sub",
      name: issue.name,
      subtitle: projectName,
      startDate: parseDate(issue.start_date),
      targetDate: parseDate(issue.target_date),
      totalTasks: 1,
      completedTasks: done,
      taskCompletionRate: pct(done, 1),
      estimateHours: round1(issue.estimate_hours ?? 0),
      completedHours: round1(issue.completed_hours ?? 0),
      hoursCompletionRate: pct(issue.completed_hours ?? 0, issue.estimate_hours ?? 0),
      children: [],
    };
  };

  const buildMainNode = (issue: TIssue, projectName: string): TOverviewNode => {
    const allKids = subsByParent.get(issue.id) ?? [];
    const passingKids = allKids.filter(issuePassesFilter);
    const childNodes = passingKids
      .map((k) => buildSubNode(k, projectName))
      .sort((a, b) => {
        const at = a.startDate ? a.startDate.getTime() : Number.POSITIVE_INFINITY;
        const bt = b.startDate ? b.startDate.getTime() : Number.POSITIVE_INFINITY;
        return at - bt;
      });

    // own date/progress
    const group = stateGroupMap.get(issue.state_id ?? "");
    const ownDone = isCompletedGroup(group) ? 1 : 0;

    // rollup if has kids: count children completion; else use own
    let total: number, done: number, est: number, comp: number;
    if (childNodes.length > 0) {
      total = childNodes.length;
      done = childNodes.filter((c) => c.completedTasks === 1).length;
      est = childNodes.reduce((s, c) => s + c.estimateHours, 0) || (issue.estimate_hours ?? 0);
      comp = childNodes.reduce((s, c) => s + c.completedHours, 0) || (issue.completed_hours ?? 0);
    } else {
      total = 1;
      done = ownDone;
      est = issue.estimate_hours ?? 0;
      comp = issue.completed_hours ?? 0;
    }

    return {
      id: issue.id,
      type: "main",
      name: issue.name,
      subtitle: projectName,
      startDate: parseDate(issue.start_date),
      targetDate: parseDate(issue.target_date),
      totalTasks: total,
      completedTasks: done,
      taskCompletionRate: pct(done, total),
      estimateHours: round1(est),
      completedHours: round1(comp),
      hoursCompletionRate: pct(comp, est),
      children: childNodes,
    };
  };

  const projectNodes: TOverviewNode[] = [];
  for (const [projectId, b] of byProject) {
    if (b.mains.length === 0 && b.subs.length === 0) continue;
    const project = projectMap.get(projectId);
    const projectName = project?.name ?? projectId;

    // Keep a main if it passes the filter itself OR has a sub that passes.
    const keepMain = (m: TIssue): boolean => {
      if (issuePassesFilter(m)) return true;
      const kids = subsByParent.get(m.id) ?? [];
      return kids.some(issuePassesFilter);
    };

    const mainNodes = b.mains
      .filter(keepMain)
      .map((m) => buildMainNode(m, projectName))
      .sort((a, b2) => {
        const at = a.startDate ? a.startDate.getTime() : Number.POSITIVE_INFINITY;
        const bt = b2.startDate ? b2.startDate.getTime() : Number.POSITIVE_INFINITY;
        return at - bt;
      });

    // Aggregate project-level stats over the FILTERED set so the project row
    // reflects what's actually being shown.
    const filteredIssues: TIssue[] = [];
    for (const m of b.mains) {
      const passingMain = issuePassesFilter(m);
      const passingKids = (subsByParent.get(m.id) ?? []).filter(issuePassesFilter);
      if (passingMain) filteredIssues.push(m);
      filteredIssues.push(...passingKids);
    }
    // also include orphan subs whose parents are not in this project (rare)
    for (const s of b.subs) {
      if (s.parent_id && !b.mains.some((m) => m.id === s.parent_id) && issuePassesFilter(s)) {
        filteredIssues.push(s);
      }
    }

    const totalCount = filteredIssues.length;
    const doneCount = filteredIssues.filter((i) =>
      isCompletedGroup(stateGroupMap.get(i.state_id ?? ""))
    ).length;
    const estSum = filteredIssues.reduce((s, i) => s + (i.estimate_hours ?? 0), 0);
    const compSum = filteredIssues.reduce((s, i) => s + (i.completed_hours ?? 0), 0);

    // project date range = min/max of (filtered) issue dates
    let minStart: Date | null = null;
    let maxTarget: Date | null = null;
    for (const i of filteredIssues) {
      const s = parseDate(i.start_date);
      const tt = parseDate(i.target_date);
      if (s && (!minStart || s < minStart)) minStart = s;
      if (tt && (!maxTarget || tt > maxTarget)) maxTarget = tt;
    }

    // skip empty projects after filtering (no matching issues at all)
    if (mainNodes.length === 0 && totalCount === 0) continue;

    projectNodes.push({
      id: projectId,
      type: "project",
      name: projectName,
      startDate: minStart,
      targetDate: maxTarget,
      totalTasks: totalCount,
      completedTasks: doneCount,
      taskCompletionRate: pct(doneCount, totalCount),
      estimateHours: round1(estSum),
      completedHours: round1(compSum),
      hoursCompletionRate: pct(compSum, estSum),
      children: mainNodes,
    });
  }

  return projectNodes.sort((a, b) => b.totalTasks - a.totalTasks);
}

/** Collect all date-having nodes across the entire tree (for date-window calc). */
export function flattenTreeForDateWindow(tree: TOverviewNode[]): TOverviewNode[] {
  const out: TOverviewNode[] = [];
  const walk = (n: TOverviewNode) => {
    out.push(n);
    for (const c of n.children) walk(c);
  };
  for (const n of tree) walk(n);
  return out;
}

// ─── Date-range / scaling helpers (for the custom Gantt) ─────────────────────

export type TTimeScale = "week" | "month" | "quarter";

/**
 * Compute the visible date window for a set of nodes/blocks.
 * Falls back to a sensible default centered on today when no dates exist.
 */
export function computeDateWindow(
  items: Array<{ startDate: Date | null; targetDate: Date | null }>
): { start: Date; end: Date } {
  let min: Date | null = null;
  let max: Date | null = null;
  for (const b of items) {
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
      return 36; // 1 week ≈ 252px
    case "month":
      return 16; // 1 month ≈ 480px – enough for "2/1" labels and visible bars
    case "quarter":
    default:
      return 6; // 3 months ≈ 540px
  }
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
