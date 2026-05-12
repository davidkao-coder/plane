/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TMemberLoading } from "@/helpers/projects-overview.helper";

type Props = {
  data: TMemberLoading[];
};

export function MemberLoadingTable({ data }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  if (data.length === 0) {
    return (
      <div className="rounded-md border border-subtle bg-surface-1 p-6 text-center text-tertiary text-13">
        {t("projects_overview_page.no_data")}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
      <table className="w-full text-13">
        <thead className="bg-surface-2 text-12 font-semibold text-secondary">
          <tr>
            <th className="text-left px-3 py-2 w-8" />
            <th className="text-left px-3 py-2">{t("projects_overview_page.col_member")}</th>
            <th className="text-right px-3 py-2">{t("projects_overview_page.col_total_issues")}</th>
            <th className="text-right px-3 py-2">{t("projects_overview_page.col_in_progress")}</th>
            <th className="text-right px-3 py-2">{t("projects_overview_page.col_overdue")}</th>
            <th className="text-right px-3 py-2">{t("projects_overview_page.col_estimate_hours")}</th>
            <th className="text-right px-3 py-2">{t("projects_overview_page.col_actual_hours")}</th>
            <th className="text-right px-3 py-2">{t("projects_overview_page.col_remaining_hours")}</th>
            <th className="text-right px-3 py-2">{t("projects_overview_page.col_task_rate")}</th>
            <th className="text-right px-3 py-2">{t("projects_overview_page.col_hours_rate")}</th>
            <th className="text-right px-3 py-2">{t("projects_overview_page.col_project_distribution")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => {
            const isOpen = expanded.has(m.memberId);
            return (
              <Fragment key={m.memberId}>
                <tr
                  className="border-t border-subtle hover:bg-surface-2/50 cursor-pointer"
                  onClick={() => toggle(m.memberId)}
                >
                  <td className="px-3 py-2 text-tertiary">
                    {m.projectDistribution.length > 0 ? (
                      isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-medium text-primary">{m.memberName}</td>
                  <td className="px-3 py-2 text-right">{m.totalIssues}</td>
                  <td className="px-3 py-2 text-right">{m.inProgressIssues}</td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right",
                      m.overdueIssues > 0 && "text-rose-500 font-semibold"
                    )}
                  >
                    {m.overdueIssues}
                  </td>
                  <td className="px-3 py-2 text-right">{m.estimateHours}</td>
                  <td className="px-3 py-2 text-right">{m.actualHours}</td>
                  <td className="px-3 py-2 text-right">{m.remainingHours}</td>
                  <td className="px-3 py-2 text-right">{m.taskCompletionRate}%</td>
                  <td className="px-3 py-2 text-right">{m.hoursCompletionRate}%</td>
                  <td className="px-3 py-2 text-right">{m.projectDistribution.length}</td>
                </tr>
                {isOpen && m.projectDistribution.length > 0 && (
                  <tr className="bg-surface-2/40">
                    <td />
                    <td colSpan={10} className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {m.projectDistribution.map((p) => (
                          <span
                            key={p.projectId}
                            className="inline-flex items-center gap-1 rounded border border-subtle bg-surface-1 px-2 py-0.5 text-12"
                          >
                            <span className="text-secondary">{p.projectName}</span>
                            <span className="text-tertiary">·</span>
                            <span className="font-medium text-primary">{p.count}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
