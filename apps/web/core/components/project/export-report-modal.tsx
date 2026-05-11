/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { AlertTriangle, BarChart2, CheckCircle2, Clock, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IUserLite, TIssue } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
import { cn } from "@plane/utils";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { IssueService } from "@/services/issue/issue.service";
// helpers
import { computeProjectStats, type TProjectStats } from "@/helpers/project-stats.helper";
import { generateReportXlsx } from "@/helpers/xlsx-report.helper";

type TStep = "loading" | "preview" | "error";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
};

const issueService = new IssueService(EIssueServiceType.ISSUES);

export const ExportReportModal = observer(function ExportReportModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId } = props;
  const { t } = useTranslation();

  const [step, setStep] = useState<TStep>("loading");
  const [stats, setStats] = useState<TProjectStats | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // store hooks
  const { getProjectById } = useProject();
  const { getProjectStates } = useProjectState();
  const { getUserDetails, project: { getProjectMemberIds } } = useMember();
  const { getProjectModuleIds, getModuleById } = useModule();

  // ── Load data when modal opens ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setStep("loading");
    setStats(null);

    let cancelled = false;

    const load = async () => {
      try {
        // Fetch ALL issues directly from API (bypass store pagination)
        const response = await issueService.getIssues(workspaceSlug, projectId, {
          per_page: "9999",
        } as any);

        if (cancelled) return;

        const issues = (Array.isArray(response?.results)
          ? response.results
          : Object.values(response?.results ?? {})) as TIssue[];

        const states = getProjectStates(projectId) ?? [];
        const memberIds = getProjectMemberIds(projectId, false) ?? [];
        const members: IUserLite[] = memberIds
          .map((id) => getUserDetails(id))
          .filter((m): m is IUserLite => m != null);
        const moduleIds = getProjectModuleIds(projectId) ?? [];
        const modules = moduleIds
          .map((id) => getModuleById(id))
          .filter((m): m is NonNullable<typeof m> => m != null);

        const computed = computeProjectStats(issues, states, members, modules);
        setStats(computed);
        setStep("preview");
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(String(err));
          setStep("error");
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [isOpen, workspaceSlug, projectId]);

  // ── Excel download ──────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!stats) return;

    const L = {
      sheetOverview: t("issue.export.section_overview"),
      sheetRisk: t("issue.export.section_risk"),
      sheetMembers: t("issue.export.section_members"),
      sheetModules: t("issue.export.section_modules"),
      sheetHours: t("issue.export.section_hours"),
      totalIssues: t("issue.export.total_issues"),
      completed: t("issue.export.completed_issues"),
      inProgress: t("issue.export.in_progress_issues"),
      unstarted: t("issue.export.unstarted_issues"),
      cancelled: t("issue.export.cancelled_issues"),
      completionRate: t("issue.export.completion_rate"),
      estimateHours: t("issue.export.estimate_hours"),
      actualHours: t("issue.export.actual_hours"),
      completedHours: t("issue.export.completed_hours"),
      remainingHours: t("issue.export.remaining_hours"),
      hoursCompletionRate: t("issue.export.hours_completion_rate"),
      hoursVariance: t("issue.export.hours_variance"),
      riskOverdue: t("issue.export.risk_overdue"),
      riskDueSoon: t("issue.export.risk_due_soon"),
      riskHighPriority: t("issue.export.risk_high_priority"),
      memberName: t("issue.export.member_name"),
      issueCount: t("issue.export.issue_count"),
      moduleName: t("issue.export.module_name"),
      moduleCompleted: t("issue.export.module_completed"),
      issueName: "任務名稱",
      priority: "優先級",
      dueDate: "截止日期",
      assignees: "指派成員",
    };

    const bytes = generateReportXlsx(stats, L);
    const projectName = getProjectById(projectId)?.name ?? "project";
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}-統計報告.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const pct = (n: number) => `${n}%`;
  const hrs = (n: number) => (n === 0 ? "—" : `${n} h`);
  const variance = (n: number) => {
    if (n === 0) return <span className="text-custom-text-300">±0 h</span>;
    return n > 0
      ? <span className="text-red-500">+{n} h</span>
      : <span className="text-green-500">{n} h</span>;
  };

  // ── Risk badge ──────────────────────────────────────────────────────────────
  const RiskBadge = ({ count, label, color }: { count: number; label: string; color: string }) => (
    <div className={cn("rounded-lg border p-3 flex flex-col gap-1", color)}>
      <p className="text-2xl font-semibold">{count}</p>
      <p className="text-xs">{label}</p>
    </div>
  );

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-custom-border-200">
          <div className="flex items-center gap-2">
            <BarChart2 className="size-5 text-custom-text-300" />
            <h3 className="text-base font-semibold text-custom-text-100">{t("issue.export.title")}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 place-items-center rounded-sm hover:bg-custom-background-80 text-custom-text-300"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 overflow-y-auto max-h-[70vh]">

          {/* Loading */}
          {step === "loading" && (
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <div className="size-10 animate-spin rounded-full border-4 border-custom-border-200 border-t-custom-primary-100" />
              <p className="text-sm text-custom-text-300">{t("issue.export.loading")}</p>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div className="flex flex-col items-center gap-3 py-8 text-red-500">
              <AlertTriangle className="size-8" />
              <p className="text-sm">{errorMsg}</p>
            </div>
          )}

          {/* Preview */}
          {step === "preview" && stats && (
            <div className="flex flex-col gap-6">

              {/* ── Section 1: Overview ─────────────────────────────────── */}
              <section>
                <h4 className="text-sm font-semibold text-custom-text-200 mb-3 flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-green-500" />
                  {t("issue.export.section_overview")}
                </h4>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {[
                    { label: t("issue.export.total_issues"), value: stats.overview.total, cls: "" },
                    { label: t("issue.export.completed_issues"), value: stats.overview.completed, cls: "text-green-600" },
                    { label: t("issue.export.in_progress_issues"), value: stats.overview.inProgress, cls: "text-blue-500" },
                    { label: t("issue.export.unstarted_issues"), value: stats.overview.unstarted, cls: "text-custom-text-300" },
                    { label: t("issue.export.cancelled_issues"), value: stats.overview.cancelled, cls: "text-custom-text-400" },
                    { label: t("issue.export.completion_rate"), value: pct(stats.overview.completionRate), cls: "text-custom-primary-100" },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="rounded-lg border border-custom-border-200 p-3 text-center">
                      <p className={cn("text-xl font-semibold text-custom-text-100", cls)}>{value}</p>
                      <p className="text-xs text-custom-text-400 mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* ── Section 2: Hours ────────────────────────────────────── */}
              <section>
                <h4 className="text-sm font-semibold text-custom-text-200 mb-3 flex items-center gap-1.5">
                  <Clock className="size-4 text-custom-primary-100" />
                  {t("issue.export.section_hours")}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { label: t("issue.export.estimate_hours"), value: hrs(stats.hours.estimateHours) },
                    { label: t("issue.export.actual_hours"), value: hrs(stats.hours.actualHours) },
                    { label: t("issue.export.completed_hours"), value: hrs(stats.hours.completedHours) },
                    { label: t("issue.export.remaining_hours"), value: hrs(stats.hours.remainingHours) },
                    { label: t("issue.export.hours_completion_rate"), value: pct(stats.hours.hoursCompletionRate) },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg border border-custom-border-200 p-3">
                      <p className="text-sm font-medium text-custom-text-100">{value}</p>
                      <p className="text-xs text-custom-text-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                  <div className="rounded-lg border border-custom-border-200 p-3">
                    <p className="text-sm font-medium">{variance(stats.hours.hoursVariance)}</p>
                    <p className="text-xs text-custom-text-400 mt-0.5">{t("issue.export.hours_variance")}</p>
                  </div>
                </div>
              </section>

              {/* ── Section 3: Risk ─────────────────────────────────────── */}
              <section>
                <h4 className="text-sm font-semibold text-custom-text-200 mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="size-4 text-yellow-500" />
                  {t("issue.export.section_risk")}
                </h4>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <RiskBadge
                    count={stats.risk.overdue.length}
                    label={t("issue.export.risk_overdue")}
                    color="border-red-500/30 bg-red-500/5 text-red-500"
                  />
                  <RiskBadge
                    count={stats.risk.dueSoon.length}
                    label={t("issue.export.risk_due_soon")}
                    color="border-yellow-500/30 bg-yellow-500/5 text-yellow-600"
                  />
                  <RiskBadge
                    count={stats.risk.highPriorityUnfinished.length}
                    label={t("issue.export.risk_high_priority")}
                    color="border-orange-500/30 bg-orange-500/5 text-orange-500"
                  />
                </div>
                {/* Risk detail lists */}
                {[
                  { key: "overdue", list: stats.risk.overdue, label: t("issue.export.risk_overdue"), color: "text-red-500" },
                  { key: "soon", list: stats.risk.dueSoon, label: t("issue.export.risk_due_soon"), color: "text-yellow-600" },
                  { key: "high", list: stats.risk.highPriorityUnfinished, label: t("issue.export.risk_high_priority"), color: "text-orange-500" },
                ].map(({ key, list, label, color }) =>
                  list.length > 0 ? (
                    <div key={key} className="mb-2">
                      <p className={cn("text-xs font-medium mb-1", color)}>{label}</p>
                      <ul className="space-y-0.5 max-h-28 overflow-y-auto rounded border border-custom-border-100 bg-custom-background-90 p-2">
                        {list.slice(0, 20).map((i) => (
                          <li key={i.id} className="flex items-center gap-2 text-xs text-custom-text-200">
                            <span className="flex-1 truncate">{i.name}</span>
                            {i.targetDate && <span className="text-custom-text-400 shrink-0">{i.targetDate}</span>}
                          </li>
                        ))}
                        {list.length > 20 && <li className="text-xs text-custom-text-400">+{list.length - 20} more</li>}
                      </ul>
                    </div>
                  ) : null
                )}
              </section>

              {/* ── Section 4: Members ──────────────────────────────────── */}
              {stats.memberHours.length > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-custom-text-200 mb-3">{t("issue.export.section_members")}</h4>
                  <div className="rounded-lg border border-custom-border-200 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-custom-background-90">
                        <tr>
                          {[t("issue.export.member_name"), t("issue.export.issue_count"), t("issue.export.estimate_hours"), t("issue.export.actual_hours"), t("issue.export.completed_hours"), t("issue.export.remaining_hours")].map((h) => (
                            <th key={h} className="text-left px-3 py-2 font-medium text-custom-text-300 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.memberHours.slice(0, 10).map((m) => (
                          <tr key={m.memberId} className="border-t border-custom-border-100">
                            <td className="px-3 py-1.5 text-custom-text-200 max-w-[140px] truncate">{m.memberName}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-center">{m.issueCount}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-right">{m.estimateHours || "—"}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-right">{m.actualHours || "—"}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-right">{m.completedHours || "—"}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-right">{m.remainingHours || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* ── Section 5: Modules ──────────────────────────────────── */}
              {stats.moduleProgress.length > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-custom-text-200 mb-3">{t("issue.export.section_modules")}</h4>
                  <div className="rounded-lg border border-custom-border-200 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-custom-background-90">
                        <tr>
                          {[t("issue.export.module_name"), t("issue.export.issue_count"), t("issue.export.module_completed"), t("issue.export.completion_rate"), t("issue.export.estimate_hours"), t("issue.export.actual_hours"), t("issue.export.remaining_hours")].map((h) => (
                            <th key={h} className="text-left px-3 py-2 font-medium text-custom-text-300 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {stats.moduleProgress.map((m) => (
                          <tr key={m.moduleId} className="border-t border-custom-border-100">
                            <td className="px-3 py-1.5 text-custom-text-200 max-w-[160px] truncate">{m.moduleName}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-center">{m.issueCount}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-center">{m.completedCount}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-center">{pct(m.completionRate)}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-right">{m.estimateHours || "—"}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-right">{m.actualHours || "—"}</td>
                            <td className="px-3 py-1.5 text-custom-text-300 text-right">{m.remainingHours || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-custom-border-200">
          <Button variant="neutral-primary" onClick={onClose}>{t("cancel")}</Button>
          {step === "preview" && (
            <Button variant="primary" onClick={handleDownload}>
              {t("issue.export.download")}
            </Button>
          )}
        </div>
      </div>
    </ModalCore>
  );
});
