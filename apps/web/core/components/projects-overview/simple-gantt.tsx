/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Hierarchical read-only Gantt for the Projects Overview page.
 *
 *   Project   ──click▶  Main task   ──click▶  Sub task
 *
 * Single scrollable container (overflow: auto) drives BOTH X and Y scroll.
 * Sidebar column + header row use `position: sticky` so they stay pinned
 * to their respective edges while content scrolls.
 */

import { useMemo, useRef, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// helpers
import {
  daysBetween,
  pxPerDay,
  type TOverviewNode,
  type TTimeScale,
} from "@/helpers/projects-overview.helper";

const SIDEBAR_WIDTH = 380;
const HEADER_HEIGHT = 52;
const BAR_HEIGHT = 24;
const MIN_BAR_WIDTH = 26;

// Per-type row height (project rows are taller for emphasis)
const ROW_HEIGHT_BY_TYPE: Record<TOverviewNode["type"], number> = {
  project: 48,
  main: 40,
  sub: 36,
};
const INDENT_BY_LEVEL = [12, 32, 52];

// Plane theme tokens for solid sticky backgrounds
const STICKY_BG = "var(--bg-surface-1)";
const STICKY_BG_ALT = "var(--bg-surface-2)";

type Props = {
  tree: TOverviewNode[];
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

// ─── Flatten visible rows ────────────────────────────────────────────────────

type Row = {
  node: TOverviewNode;
  level: number;
  y: number;
  height: number;
  hasChildren: boolean;
  isExpanded: boolean;
};

function flattenVisible(
  tree: TOverviewNode[],
  expanded: Set<string>
): Row[] {
  const rows: Row[] = [];
  let y = 0;
  const walk = (node: TOverviewNode, level: number) => {
    const height = ROW_HEIGHT_BY_TYPE[node.type];
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.children.length > 0;
    rows.push({ node, level, y, height, hasChildren, isExpanded });
    y += height;
    if (isExpanded) {
      for (const c of node.children) walk(c, level + 1);
    }
  };
  for (const root of tree) walk(root, 0);
  return rows;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SimpleGantt({ tree, windowStart, windowEnd, scale }: Props) {
  const { t } = useTranslation();
  const dayPx = pxPerDay(scale);
  const totalDays = Math.max(1, daysBetween(windowStart, windowEnd) + 1);
  const timelineWidth = totalDays * dayPx;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // expanded state: by default open all project nodes so user sees something useful
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const root of tree) s.add(root.id);
    return s;
  });

  // when tree composition changes, ensure all projects are expanded by default
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const root of tree) {
        if (!next.has(root.id)) {
          next.add(root.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tree]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ticks = useMemo(() => buildTicks(windowStart, windowEnd, scale), [windowStart, windowEnd, scale]);
  const visibleRows = useMemo(() => flattenVisible(tree, expanded), [tree, expanded]);
  const bodyHeight = visibleRows.reduce((sum, r) => sum + r.height, 0);
  const totalWidth = SIDEBAR_WIDTH + timelineWidth;
  const totalHeight = HEADER_HEIGHT + bodyHeight;

  const todayOffsetPx = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (today < windowStart || today > windowEnd) return null;
    return daysBetween(windowStart, today) * dayPx;
  })();

  // Auto-scroll so "today" is roughly centered on first mount / on scale change
  useEffect(() => {
    if (todayOffsetPx != null && scrollRef.current) {
      const container = scrollRef.current;
      const target = SIDEBAR_WIDTH + todayOffsetPx - container.clientWidth / 2;
      container.scrollLeft = Math.max(0, target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const totalProjects = tree.length;
  const totalIssues = tree.reduce((s, p) => s + p.totalTasks, 0);

  return (
    <div
      ref={scrollRef}
      className="relative w-full h-full overflow-auto rounded-lg border border-subtle bg-surface-1 shadow-sm"
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `${SIDEBAR_WIDTH}px ${timelineWidth}px`,
          gridTemplateRows: `${HEADER_HEIGHT}px ${bodyHeight}px`,
          width: totalWidth,
          height: totalHeight,
        }}
      >
        {/* ── (1,1) Top-left corner ─────────────────────────────────── */}
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
            <span>{t("projects_overview_page.title")}</span>
            <span className="text-12 font-normal text-tertiary">
              · {totalProjects} / {totalIssues}
            </span>
          </div>
        </div>

        {/* ── (1,2) Timeline header – sticky top ────────────────────── */}
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

        {/* ── (2,1) Sidebar – sticky left ────────────────────────────── */}
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
          {visibleRows.map((r) => {
            const indent = INDENT_BY_LEVEL[Math.min(r.level, INDENT_BY_LEVEL.length - 1)];
            const isProject = r.node.type === "project";
            const isMain = r.node.type === "main";
            const isAlt = !isProject && Math.floor(r.y / 80) % 2 === 1; // simple stripe pattern
            return (
              <div
                key={r.node.id}
                className={cn(
                  "absolute left-0 right-0 flex items-center border-b border-subtle/60 select-none",
                  r.hasChildren ? "cursor-pointer hover:bg-black/[0.04]" : ""
                )}
                style={{
                  top: r.y,
                  height: r.height,
                  paddingLeft: indent,
                  paddingRight: 12,
                  backgroundColor: isProject
                    ? STICKY_BG_ALT
                    : isAlt
                      ? "rgba(0,0,0,0.025)"
                      : STICKY_BG,
                }}
                onClick={() => r.hasChildren && toggle(r.node.id)}
              >
                {/* chevron */}
                <div className="flex-shrink-0 w-4 mr-1 flex items-center justify-center">
                  {r.hasChildren ? (
                    <ChevronRight
                      className={cn(
                        "size-3.5 transition-transform text-tertiary",
                        r.isExpanded ? "rotate-90" : ""
                      )}
                    />
                  ) : null}
                </div>
                <div className="flex flex-col min-w-0 gap-0.5 leading-tight">
                  <span
                    className={cn(
                      "truncate",
                      isProject
                        ? "text-13 font-semibold text-primary"
                        : isMain
                          ? "text-13 font-medium text-primary"
                          : "text-12 text-secondary"
                    )}
                  >
                    {r.node.name}
                  </span>
                  {!isProject && r.node.subtitle && r.node.subtitle !== r.node.name && (
                    <span className="truncate text-11 text-tertiary">
                      {r.node.totalTasks > 1
                        ? `${r.node.completedTasks}/${r.node.totalTasks} · ${r.node.taskCompletionRate}%`
                        : ""}
                    </span>
                  )}
                  {isProject && (
                    <span className="truncate text-11 text-tertiary">
                      {r.node.completedTasks}/{r.node.totalTasks} · {r.node.taskCompletionRate}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── (2,2) Timeline body ─────────────────────────────────────── */}
        <div
          className="relative"
          style={{
            gridColumn: 2,
            gridRow: 2,
          }}
        >
          {/* row backgrounds + horizontal separators */}
          {visibleRows.map((r) => {
            const isProject = r.node.type === "project";
            const isAlt = !isProject && Math.floor(r.y / 80) % 2 === 1;
            return (
              <div
                key={`bg-${r.node.id}`}
                className="absolute left-0 right-0 border-b border-subtle/60"
                style={{
                  top: r.y,
                  height: r.height,
                  backgroundColor: isProject
                    ? STICKY_BG_ALT
                    : isAlt
                      ? "rgba(0,0,0,0.025)"
                      : "transparent",
                }}
              />
            );
          })}

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
          {visibleRows.map((r) => {
            const node = r.node;
            const start = node.startDate;
            const end = node.targetDate ?? node.startDate;
            const top = r.y + (r.height - BAR_HEIGHT) / 2;

            if (!start || !end) {
              return (
                <div
                  key={`bar-${node.id}`}
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
            const progressWidth = (width * node.taskCompletionRate) / 100;
            const rate = node.taskCompletionRate;
            const colors = barColors(rate);
            const showInlineText = width >= 56;
            const tooltip = `${node.name}\n${t("projects_overview_page.tooltip_tasks", {
              done: node.completedTasks,
              total: node.totalTasks,
            })}\n${t("projects_overview_page.tooltip_hours", {
              done: node.completedHours,
              total: node.estimateHours,
            })}`;

            return (
              <div
                key={`bar-${node.id}`}
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
                    style={{
                      width: progressWidth,
                      backgroundColor: colors.fill,
                      opacity: 0.85,
                    }}
                  />
                )}
                {showInlineText && (
                  <span className="relative px-2 text-11 font-semibold truncate text-gray-900">
                    {node.completedTasks}/{node.totalTasks} · {rate}%
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
