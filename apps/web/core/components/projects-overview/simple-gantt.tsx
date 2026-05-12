/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Lightweight read-only Gantt for the Projects Overview page.
 *
 * Renders a sidebar of names + a horizontally scrollable timeline.
 * Blocks are absolutely positioned bars colored by completion %.
 * No drag / resize / dependency edges – just a clean exec view.
 */

import { useMemo, useRef, useEffect } from "react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// helpers
import {
  daysBetween,
  pxPerDay,
  type TOverviewBlock,
  type TTimeScale,
} from "@/helpers/projects-overview.helper";

const SIDEBAR_WIDTH = 320;
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 56;
const BAR_HEIGHT = 22;

type Props = {
  blocks: TOverviewBlock[];
  windowStart: Date;
  windowEnd: Date;
  scale: TTimeScale;
};

// ─── Header ticks ────────────────────────────────────────────────────────────

type Tick = { date: Date; label: string; isMajor: boolean };

function buildTicks(start: Date, end: Date, scale: TTimeScale): Tick[] {
  const ticks: Tick[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);

  if (scale === "week") {
    while (d <= end) {
      const isMajor = d.getDay() === 1; // Monday
      ticks.push({
        date: new Date(d),
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        isMajor,
      });
      d.setDate(d.getDate() + 1);
    }
  } else if (scale === "month") {
    while (d <= end) {
      const isMajor = d.getDate() === 1;
      const showLabel = d.getDate() === 1 || d.getDate() === 15;
      ticks.push({
        date: new Date(d),
        label: showLabel ? `${d.getMonth() + 1}/${d.getDate()}` : "",
        isMajor,
      });
      d.setDate(d.getDate() + 1);
    }
  } else {
    // quarter
    while (d <= end) {
      const isMajor = d.getDate() === 1;
      const showLabel = d.getDate() === 1;
      ticks.push({
        date: new Date(d),
        label: showLabel ? `${d.getFullYear()}/${d.getMonth() + 1}` : "",
        isMajor,
      });
      d.setDate(d.getDate() + 1);
    }
  }
  return ticks;
}

function progressColor(rate: number): string {
  if (rate >= 80) return "bg-emerald-500";
  if (rate >= 50) return "bg-blue-500";
  if (rate >= 20) return "bg-amber-500";
  return "bg-rose-400";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SimpleGantt({ blocks, windowStart, windowEnd, scale }: Props) {
  const { t } = useTranslation();
  const dayPx = pxPerDay(scale);
  const totalDays = Math.max(1, daysBetween(windowStart, windowEnd) + 1);
  const timelineWidth = totalDays * dayPx;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const ticks = useMemo(() => buildTicks(windowStart, windowEnd, scale), [windowStart, windowEnd, scale]);

  // group blocks by groupName for visual grouping (only matters for main/sub modes)
  const grouped = useMemo(() => {
    const groups: { name: string; items: TOverviewBlock[] }[] = [];
    const idx = new Map<string, number>();
    for (const b of blocks) {
      const key = b.groupName || "";
      const i = idx.get(key);
      if (i == null) {
        idx.set(key, groups.length);
        groups.push({ name: key, items: [b] });
      } else {
        groups[i].items.push(b);
      }
    }
    return groups;
  }, [blocks]);

  // total rows = rows + group headers (skip group header when name is empty, e.g. project mode)
  const flatRows: { type: "group" | "block"; group?: string; block?: TOverviewBlock }[] = [];
  for (const g of grouped) {
    if (g.name) flatRows.push({ type: "group", group: g.name });
    for (const b of g.items) flatRows.push({ type: "block", block: b });
  }
  const bodyHeight = flatRows.length * ROW_HEIGHT;

  const todayOffsetPx = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today < windowStart || today > windowEnd) return null;
    return daysBetween(windowStart, today) * dayPx;
  })();

  // auto-scroll so "today" is roughly centered on first mount
  useEffect(() => {
    if (todayOffsetPx != null && scrollRef.current) {
      const container = scrollRef.current;
      const target = todayOffsetPx - container.clientWidth / 3;
      container.scrollLeft = Math.max(0, target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  return (
    <div className="flex w-full h-full overflow-hidden rounded-md border border-subtle bg-surface-1">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 border-r border-subtle"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div
          className="border-b border-subtle bg-surface-2 px-3 py-2 text-12 font-semibold text-secondary"
          style={{ height: HEADER_HEIGHT }}
        >
          {t("projects_overview_page.title")}
          <div className="text-11 font-normal text-tertiary mt-0.5">
            {blocks.length} {t("projects_overview_page.view_main_task")}
          </div>
        </div>
        <div style={{ height: bodyHeight }}>
          {flatRows.map((row, i) => {
            if (row.type === "group") {
              return (
                <div
                  key={`g-${i}`}
                  className="flex items-center px-3 bg-surface-2 text-12 font-semibold text-secondary border-b border-subtle"
                  style={{ height: ROW_HEIGHT }}
                >
                  {row.group}
                </div>
              );
            }
            const b = row.block!;
            return (
              <div
                key={b.id}
                className="flex items-center px-3 border-b border-subtle text-13"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium text-primary">{b.name}</span>
                  {b.subtitle && (
                    <span className="truncate text-11 text-tertiary">{b.subtitle}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        <div style={{ width: timelineWidth, position: "relative" }}>
          {/* Header */}
          <div
            className="sticky top-0 z-10 bg-surface-2 border-b border-subtle"
            style={{ height: HEADER_HEIGHT }}
          >
            <div className="relative h-full">
              {ticks.map((tk, i) => (
                <div
                  key={i}
                  className={cn(
                    "absolute top-0 bottom-0 flex flex-col justify-end pb-1 pl-1 text-10 select-none",
                    tk.isMajor ? "border-l border-subtle text-secondary" : "text-transparent"
                  )}
                  style={{ left: i * dayPx, width: dayPx }}
                >
                  {tk.label}
                </div>
              ))}
              {todayOffsetPx != null && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-rose-500"
                  style={{ left: todayOffsetPx }}
                  title={t("projects_overview_page.today")}
                />
              )}
            </div>
          </div>

          {/* Body */}
          <div className="relative" style={{ height: bodyHeight }}>
            {/* vertical grid lines */}
            {ticks.map((tk, i) =>
              tk.isMajor ? (
                <div
                  key={`gl-${i}`}
                  className="absolute top-0 bottom-0 w-px bg-subtle/50"
                  style={{ left: i * dayPx }}
                />
              ) : null
            )}
            {/* today line over body */}
            {todayOffsetPx != null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-rose-500/70 pointer-events-none"
                style={{ left: todayOffsetPx }}
              />
            )}

            {flatRows.map((row, i) => {
              if (row.type === "group") {
                return (
                  <div
                    key={`gh-${i}`}
                    className="absolute left-0 right-0 bg-surface-2 border-b border-subtle"
                    style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                  />
                );
              }
              const b = row.block!;
              const start = b.startDate;
              const end = b.targetDate ?? b.startDate;
              const top = i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
              if (!start || !end) {
                // unscheduled - show a placeholder text
                return (
                  <div
                    key={b.id}
                    className="absolute left-2 text-11 text-tertiary italic"
                    style={{ top: top + 2 }}
                  >
                    {t("projects_overview_page.block_no_date")}
                  </div>
                );
              }
              const left = daysBetween(windowStart, start) * dayPx;
              const widthDays = Math.max(1, daysBetween(start, end) + 1);
              const width = widthDays * dayPx;
              const progressWidth = (width * b.taskCompletionRate) / 100;
              const tooltip = `${b.name}\n${t("projects_overview_page.tooltip_tasks", {
                done: b.completedTasks,
                total: b.totalTasks,
              })}\n${t("projects_overview_page.tooltip_hours", {
                done: b.completedHours,
                total: b.estimateHours,
              })}`;
              return (
                <div
                  key={b.id}
                  className="absolute rounded bg-surface-3 border border-subtle overflow-hidden flex items-center"
                  style={{ top, left, width, height: BAR_HEIGHT }}
                  title={tooltip}
                >
                  <div
                    className={cn("absolute inset-y-0 left-0", progressColor(b.taskCompletionRate))}
                    style={{ width: progressWidth, opacity: 0.55 }}
                  />
                  <span className="relative px-1.5 text-11 font-medium text-primary truncate">
                    {b.completedTasks}/{b.totalTasks} · {b.taskCompletionRate}%
                  </span>
                </div>
              );
            })}

            {/* horizontal row separators */}
            {flatRows.map((_, i) => (
              <div
                key={`rs-${i}`}
                className="absolute left-0 right-0 border-b border-subtle"
                style={{ top: (i + 1) * ROW_HEIGHT - 1, height: 1 }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
