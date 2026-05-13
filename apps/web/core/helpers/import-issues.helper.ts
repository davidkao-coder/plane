/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IIssueLabel, IModule, IState, IUserLite, TIssuePriorities } from "@plane/types";

// ─── Types ─────────────────────────────────────────────────────────────────

export type TImportWarning = {
  row: number;
  field: string;
  message: string;
};

export type TImportError = {
  row: number;
  message: string;
  /** Optional template-args for the i18n message (e.g. `{ fields: "..." }`). */
  meta?: Record<string, string | number>;
};

export type TParsedIssueRow = {
  // raw excel row index (1-based, header = 1, data starts at 2)
  rowIndex: number;
  mainTask: string;
  subTask: string; // empty = standalone
  name: string; // computed: subTask ? `${mainTask} - ${subTask}` : mainTask
  description: string;
  stateName: string;
  priorityRaw: string;
  assigneeRaw: string[];
  labelRaw: string[];
  moduleRaw: string[];
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  actualHours: number | null;
  completedHours: number | null;
  remainingHours: number | null;
};

export type TMappedIssue = {
  rowIndex: number;
  name: string;
  description_html?: string;
  state_id: string | null;
  priority: TIssuePriorities;
  assignee_ids: string[];
  label_ids: string[];
  /** Raw label names that don't exist yet in the project – will be auto-created in the import phase. */
  unresolvedLabelNames: string[];
  module_ids: string[];
  start_date: string | null;
  target_date: string | null;
  estimate_hours: number | null;
  actual_hours: number | null;
  completed_hours: number | null;
  remaining_hours: number | null;
  // hierarchy info
  isParent: boolean;
  isChild: boolean;
  parentName: string; // the mainTask string (used to look up parent after creation)
};

export type TParseResult = {
  parents: TMappedIssue[]; // parent issues to create first (one per unique mainTask that has children)
  children: TMappedIssue[]; // child issues
  standalone: TMappedIssue[]; // standalone issues (no sub-task)
  warnings: TImportWarning[];
  errors: TImportError[];
  /** Distinct label names that aren't in the project yet and will be auto-created. */
  labelsToCreate: string[];
};

// ─── Priority map ───────────────────────────────────────────────────────────

const PRIORITY_MAP: Record<string, TIssuePriorities> = {
  緊急: "urgent",
  urgent: "urgent",
  高: "high",
  high: "high",
  中: "medium",
  medium: "medium",
  低: "low",
  low: "low",
  無: "none",
  none: "none",
};

// ─── Date helpers ───────────────────────────────────────────────────────────

function excelSerialToDate(serial: number): string | null {
  // Excel date serial: days since 1900-01-01 (with leap-year bug)
  const utc_days = serial - 25569;
  const utc_value = utc_days * 86400 * 1000;
  const date = new Date(utc_value);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function parseDate(val: unknown): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return excelSerialToDate(val);
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    // accept YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const d = new Date(trimmed);
      return isNaN(d.getTime()) ? null : trimmed;
    }
    // try generic parse
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

function parseNumber(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return isNaN(n) || n < 0 ? null : Math.round(n * 10) / 10;
}

function splitComma(val: unknown): string[] {
  if (!val || typeof val !== "string") return [];
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function cellStr(val: unknown): string {
  if (val == null) return "";
  return String(val).trim();
}

// ─── Column name constants ───────────────────────────────────────────────────

export const IMPORT_COLUMNS = {
  MAIN: "主任務",
  SUB: "子任務",
  DESC: "描述",
  STATE: "狀態",
  PRIORITY: "優先級",
  ASSIGNEES: "指派成員",
  LABELS: "標籤",
  MODULES: "模組",
  START: "開始日期",
  DUE: "截止日期",
  ESTIMATE: "預計工時",
  ACTUAL: "實際工時",
  COMPLETED: "已完成工時",
  REMAINING: "剩餘工時",
} as const;

// ─── Core parse function ─────────────────────────────────────────────────────

/**
 * Parse an ArrayBuffer of an .xlsx file into structured issue data.
 * Uses dynamic import of `xlsx` (SheetJS) to avoid SSR issues.
 */
export async function parseExcelBuffer(buffer: ArrayBuffer): Promise<{
  rows: TParsedIssueRow[];
  parseErrors: TImportError[];
}> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const sheetName = workbook.SheetNames.find((n) => n === "Issues");
  if (!sheetName) {
    return {
      rows: [],
      parseErrors: [{ row: 0, message: "error_no_sheet" }],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRowsAll: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false, // get formatted strings for dates, numbers parsed separately
  });

  // Re-read with raw=true to get numeric date serials and raw numbers
  const rawRowsRawAll: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: true,
  });

  // Normalize header keys: strip leading/trailing whitespace AND a trailing " *"
  // marker (we add " *" to required columns in the template, but the parser
  // matches against the bare column name in IMPORT_COLUMNS).
  const normalizeKey = (k: string): string =>
    k.replace(/\s*\*\s*$/, "").trim();

  const normalizeRow = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(row)) {
      out[normalizeKey(k)] = row[k];
    }
    return out;
  };

  const rawRows = rawRowsAll.map(normalizeRow);
  const rawRowsRaw = rawRowsRawAll.map(normalizeRow);

  const rows: TParsedIssueRow[] = [];
  const parseErrors: TImportError[] = [];

  rawRows.forEach((row, idx) => {
    const rowIndex = idx + 2; // header is row 1
    const rawRow = rawRowsRaw[idx] ?? {};

    // Skip completely empty rows silently.
    const anyValue = Object.values(row).some((v) => v !== "" && v != null);
    if (!anyValue) return;

    const mainTask = cellStr(row[IMPORT_COLUMNS.MAIN]);
    if (!mainTask) {
      parseErrors.push({ row: rowIndex, message: "error_no_title" });
      return;
    }

    const subTask = cellStr(row[IMPORT_COLUMNS.SUB]);
    const name = subTask ? `${mainTask} - ${subTask}` : mainTask;

    // Extract all other field values
    const description = cellStr(row[IMPORT_COLUMNS.DESC]);
    const stateName = cellStr(row[IMPORT_COLUMNS.STATE]);
    const priorityRaw = cellStr(row[IMPORT_COLUMNS.PRIORITY]);
    const assigneeRaw = splitComma(row[IMPORT_COLUMNS.ASSIGNEES]);
    const labelRaw = splitComma(row[IMPORT_COLUMNS.LABELS]);
    const moduleRaw = splitComma(row[IMPORT_COLUMNS.MODULES]);
    const startDate = parseDate(rawRow[IMPORT_COLUMNS.START] ?? row[IMPORT_COLUMNS.START]);
    const dueDate = parseDate(rawRow[IMPORT_COLUMNS.DUE] ?? row[IMPORT_COLUMNS.DUE]);
    const estimateHours = parseNumber(rawRow[IMPORT_COLUMNS.ESTIMATE] ?? row[IMPORT_COLUMNS.ESTIMATE]);
    const actualHours = parseNumber(rawRow[IMPORT_COLUMNS.ACTUAL] ?? row[IMPORT_COLUMNS.ACTUAL]);
    const completedHours = parseNumber(rawRow[IMPORT_COLUMNS.COMPLETED] ?? row[IMPORT_COLUMNS.COMPLETED]);
    const remainingHours = parseNumber(rawRow[IMPORT_COLUMNS.REMAINING] ?? row[IMPORT_COLUMNS.REMAINING]);

    // Required = everything except 子任務 and the actual/completed/remaining
    // hours columns (which auto-default to 0 when blank).
    const missing: string[] = [];
    if (!description) missing.push(IMPORT_COLUMNS.DESC);
    if (!stateName) missing.push(IMPORT_COLUMNS.STATE);
    if (!priorityRaw) missing.push(IMPORT_COLUMNS.PRIORITY);
    if (assigneeRaw.length === 0) missing.push(IMPORT_COLUMNS.ASSIGNEES);
    if (labelRaw.length === 0) missing.push(IMPORT_COLUMNS.LABELS);
    if (moduleRaw.length === 0) missing.push(IMPORT_COLUMNS.MODULES);
    if (!startDate) missing.push(IMPORT_COLUMNS.START);
    if (!dueDate) missing.push(IMPORT_COLUMNS.DUE);
    if (estimateHours == null) missing.push(IMPORT_COLUMNS.ESTIMATE);

    if (missing.length > 0) {
      parseErrors.push({
        row: rowIndex,
        message: "error_missing_fields",
        meta: { fields: missing.join("、") },
      });
      return;
    }

    rows.push({
      rowIndex,
      mainTask,
      subTask,
      name,
      description,
      stateName,
      priorityRaw,
      assigneeRaw,
      labelRaw,
      moduleRaw,
      startDate,
      dueDate,
      estimateHours,
      // Auto-default these to 0 when not provided.
      actualHours: actualHours ?? 0,
      completedHours: completedHours ?? 0,
      remainingHours: remainingHours ?? 0,
    });
  });

  return { rows, parseErrors };
}

// ─── Field mapping ───────────────────────────────────────────────────────────

export function mapRowsToIssues(
  rows: TParsedIssueRow[],
  states: IState[],
  labels: IIssueLabel[],
  members: IUserLite[],
  modules: IModule[]
): TParseResult {
  const warnings: TImportWarning[] = [];
  const errors: TImportError[] = [];

  // Build lookup maps
  const stateByName = new Map<string, IState>();
  states.forEach((s) => stateByName.set(s.name.toLowerCase().trim(), s));
  const defaultState = states.find((s) => s.default) ?? states[0] ?? null;

  const labelByName = new Map<string, IIssueLabel>();
  labels.forEach((l) => labelByName.set(l.name.toLowerCase().trim(), l));

  const moduleByName = new Map<string, IModule>();
  modules.forEach((m) => moduleByName.set(m.name.toLowerCase().trim(), m));

  const memberByEmail = new Map<string, IUserLite>();
  const memberByName = new Map<string, IUserLite>();
  members.forEach((m) => {
    if (m.email) memberByEmail.set(m.email.toLowerCase().trim(), m);
    memberByName.set(m.display_name.toLowerCase().trim(), m);
  });

  // Determine which mainTasks have children
  const mainTasksWithChildren = new Set<string>();
  rows.forEach((r) => {
    if (r.subTask) mainTasksWithChildren.add(r.mainTask);
  });

  function mapSingleRow(r: TParsedIssueRow, overrideName?: string): TMappedIssue {
    // State
    let stateId: string | null = null;
    const stateLookup = r.stateName.toLowerCase().trim();
    if (stateLookup) {
      const found = stateByName.get(stateLookup);
      if (found) {
        stateId = found.id;
      } else {
        stateId = defaultState?.id ?? null;
        warnings.push({
          row: r.rowIndex,
          field: "state",
          message: `warning_state:${r.stateName}`,
        });
      }
    } else {
      stateId = defaultState?.id ?? null;
    }

    // Priority
    const priorityKey = r.priorityRaw.toLowerCase().trim();
    const priority: TIssuePriorities = PRIORITY_MAP[priorityKey] ?? PRIORITY_MAP[r.priorityRaw] ?? "none";

    // Assignees
    const assigneeIds: string[] = [];
    r.assigneeRaw.forEach((raw) => {
      const key = raw.toLowerCase();
      const found = memberByEmail.get(key) ?? memberByName.get(key);
      if (found) {
        assigneeIds.push(found.id);
      } else {
        warnings.push({ row: r.rowIndex, field: "assignee", message: `warning_member:${raw}` });
      }
    });

    // Labels – existing ones become label_ids immediately; unknown ones are
    // collected into unresolvedLabelNames and will be auto-created by the
    // import phase. Caller can then merge the new label IDs back in.
    const labelIds: string[] = [];
    const unresolvedLabelNames: string[] = [];
    r.labelRaw.forEach((raw) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      const found = labelByName.get(trimmed.toLowerCase());
      if (found) {
        labelIds.push(found.id);
      } else {
        unresolvedLabelNames.push(trimmed);
      }
    });

    // Modules
    const moduleIds: string[] = [];
    r.moduleRaw.forEach((raw) => {
      const found = moduleByName.get(raw.toLowerCase().trim());
      if (found) {
        moduleIds.push(found.id);
      } else {
        warnings.push({ row: r.rowIndex, field: "module", message: `warning_module:${raw}` });
      }
    });

    return {
      rowIndex: r.rowIndex,
      name: overrideName ?? r.name,
      description_html: r.description ? `<p>${r.description}</p>` : undefined,
      state_id: stateId,
      priority,
      assignee_ids: assigneeIds,
      label_ids: labelIds,
      unresolvedLabelNames,
      module_ids: moduleIds,
      start_date: r.startDate,
      target_date: r.dueDate,
      estimate_hours: r.estimateHours,
      actual_hours: r.actualHours,
      completed_hours: r.completedHours,
      remaining_hours: r.remainingHours,
      isParent: false,
      isChild: false,
      parentName: r.mainTask,
    };
  }


  const parents: TMappedIssue[] = [];
  const children: TMappedIssue[] = [];
  const standalone: TMappedIssue[] = [];

  // Track which parent names have been created
  const createdParentNames = new Set<string>();
  // First pass: find first occurrence of each mainTask-with-children for parent attributes
  const firstRowByMainTask = new Map<string, TParsedIssueRow>();
  rows.forEach((r) => {
    if (mainTasksWithChildren.has(r.mainTask) && !firstRowByMainTask.has(r.mainTask)) {
      firstRowByMainTask.set(r.mainTask, r);
    }
  });

  rows.forEach((r) => {
    if (!mainTasksWithChildren.has(r.mainTask)) {
      // standalone
      const mapped = mapSingleRow(r);
      mapped.isParent = false;
      mapped.isChild = false;
      standalone.push(mapped);
    } else {
      // create parent first (once per unique mainTask)
      if (!createdParentNames.has(r.mainTask)) {
        createdParentNames.add(r.mainTask);
        const firstRow = firstRowByMainTask.get(r.mainTask)!;
        const parentMapped = mapSingleRow(firstRow, r.mainTask);
        parentMapped.isParent = true;
        parentMapped.isChild = false;
        parents.push(parentMapped);
      }
      // create child
      if (r.subTask) {
        const childMapped = mapSingleRow(r);
        childMapped.isChild = true;
        childMapped.isParent = false;
        children.push(childMapped);
      }
    }
  });

  // Collect all distinct label names that need to be created (across parents,
  // children and standalone issues). Case-insensitive dedup.
  const labelToCreateSet = new Map<string, string>(); // lowercase → original casing
  const collectFrom = (list: TMappedIssue[]) => {
    for (const m of list) {
      for (const name of m.unresolvedLabelNames) {
        const key = name.toLowerCase();
        if (!labelToCreateSet.has(key)) labelToCreateSet.set(key, name);
      }
    }
  };
  collectFrom(parents);
  collectFrom(children);
  collectFrom(standalone);
  const labelsToCreate = [...labelToCreateSet.values()];

  return { parents, children, standalone, warnings, errors, labelsToCreate };
}
