/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Cross-project dashboard (PM) – TMS Phase 2.
 * One card per project with rolled-up health, completion and overdue count.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { AlertTriangle, ChevronRight, FileText, Download } from "lucide-react";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
import { HealthBadge, CompletionBar } from "@/components/tms/health-badge";
import { twShortDate } from "@/components/tms/format-date";
// services
import {
  TMSDashboardService,
  type TDashboardProject,
  type TReportIssue,
} from "@/services/tms-dashboard.service";
import type { Route } from "./+types/page";

const service = new TMSDashboardService();

function TMSDashboardPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const slug = workspaceSlug.toString();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [projects, setProjects] = useState<TDashboardProject[]>([]);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [reportProject, setReportProject] = useState<TDashboardProject | null>(null);

  useEffect(() => {
    setLoading(true);
    service
      .getDashboard(slug)
      .then((d) => setProjects(d))
      .catch((e) => setErr((e as { detail?: string })?.detail ?? "載入失敗"))
      .finally(() => setLoading(false));
  }, [slug]);

  const visible = useMemo(
    () =>
      filter === "attention"
        ? projects.filter((p) => p.health === "overdue" || p.health === "at_risk" || p.overdue_issues > 0)
        : projects,
    [projects, filter]
  );

  const stats = useMemo(() => {
    return {
      total: projects.length,
      overdue: projects.filter((p) => p.health === "overdue").length,
      atRisk: projects.filter((p) => p.health === "at_risk").length,
      overdueIssues: projects.reduce((s, p) => s + p.overdue_issues, 0),
    };
  }, [projects]);

  return (
    <>
      <PageHead title="專案儀表板" />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-5">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="專案總數" value={stats.total} />
          <SummaryTile label="逾期專案" value={stats.overdue} tone={stats.overdue > 0 ? "rose" : "default"} />
          <SummaryTile label="風險專案" value={stats.atRisk} tone={stats.atRisk > 0 ? "amber" : "default"} />
          <SummaryTile label="逾期工作項目" value={stats.overdueIssues} tone={stats.overdueIssues > 0 ? "rose" : "default"} />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "px-3 py-1 rounded text-12 border",
              filter === "all" ? "border-blue-500 text-blue-600 bg-blue-500/10" : "border-subtle text-tertiary hover:bg-surface-2"
            )}
          >
            全部專案
          </button>
          <button
            type="button"
            onClick={() => setFilter("attention")}
            className={cn(
              "px-3 py-1 rounded text-12 border inline-flex items-center gap-1",
              filter === "attention" ? "border-amber-500 text-amber-600 bg-amber-500/10" : "border-subtle text-tertiary hover:bg-surface-2"
            )}
          >
            <AlertTriangle className="size-3" /> 需要關注
          </button>
        </div>

        {loading && <div className="text-tertiary text-13 py-10 text-center">載入中…</div>}
        {err && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-13">{err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div className="text-tertiary text-13 py-10 text-center">沒有符合條件的專案</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visible.map((p) => (
            <div key={p.id} className="rounded-lg border border-subtle bg-surface-1 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-10 text-tertiary">{p.identifier}</span>
                    <Link
                      to={`/${slug}/projects/${p.id}/workboard`}
                      className="font-semibold text-primary text-14 hover:underline truncate"
                    >
                      {p.name}
                    </Link>
                  </div>
                  {(p.client_name || p.contract_no) && (
                    <div className="text-11 text-tertiary mt-0.5 truncate">
                      {p.client_name}
                      {p.client_name && p.contract_no ? " · " : ""}
                      {p.contract_no}
                    </div>
                  )}
                </div>
                <HealthBadge health={p.health} />
              </div>

              <div className="mt-3">
                <CompletionBar ratio={p.completion_ratio} />
                <div className="flex items-center justify-between mt-1 text-11 text-tertiary">
                  <span>
                    {p.completed_issues}/{p.total_issues} 完成
                  </span>
                  {p.overdue_issues > 0 && (
                    <span className="text-rose-600 inline-flex items-center gap-0.5">
                      <AlertTriangle className="size-3" />
                      {p.overdue_issues} 逾期
                    </span>
                  )}
                </div>
              </div>

              {/* Stage mini-bars — each links into the project's workboard
                  pre-filtered to that stage (coarse→fine drill-down). */}
              <div className="mt-3 flex flex-col gap-1">
                {p.stages.map((s) => (
                  <Link
                    key={s.id}
                    to={`/${slug}/projects/${p.id}/workboard?stage=${s.id}`}
                    className="flex items-center gap-2 text-11 rounded px-1 -mx-1 hover:bg-surface-2"
                    title={`進入「${s.name}」階段`}
                  >
                    <span className="w-20 truncate text-tertiary">{s.name}</span>
                    <div className="flex-1">
                      <CompletionBar ratio={s.completion_ratio} />
                    </div>
                    <HealthBadge health={s.health} className="w-14 justify-center" />
                  </Link>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <Link
                  to={`/${slug}/projects/${p.id}/workboard`}
                  className="inline-flex items-center gap-0.5 text-11 text-blue-600 hover:underline"
                >
                  進入整合檢視 <ChevronRight className="size-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => setReportProject(p)}
                  className="inline-flex items-center gap-0.5 text-11 text-tertiary hover:text-primary hover:underline"
                >
                  <FileText className="size-3" /> 本週週報
                </button>
                <a
                  href={service.exportReportUrl(slug, p.id)}
                  className="inline-flex items-center gap-0.5 text-11 text-tertiary hover:text-primary hover:underline"
                  title="下載 Excel 報表"
                >
                  <Download className="size-3" /> 匯出 Excel
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {reportProject && (
        <WeeklyReportModal slug={slug} project={reportProject} onClose={() => setReportProject(null)} />
      )}
    </>
  );
}

// ─── Weekly report modal ──────────────────────────────────────────────────────

function WeeklyReportModal({
  slug,
  project,
  onClose,
}: {
  slug: string;
  project: TDashboardProject;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<Awaited<ReturnType<TMSDashboardService["getWeeklyReport"]>> | null>(null);

  useEffect(() => {
    setLoading(true);
    service
      .getWeeklyReport(slug, project.id)
      .then((r) => setReport(r))
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [slug, project.id]);

  const section = (title: string, tone: string, data?: { count: number; issues: TReportIssue[] }) => (
    <div>
      <h4 className={cn("text-12 font-semibold mb-1", tone)}>
        {title} · {data?.count ?? 0}
      </h4>
      {data && data.issues.length > 0 ? (
        <ul className="flex flex-col gap-0.5">
          {data.issues.slice(0, 30).map((i) => (
            <li key={i.id} className="text-12 text-secondary flex items-center gap-2">
              <span className="font-mono text-10 text-tertiary">#{i.sequence_id}</span>
              <span className="truncate">{i.name}</span>
              {i.target_date && <span className="text-10 text-tertiary ml-auto">{twShortDate(i.target_date)}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-11 text-tertiary">—</div>
      )}
    </div>
  );

  const copyText = () => {
    if (!report) return;
    const fmt = (label: string, d?: { issues: TReportIssue[] }) =>
      `【${label}】\n${(d?.issues ?? []).map((i) => `- #${i.sequence_id} ${i.name}`).join("\n") || "（無）"}`;
    const text = [
      `${project.name} 週報（${twShortDate(report.week_start)} ~ ${twShortDate(report.week_end)}）`,
      fmt("本週完成", report.completed_this_week),
      fmt("進行中", report.in_progress),
      fmt("逾期", report.overdue),
      fmt("下週計畫", report.planned_next_week),
    ].join("\n\n");
    navigator.clipboard?.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg border border-subtle bg-surface-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-subtle flex items-center justify-between">
          <div>
            <h3 className="text-14 font-semibold text-primary">{project.name} · 本週週報</h3>
            {report && (
              <p className="text-11 text-tertiary mt-0.5">
                {twShortDate(report.week_start)} ~ {twShortDate(report.week_end)}
              </p>
            )}
          </div>
          <button type="button" onClick={copyText} className="text-11 text-blue-600 hover:underline" disabled={!report}>
            複製為文字
          </button>
        </div>
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading && <div className="text-tertiary text-13 col-span-2 py-6 text-center">產生中…</div>}
          {!loading && report && (
            <>
              {section("本週完成", "text-emerald-600", report.completed_this_week)}
              {section("進行中", "text-blue-600", report.in_progress)}
              {section("逾期", "text-rose-600", report.overdue)}
              {section("下週計畫", "text-indigo-600", report.planned_next_week)}
            </>
          )}
        </div>
        <div className="px-5 py-3 border-t border-subtle flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>關閉</Button>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "rose" | "amber";
}) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-1 p-3">
      <div className="text-11 text-tertiary">{label}</div>
      <div
        className={cn(
          "text-22 font-semibold mt-1",
          tone === "rose" && "text-rose-600",
          tone === "amber" && "text-amber-600",
          tone === "default" && "text-primary"
        )}
      >
        {value}
      </div>
    </div>
  );
}

export default observer(TMSDashboardPage);
