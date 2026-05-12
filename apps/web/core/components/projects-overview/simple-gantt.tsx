/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Lightweight read-only Gantt for the Projects Overview page.
 *
 * Single scrollable container handles BOTH X and Y scroll. The sidebar
 * column and the timeline header are made "sticky" so they stay pinned
 * to their respective edges while scrolling.
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

// Solid background colors – used on sticky cells so content behind them
// doesn't bleed through during scroll. Match Plane theme tokens.
const STICKY_BG = "var(--bg-surface-1)";
const STICKY_BG_ALT = "var(--bg-surface-2)";

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

function barColors(rate: number): { fill: string; track: string; accent: string } {
  if (rate >= 80) return { fill: "#10b981", track: "#a7f3d0", accent: "#059669" };
  if (rate >= 50) return { fill: "#3b82f6", track: "#bfdbfe", accent: "#2563eb" };
  if (rate >= 20) return { fill: "#f59e0b", track: "#fde68a", accent: "#d97706" };
  return { fill: "#fb7185", track: "#fecdd3", accent: "#e11d48" };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SimpleGantt({ blocks, windowStart, windowEnd, scale, modeLabel }: Props) {
  const { t } = useTranslation();
  const dayPx = pxPerDay(scale);
  const totalDays = Math.max(1, daysBetween(windowStart, windowEnd) + 1);
  const timelineWidth = totalDays * dayPx;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const ticks = useMemo(() => buildTicks(windowStart, windowEnd, scale), [windowStart, windowEnd, scale]);

  // Group blocks by groupName for visual grouping
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
  const totalWidth = SIDEBAR_WIDTH + timelineWidth;
  const totalHeight = HEADER_HEIGHT + bodyHeight;

  const todayOffsetPx = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today < windowStart || today > windowEnd) return null;
    return daysBetween(windowStart, today) * dayPx;
  })();

  // Auto-scroll horizontally so "today" is roughly centered when scale changes
  useEffect(() => {
    if (todayOffsetPx != null && scrollRef.current) {
      const container = scrollRef.current;
      const target = SIDEBAR_WIDTH + todayOffsetPx - container.clientWidth / 2;
      container.scrollLeft = Math.max(0, target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const showSubtitle = (b: TOverviewBlock) => b.subtitle && b.subtitle !== b.groupName;

  return (
    <div
      ref={scrollRef}
      className="relative w-full h-full overflow-auto rounded-lg border border-subtle bg-surface-1 shadow-sm"
    >
      {/* CSS Grid: 2×2 layout. Sticky cells lock to viewport edges, so the
          OUTER container is the only thing that scrolls (both axes). */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${SIDEBAR_WIDTH}px ${timelineWidth}px`,
          gridTemplateRows: `${HEADER_HEIGHT}px ${bodyHeight}px`,
          width: totalWidth,
          height: totalHeight,
        }}
      >
        {/* ── (1,1) Top-left corner ────────────────────────────────────── */}
        <div
          className="border-b border-r border-subtle flex items-end px-4 pb-2 text-13 font-semibold text-secondary"
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            zIndex: 40,
            backgroundColor: STICKY_BG_ALT,
            gridColumn: 1,
            gridRow: 1,
          }}
        >
          <div className="flex items-baseline gap-2">
            <span>{modeLabel}</span>
            <span className="text-12 font-normal text-tertiary">· {blocks.length}</span>
          </div>
        </div>

        {/* ── (1,2) Timeline header – sticky top ──────────────────────── */}
        <div
          className="border-b border-subtle relative"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            backgroundColor: STICKY_BG_ALT,
            gridColumn: 2,
            gridRow: 1,
          }}
        >
          {ticks.map((tk, i) =>
            tk.isMajor ? (
              <div
                key={`hsep-${i}`}
                className="absolute top-0 bottom-0 w-px bg-subtle/60"
                style={{ left: i * dayPx }}
              />
            ) : null
          )}
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
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500"
              style={{ left: todayOffsetPx, zIndex: 5 }}
              title={t("projects_overview_page.today")}
            />
          )}
        </div>

        {/* ── (2,1) Sidebar column – sticky left ──────────────────────── */}
        <div
          className="border-r border-subtle relative"
          style={{
            position: "sticky",
            left: 0,
            zIndex: 20,
            backgroundColor: STICKY_BG,
            gridColumn: 1,
            gridRow: 2,
          }}
        >
          {flatRows.map((row, i) => {
            if (row.type === "group") {
              return (
                <div
                  key={`g-${i}`}
                  className="absolute left-0 right-0 flex items-center px-3 text-12 font-semibold text-secondary border-b border-subtle"
                  style={{ top: row.y, height: row.height, backgroundColor: STICKY_BG_ALT }}
                >
                  <span className="truncate">{row.group}</span>
                </div>
              );
            }
            const b = row.block;
            return (
              <div
                key={b.id}
                className="absolute left-0 right-0 flex items-center px-4 border-b border-subtle/60"
                style={{
                  top: row.y,
                  height: row.height,
                  backgroundColor: row.isAlt ? "rgba(0,0,0,0.025)" : STICKY_BG,
                }}
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

        {/* ── (2,2) Timeline body ──────────────────────────────────────── */}
        <div
          className="relative"
          style={{
            gridColumn: 2,
            gridRow: 2,
          }}
        >
          {/* zebra row backgrounds */}
          {flatRows.map((row, i) => (
            <div
              key={`bg-${i}`}
              className="absolute left-0 right-0 border-b border-subtle/60"
              style={{
                top: row.y,
                height: row.height,
                backgroundColor:
                  row.type === "group"
                    ? STICKY_BG_ALT
                    : row.isAlt
                      ? "rgba(0,0,0,0.025)"
                      : "transparent",
              }}
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

          {/* today vertical line */}
          {todayOffsetPx != null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500/70 pointer-events-none"
              style={{ left: todayOffsetPx, zIndex: 5 }}
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
            const colors = barColors(rate);
            return (
              <div
                key={b.id}
                className="absolute rounded-md overflow-hidden flex items-center shadow-sm"
                style={{
                  top,
                  left,
                  width,
                  height: BAR_HEIGHT,
                  backgroundColor: colors.track,
                  borderLeft: `3px solid ${colors.accent}`,
                  zIndex: 1,
                }}
                title={tooltip}
              >
                {progressWidth > 0 && (
                  <div
                    className="absolute inset-y-0 left-0"
                    style={{ width: progressWidth, backgroundColor: colors.fill, opacity: 0.85 }}
                  />
                )}
                {showInlineText && (
                  <span className="relative px-2 text-11 font-semibold truncate text-gray-900">
                    {b.completedTasks}/{b.totalTasks} · {rate}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
