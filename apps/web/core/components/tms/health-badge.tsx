/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Shared health badge – TMS Phase 2.
 * Renders a coloured pill for stage / project health status.
 */

import { cn } from "@plane/utils";

export type THealth = "done" | "overdue" | "at_risk" | "on_track" | "no_target" | "empty";

const HEALTH_META: Record<THealth, { label: string; className: string }> = {
  done: { label: "已完成", className: "bg-emerald-500/10 text-emerald-600" },
  overdue: { label: "已逾期", className: "bg-rose-500/10 text-rose-600" },
  at_risk: { label: "風險", className: "bg-amber-500/10 text-amber-600" },
  on_track: { label: "正常", className: "bg-blue-500/10 text-blue-600" },
  no_target: { label: "未設期限", className: "bg-slate-500/10 text-slate-500" },
  empty: { label: "無任務", className: "bg-gray-500/10 text-gray-400" },
};

export function HealthBadge({ health, className }: { health?: THealth | string | null; className?: string }) {
  const meta = HEALTH_META[(health as THealth) ?? "empty"] ?? HEALTH_META.empty;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-11 font-medium whitespace-nowrap",
        meta.className,
        className
      )}
    >
      {meta.label}
    </span>
  );
}

/** Thin progress bar for completion ratio (0.0–1.0). */
export function CompletionBar({ ratio, className }: { ratio?: number | null; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio ?? 0)) * 100);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden min-w-[40px]">
        <div
          className={cn(
            "h-full rounded-full",
            pct === 100 ? "bg-emerald-500" : "bg-blue-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-10 text-tertiary tabular-nums w-8 text-right">{pct}%</span>
    </div>
  );
}
