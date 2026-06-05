/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Lightweight week-based Gantt for the Workboard (Layout D) – TMS Phase 2 / B3.
 * Renders work items as horizontal bars over a weekly time axis, grouped by Stage.
 */

import { useMemo } from "react";
import { cn } from "@plane/utils";
import type { TFeatureIssue } from "@/services/feature.service";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parse(d: string | null): Date | null {
  if (!d) return null;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
}

export function GanttView({ issues }: { issues: TFeatureIssue[] }) {
  const model = useMemo(() => {
    const withDates = issues.filter((i) => i.start_date || i.target_date);
    const noDates = issues.filter((i) => !i.start_date && !i.target_date);

    if (withDates.length === 0) {
      return { weeks: [] as Date[], rows: [], noDates, rangeStart: null as Date | null };
    }

    let min = Infinity;
    let max = -Infinity;
    for (const i of withDates) {
      const s = parse(i.start_date) ?? parse(i.target_date)!;
      const t = parse(i.target_date) ?? parse(i.start_date)!;
      min = Math.min(min, s.getTime());
      max = Math.max(max, t.getTime());
    }
    // pad range to whole weeks, include today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    min = Math.min(min, today.getTime());
    max = Math.max(max, today.getTime());
    const rangeStart = startOfWeek(new Date(min));
    const rangeEnd = startOfWeek(new Date(max));
    const weeks: Date[] = [];
    for (let t = rangeStart.getTime(); t <= rangeEnd.getTime(); t += 7 * DAY_MS) {
      weeks.push(new Date(t));
    }

    // group by stage
    const byStage = new Map<string, { name: string; sortOrder: number; issues: TFeatureIssue[] }>();
    for (const i of withDates) {
      const key = i.stage_id ?? "_none";
      if (!byStage.has(key)) {
        byStage.set(key, {
          name: i.stage_name ?? "未指派階段",
          sortOrder: i.stage_sort_order ?? 99999,
          issues: [],
        });
      }
      byStage.get(key)!.issues.push(i);
    }
    const rows = [...byStage.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return { weeks, rows, noDates, rangeStart };
  }, [issues]);

  const COL = 64; // px per week
  const todayTs = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return startOfWeek(d).getTime();
  }, []);

  if (model.weeks.length === 0) {
    return (
      <div className="p-6 text-13 text-tertiary">
        沒有設定日期的工作項目，無法繪製甘特圖。請於工作項目設定開始 / 截止日期。
        {model.noDates.length > 0 && <span>（{model.noDates.length} 項無日期）</span>}
      </div>
    );
  }

  const totalWidth = model.weeks.length * COL;
  const rangeStartTs = model.rangeStart!.getTime();

  const barFor = (i: TFeatureIssue) => {
    const s = parse(i.start_date) ?? parse(i.target_date)!;
    const t = parse(i.target_date) ?? parse(i.start_date)!;
    const left = ((s.getTime() - rangeStartTs) / (7 * DAY_MS)) * COL;
    const widthDays = Math.max(1, (t.getTime() - s.getTime()) / DAY_MS + 1);
    const width = Math.max(8, (widthDays / 7) * COL);
    return { left, width };
  };

  return (
    <div className="p-4 overflow-auto">
      <div className="inline-block min-w-full">
        {/* Header: week columns */}
        <div className="flex sticky top-0 bg-surface-1 z-10">
          <div className="w-56 flex-shrink-0 border-b border-subtle px-2 py-1.5 text-11 font-semibold text-secondary">
            工作項目 / 階段
          </div>
          <div className="relative border-b border-subtle" style={{ width: totalWidth }}>
            <div className="flex">
              {model.weeks.map((w) => (
                <div
                  key={w.getTime()}
                  className={cn(
                    "text-10 text-tertiary text-center py-1.5 border-l border-subtle",
                    w.getTime() === todayTs && "bg-blue-500/10 text-blue-600 font-semibold"
                  )}
                  style={{ width: COL }}
                >
                  {w.getMonth() + 1}/{w.getDate()}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rows grouped by stage */}
        {model.rows.map((group) => (
          <div key={group.id}>
            <div className="flex bg-surface-2/40">
              <div className="w-56 flex-shrink-0 px-2 py-1 text-11 font-semibold text-secondary truncate">
                {group.name}
              </div>
              <div style={{ width: totalWidth }} />
            </div>
            {group.issues.map((i) => {
              const { left, width } = barFor(i);
              return (
                <div key={i.id} className="flex items-center hover:bg-surface-2/30 border-b border-subtle/50">
                  <div className="w-56 flex-shrink-0 px-2 py-1.5 truncate text-12" title={i.name}>
                    <span className="font-mono text-10 text-tertiary mr-1">#{i.sequence_id}</span>
                    {i.name}
                  </div>
                  <div className="relative" style={{ width: totalWidth, height: 28 }}>
                    {/* today line */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-blue-400/50"
                      style={{ left: ((todayTs - rangeStartTs) / (7 * DAY_MS)) * COL }}
                    />
                    <div
                      className={cn(
                        "absolute top-1.5 h-4 rounded text-10 text-white px-1 overflow-hidden whitespace-nowrap leading-4",
                        i.is_overdue
                          ? "bg-rose-500"
                          : i.state_group === "completed"
                            ? "bg-emerald-500"
                            : i.state_group === "started"
                              ? "bg-blue-500"
                              : "bg-slate-400"
                      )}
                      style={{ left, width }}
                      title={`${i.name}｜${i.start_date ?? "?"} ~ ${i.target_date ?? "?"}`}
                    >
                      {i.process_step_name ?? ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {model.noDates.length > 0 && (
          <div className="mt-3 text-11 text-tertiary px-2">
            另有 {model.noDates.length} 項工作項目未設定日期，未顯示於甘特圖。
          </div>
        )}
      </div>
    </div>
  );
}
