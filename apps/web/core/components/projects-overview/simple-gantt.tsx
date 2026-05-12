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

const SIDEBAR_WIDTH = 360;
const ROW_HEIGHT = 44;
const HEADER_HEIGHT = 52;
const BAR_HEIGHT = 26;
const MIN_BAR_WIDTH = 28; // tiny tasks still visible
const GROUP_ROW_HEIGHT = 32;

type Props = {
  blocks: TOverviewBlock[];
  windowStart: Date;
  windowEnd: Date;
  scale: TTimeScale;
  /** Human label for the kind of blocks shown (e.g. "主任務"). */
  modeLabel: string;
};

// ─── Header ticks ────────────────────────────────────────────────────────────

type Tick = { date: Date; label: string; isMajor: boolean };

function buildTicks(start: Date, end: Date, scale: TTimeScale): Tick[] {
  const ticks: Tick[] = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);

  if (scale === "week") {
    // every day a tick; label every day; Monday is major
    while (d <= end) {
      const isMajor = d.getDay() === 1;
      ticks.push({
        date: new Date(d),
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        isMajor,
      });
      d.setDate(d.getDate() + 1);
    }
  } else if (scale === "month") {
    // label on the 1st, 8th, 15th, 22nd; major = 1st
    while (d <= end) {
      const day = d.getDate();
      const isMajor = day === 1;
      const showLabel = day === 1 || day === 8 || day === 15 || day === 22;
      ticks.push({
        date: new Date(d),
        label: showLabel ? `${d.getMonth() + 1}/${day}` : "",
        isMajor,
      });
      d.setDate(d.getDate() + 1);
    }
  } else {
    // quarter: label every 1st and 15th, major = 1st of month
    while (d <= end) {
      const day = d.getDate();
      const isMajor = day === 1;
      const showLabel = day === 1;
      ticks.push({
        date: new Date(d),
        label: showLabel ? `${d.getFullYear() % 100}/${d.getMonth() + 1}` : "",
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

/** Background of the bar "track" – visible even when there's no progress fill. */
function barTrackBg(rate: number): string {
  if (rate >= 80) return "bg-emerald-100/60 dark:bg-emerald-900/30";
  if (rate >= 50) return "bg-blue-100/60 dark:bg-blue-900/30";
  if (rate >= 20) return "bg-amber-100/60 dark:bg-amber-900/30";
  return "bg-rose-100/60 dark:bg-rose-900/30";
}

/** Colored left edge of the bar – always visible as a 3px stripe. */
function barAccent(rate: number): string {
  if (rate >= 80) return "border-emerald-500";
  if (rate >= 50) return "border-blue-500";
  if (rate >= 20) return "border-amber-500";
  return "border-rose-400";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SimpleGantt({ blocks, windowStart, windowEnd, scale, modeLabel }: Props) {
  const { t } = useTranslation();
  const dayPx = pxPerDay(scale);
  const totalDays = Math.max(1, daysBetween(windowStart, windowEnd) + 1);
  const timelineWidth = totalDays * dayPx;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const ticks = useMemo(() => buildTicks(windowStart, windowEnd, scale), [windowStart, windowEnd, scale]);

  // group blocks by groupName for visual grouping
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

  // Flatten with explicit y-position so groups can have a different height than rows.
  type RowInfo =
    | { type: "group"; group: string; y: number; height: number }
    | { type: "block"; block: TOverviewBlock; y: number; height: number; isAlt: boolean };

  const flatRows: RowInfo[] = useMemo(() => {
    const arr: RowInfo[] = [];
    let y = 0;
    let blockIndex = 0;
    for (const g of grouped) {
      if (g.name) {
        arr.push({ type: "group", group: g.name, y, height: GROUP_ROW_HEIGHT });
        y += GROUP_ROW_HEIGHT;
      }
      for (const b of g.items) {
        arr.push({
          type: "block",
          block: b,
          y,
          height: ROW_HEIGHT,
          isAlt: blockIndex % 2 === 1,
        });
        y += ROW_HEIGHT;
        blockIndex++;
      }
    }
    return arr;
  }, [grouped]);

  const bodyHeight = flatRows.reduce((sum, r) => sum + r.height, 0);

  const todayOffsetPx = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today < windowStart || today > windowEnd) return null;
    return daysBetween(windowStart, today) * dayPx;
  })();

  // auto-scroll so "today" is roughly centered on first mount / on scale change
  useEffect(() => {
    if (todayOffsetPx != null && scrollRef.current) {
      const container = scrollRef.current;
      const target = todayOffsetPx - container.clientWidth / 3;
      container.scrollLeft = Math.max(0, target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  // Subtitle should hide when it duplicates the group header
  const showSubtitle = (b: TOverviewBlock) => b.subtitle && b.subtitle !== b.groupName;

  return (
    <div className="flex w-full h-full overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-sm">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-r border-subtle bg-surface-1" style={{ width: SIDEBAR_WIDTH }}>
        {/* sidebar header */}
        <div
          className="flex items-end px-4 pb-2 border-b border-subtle bg-surface-2 text-13 font-semibold text-secondary"
          style={{ height: HEADER_HEIGHT }}
        >
          <div className="flex items-baseline gap-2">
            <span>{modeLabel}</span>
            <span className="text-12 font-normal text-tertiary">· {blocks.length}</span>
          </div>
        </div>
        {/* sidebar body */}
        <div className="relative" style={{ height: bodyHeight }}>
          {flatRows.map((row, i) => {
            if (row.type === "group") {
              return (
                <div
                  key={`g-${i}`}
                  className="absolute left-0 right-0 flex items-center px-3 bg-surface-2/80 text-12 font-semibold text-secondary border-b border-subtle"
                  style={{ top: row.y, height: row.height }}
                >
                  <span className="truncate">{row.group}</span>
                </div>
              );
            }
            const b = row.block;
            return (
              <div
                key={b.id}
                className={cn(
                  "absolute left-0 right-0 flex items-center px-4 border-b border-subtle/60",
                  row.isAlt ? "bg-black/[0.025] dark:bg-white/[0.025]" : ""
                )}
                style={{ top: row.y, height: row.height }}
              >
                <div className="flex flex-col min-w-0 gap-0.5">
                  <span className="truncate text-13 font-medium text-primary leading-tight">{b.name}</span>
                  {showSubtitle(b) && (
                    <span className="truncate text-11 text-tertiary leading-tight">{b.subtitle}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative bg-surface-1">
        <div style={{ width: timelineWidth, position: "relative" }}>
          {/* Header */}
          <div
            className="sticky top-0 z-10 bg-surface-2 border-b border-subtle"
            style={{ height: HEADER_HEIGHT }}
          >
            <div className="relative h-full">
              {/* major tick separators */}
              {ticks.map((tk, i) =>
                tk.isMajor ? (
                  <div
                    key={`hsep-${i}`}
                    className="absolute top-0 bottom-0 w-px bg-subtle/60"
                    style={{ left: i * dayPx }}
                  />
                ) : null
              )}
              {/* labels – no width constraint so they don't get clipped */}
              {ticks.map((tk, i) =>
                tk.label ? (
                  <div
                    key={`hlbl-${i}`}
                    className={cn(
                      "absolute bottom-1 pl-1 text-11 whitespace-nowrap select-none",
                      tk.isMajor ? "text-secondary font-medium" : "text-tertiary"
                    )}
                    style={{ left: i * dayPx }}
                  >
                    {tk.label}
                  </div>
                ) : null
              )}
              {todayOffsetPx != null && (
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-20"
                  style={{ left: todayOffsetPx }}
                  title={t("projects_overview_page.today")}
                />
              )}
            </div>
          </div>

          {/* Body */}
          <div className="relative" style={{ height: bodyHeight }}>
            {/* zebra row backgrounds */}
            {flatRows.map((row, i) => (
              <div
                key={`bg-${i}`}
                className={cn(
                  "absolute left-0 right-0 border-b border-subtle/60",
                  row.type === "group"
                    ? "bg-surface-2/80"
                    : row.isAlt
                      ? "bg-black/[0.025] dark:bg-white/[0.025]"
                      : ""
                )}
                style={{ top: row.y, height: row.height }}
              />
            ))}

            {/* vertical grid lines (major ticks) */}
            {ticks.map((tk, i) =>
              tk.isMajor ? (
                <div
                  key={`gl-${i}`}
                  className="absolute top-0 bottom-0 w-px bg-subtle/40 pointer-events-none"
                  style={{ left: i * dayPx }}
                />
              ) : null
            )}

            {/* today line */}
            {todayOffsetPx != null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-500/70 pointer-events-none z-10"
                style={{ left: todayOffsetPx }}
              />
            )}

            {/* bars */}
            {flatRows.map((row) => {
              if (row.type === "group") return null;
              const b = row.block;
              const start = b.startDate;
              const end = b.targetDate ?? b.startDate;
              const top = row.y + (row.height - BAR_HEIGHT) / 2;

              if (!start || !end) {
                return (
                  <div
                    key={b.id}
                    className="absolute left-2 text-11 text-tertiary italic"
                    style={{ top: top + 4 }}
                  >
                    {t("projects_overview_page.block_no_date")}
                  </div>
                );
              }

              const left = daysBetween(windowStart, start) * dayPx;
              const widthDays = Math.max(1, daysBetween(start, end) + 1);
              const width = Math.max(MIN_BAR_WIDTH, widthDays * dayPx);
              const progressWidth = (width * b.taskCompletionRate) / 100;
              const tooltip = `${b.name}\n${t("projects_overview_page.tooltip_tasks", {
                done: b.completedTasks,
                total: b.totalTasks,
              })}\n${t("projects_overview_page.tooltip_hours", {
                done: b.completedHours,
                total: b.estimateHours,
              })}`;
              const showInlineText = width >= 56;

              const rate = b.taskCompletionRate;
              return (
                <div
                  key={b.id}
                  className={cn(
                    "absolute rounded-md overflow-hidden flex items-center shadow-sm border-l-[3px]",
                    barTrackBg(rate),
                    barAccent(rate)
                  )}
                  style={{ top, left, width, height: BAR_HEIGHT }}
                  title={tooltip}
                >
                  {progressWidth > 0 && (
                    <div
                      className={cn("absolute inset-y-0 left-0", progressColor(rate))}
                      style={{ width: progressWidth, opacity: 0.7 }}
                    />
                  )}
                  {showInlineText && (
                    <span className="relative px-2 text-11 font-semibold truncate text-primary">
                      {b.completedTasks}/{b.totalTasks} · {rate}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
