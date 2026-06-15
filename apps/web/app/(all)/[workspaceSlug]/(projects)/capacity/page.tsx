/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Resource capacity planner (PC) – TMS Phase 2 / B3.
 * Matrix of members × weeks showing allocated estimate hours vs capacity.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
import { twMonthDay } from "@/components/tms/format-date";
// services
import { TMSDashboardService, type TCapacity } from "@/services/tms-dashboard.service";
import type { Route } from "./+types/page";

const service = new TMSDashboardService();

function cellTone(hours: number, capacity: number): string {
  if (hours <= 0) return "text-tertiary";
  if (hours > capacity) return "bg-rose-500/15 text-rose-600 font-semibold";
  if (hours > capacity * 0.8) return "bg-amber-500/15 text-amber-600 font-medium";
  return "bg-emerald-500/10 text-emerald-700";
}

function fmtWeek(iso: string): string {
  // iso = Monday date; show "6月15日"
  const d = new Date(iso);
  return twMonthDay(d);
}

function CapacityPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const slug = workspaceSlug.toString();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [weeks, setWeeks] = useState(4);
  const [data, setData] = useState<TCapacity | null>(null);

  useEffect(() => {
    setLoading(true);
    service
      .getCapacity(slug, weeks)
      .then((d) => setData(d))
      .catch((e) => setErr((e as { detail?: string })?.detail ?? "載入失敗"))
      .finally(() => setLoading(false));
  }, [slug, weeks]);

  const cap = data?.default_capacity ?? 40;

  return (
    <>
      <PageHead title="資源容量" />
      <div className="flex h-full w-full flex-col gap-4 overflow-auto p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-15 font-semibold text-primary">資源容量規劃</h2>
            <p className="text-11 text-tertiary mt-0.5">
              依工作項目「截止日期」所在週，加總指派給每個人的預估工時；單格超過每週容量 {cap}h 會標紅
            </p>
          </div>
          <select
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="rounded border border-subtle bg-surface-1 px-2 py-1 text-12"
          >
            <option value={2}>未來 2 週</option>
            <option value={4}>未來 4 週</option>
            <option value={6}>未來 6 週</option>
            <option value={8}>未來 8 週</option>
          </select>
        </div>

        {loading && <div className="text-tertiary text-13 py-10 text-center">載入中…</div>}
        {err && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-13">{err}</div>}

        {!loading && data && data.members.length === 0 && (
          <div className="text-tertiary text-13 py-10 text-center">沒有可顯示的成員工時</div>
        )}

        {!loading && data && data.members.length > 0 && (
          <div className="rounded-md border border-subtle bg-surface-1 overflow-x-auto">
            <table className="w-full text-12 border-collapse">
              <thead className="bg-surface-2 text-11 text-tertiary">
                <tr>
                  <th className="text-left px-3 py-2 sticky left-0 bg-surface-2 min-w-[140px]">成員</th>
                  <th className="text-right px-2 py-2 w-16">逾期</th>
                  {data.week_labels.map((w, idx) => (
                    <th key={w} className="text-right px-2 py-2 w-16">
                      {idx === 0 ? "本週" : `${fmtWeek(w)}`}
                    </th>
                  ))}
                  <th className="text-right px-2 py-2 w-16">未排</th>
                  <th className="text-right px-2 py-2 w-16">合計</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.user_id} className="border-t border-subtle">
                    <td className="px-3 py-2 sticky left-0 bg-surface-1 font-medium text-primary truncate">
                      {m.display_name}
                    </td>
                    <td className={cn("px-2 py-2 text-right tabular-nums", m.overdue > 0 ? "text-rose-600 font-semibold" : "text-tertiary")}>
                      {m.overdue > 0 ? `${m.overdue}h` : "—"}
                    </td>
                    {m.weeks.map((h, idx) => (
                      <td key={idx} className={cn("px-2 py-2 text-right tabular-nums rounded", cellTone(h, m.capacity))}>
                        {h > 0 ? `${h}h` : "—"}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right tabular-nums text-tertiary">
                      {m.undated > 0 ? `${m.undated}h` : "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-primary">{m.total}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && data && (
          <div className="flex items-center gap-4 text-11 text-tertiary">
            <span className="inline-flex items-center gap-1">
              <span className="size-3 rounded bg-emerald-500/30" /> 正常
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-3 rounded bg-amber-500/30" /> 接近滿載（&gt;80%）
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-3 rounded bg-rose-500/30" /> 超載（&gt;{cap}h）
            </span>
          </div>
        )}
      </div>
    </>
  );
}

export default observer(CapacityPage);
