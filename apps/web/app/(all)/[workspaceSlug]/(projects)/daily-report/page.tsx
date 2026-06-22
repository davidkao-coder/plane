/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Daily report (TMS #8) — end-of-day snapshot: per-member work + per-project
 * progress. Auto-generated daily by a Celery job; this page reads it (and
 * generates on-demand for any date that hasn't been generated yet).
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, CalendarCheck, AlertTriangle } from "lucide-react";
import { cn } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { TMSDashboardService, type TDailyReport } from "@/services/tms-dashboard.service";
import type { Route } from "./+types/page";

const service = new TMSDashboardService();

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function DailyReportPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const slug = workspaceSlug.toString();

  const [date, setDate] = useState<string>(() => iso(new Date()));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [report, setReport] = useState<TDailyReport | null>(null);

  useEffect(() => {
    setLoading(true);
    setErr("");
    service
      .getDailyReport(slug, date)
      .then((r) => setReport(r))
      .catch((e) => setErr((e as { detail?: string })?.detail ?? "載入失敗"))
      .finally(() => setLoading(false));
  }, [slug, date]);

  const shiftDay = (delta: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(iso(d));
  };

  return (
    <>
      <PageHead title="每日報告" />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-5">
        {/* Date toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarCheck className="size-5 text-blue-600" />
          <h2 className="text-15 font-semibold text-primary">每日報告</h2>
          <div className="ml-2 inline-flex items-center gap-1">
            <button type="button" onClick={() => shiftDay(-1)} className="p-1 rounded hover:bg-surface-2" title="前一天">
              <ChevronLeft className="size-4" />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="rounded border border-subtle bg-surface-1 px-2 py-1 text-13"
            />
            <button type="button" onClick={() => shiftDay(1)} className="p-1 rounded hover:bg-surface-2" title="後一天">
              <ChevronRight className="size-4" />
            </button>
          </div>
          {report && (
            <span className="ml-auto text-11 text-tertiary">
              {report.totals.members_reported} 人 · 當日工時 {report.totals.logged_hours}h · {report.totals.projects} 專案
              {report.generated_at ? `（更新於 ${report.generated_at.slice(0, 16).replace("T", " ")}）` : ""}
            </span>
          )}
        </div>

        {loading && <div className="text-tertiary text-13 py-10 text-center">載入中…</div>}
        {err && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-13">{err}</div>}

        {!loading && report && (
          <>
            {/* Per-project progress */}
            <div className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
              <div className="px-3 py-2 border-b border-subtle bg-surface-2/40 text-13 font-semibold text-secondary">
                各專案進度
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-12">
                  <thead className="bg-surface-2/40 text-11 text-tertiary">
                    <tr>
                      <th className="text-left px-3 py-1.5">專案</th>
                      <th className="text-right px-3 py-1.5 w-20">進度</th>
                      <th className="text-right px-3 py-1.5 w-16">完成</th>
                      <th className="text-right px-3 py-1.5 w-16">進行中</th>
                      <th className="text-right px-3 py-1.5 w-16">逾期</th>
                      <th className="text-right px-3 py-1.5 w-16">總數</th>
                      <th className="text-right px-3 py-1.5 w-20">當日工時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.per_project.map((p) => (
                      <tr key={p.project_id} className="border-t border-subtle hover:bg-surface-2/30">
                        <td className="px-3 py-1.5">
                          <span className="font-mono text-10 text-tertiary mr-1">{p.identifier}</span>
                          {p.name}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <span
                            className={cn(
                              "font-mono",
                              p.progress_pct === 100 ? "text-emerald-600" : p.progress_pct > 0 ? "text-blue-600" : "text-tertiary"
                            )}
                          >
                            {p.progress_pct}%
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-emerald-600">{p.done}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-blue-600">{p.in_progress}</td>
                        <td className={cn("px-3 py-1.5 text-right font-mono", p.overdue > 0 ? "text-rose-600" : "text-tertiary")}>
                          {p.overdue || ""}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-tertiary">{p.total}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{p.hours_today ? `${p.hours_today}h` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per-member */}
            <div className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
              <div className="px-3 py-2 border-b border-subtle bg-surface-2/40 text-13 font-semibold text-secondary">
                各成員當日工作
              </div>
              {report.per_member.length === 0 ? (
                <div className="text-tertiary text-12 py-6 text-center">當天沒有工時紀錄或待辦</div>
              ) : (
                <div className="divide-y divide-subtle">
                  {report.per_member.map((m) => (
                    <div key={m.user_id} className="px-3 py-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-13 font-medium text-primary">{m.display_name}</span>
                        <span className="text-11 font-mono text-blue-600">{m.logged_hours}h</span>
                        <span className="text-11 text-tertiary">· 待辦 {m.open_assigned}</span>
                        {m.overdue_assigned > 0 && (
                          <span className="text-11 text-rose-600 inline-flex items-center gap-0.5">
                            <AlertTriangle className="size-3" />
                            逾期 {m.overdue_assigned}
                          </span>
                        )}
                      </div>
                      {m.items.length > 0 && (
                        <table className="w-full text-11 mt-1.5">
                          <tbody>
                            {m.items.map((it, idx) => (
                              <tr key={`${m.user_id}-${idx}`} className="text-tertiary">
                                <td className="py-0.5 pr-3 text-secondary truncate max-w-md">
                                  {it.issue_id ? (
                                    <Link
                                      to={`/${slug}/projects/${report.per_project.find((p) => p.name === it.project_name)?.project_id ?? ""}/issues/${it.issue_id}`}
                                      className="hover:underline"
                                    >
                                      {it.name}
                                    </Link>
                                  ) : (
                                    it.name
                                  )}
                                </td>
                                <td className="py-0.5 pr-3 w-28 truncate">{it.project_name}</td>
                                <td className="py-0.5 pr-3 w-20">{it.stage_name ?? "—"}</td>
                                <td className="py-0.5 pr-3 w-20">{it.state_name ?? "—"}</td>
                                <td className="py-0.5 text-right w-12 font-mono">{it.hours}h</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default observer(DailyReportPage);
