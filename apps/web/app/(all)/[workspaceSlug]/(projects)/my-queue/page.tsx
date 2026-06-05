/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Personal task queue (dev / lead) – TMS Phase 2.
 * Groups the current user's open assigned issues by week bucket.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { AlertTriangle, CalendarClock, CalendarDays, Clock, Inbox } from "lucide-react";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import { TMSDashboardService, type TMyQueue, type TQueueBucket } from "@/services/tms-dashboard.service";
import type { Route } from "./+types/page";

const service = new TMSDashboardService();

const BUCKET_META: Record<
  TQueueBucket["key"],
  { label: string; icon: React.ElementType; tone: string }
> = {
  overdue: { label: "已逾期", icon: AlertTriangle, tone: "text-rose-600" },
  this_week: { label: "本週", icon: CalendarClock, tone: "text-blue-600" },
  next_week: { label: "下週", icon: CalendarDays, tone: "text-indigo-600" },
  later: { label: "之後", icon: Clock, tone: "text-tertiary" },
  no_date: { label: "未排程", icon: Inbox, tone: "text-tertiary" },
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "緊急",
  high: "高",
  medium: "中",
  low: "低",
  none: "無",
};

function MyQueuePage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const slug = workspaceSlug.toString();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [queue, setQueue] = useState<TMyQueue | null>(null);

  useEffect(() => {
    setLoading(true);
    service
      .getMyQueue(slug)
      .then((q) => setQueue(q))
      .catch((e) => setErr((e as { detail?: string })?.detail ?? "載入失敗"))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <>
      <PageHead title="我的隊列" />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-15 font-semibold text-primary">
            我的隊列
            {queue ? <span className="ml-1 text-12 font-normal text-tertiary">· {queue.total} 項待辦</span> : null}
          </h2>
        </div>

        {loading && <div className="text-tertiary text-13 py-10 text-center">載入中…</div>}
        {err && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-13">{err}</div>}
        {!loading && queue && queue.total === 0 && (
          <div className="text-tertiary text-13 py-10 text-center">目前沒有指派給你的待辦工作項目 🎉</div>
        )}

        {!loading &&
          queue &&
          queue.buckets
            .filter((b) => b.count > 0)
            .map((bucket) => {
              const meta = BUCKET_META[bucket.key];
              const Icon = meta.icon;
              return (
                <div key={bucket.key} className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
                  <div className="px-3 py-2 border-b border-subtle bg-surface-2/40 flex items-center gap-2">
                    <Icon className={cn("size-4", meta.tone)} />
                    <h3 className={cn("text-13 font-semibold", meta.tone)}>{meta.label}</h3>
                    <span className="text-11 text-tertiary">{bucket.count}</span>
                  </div>
                  <table className="w-full text-12">
                    <tbody>
                      {bucket.issues.map((i) => (
                        <tr key={i.id} className="border-t border-subtle hover:bg-surface-2/40">
                          <td className="px-3 py-2 w-40 align-top">
                            <Link
                              to={`/${slug}/projects/${i.project_id}/issues/${i.id}`}
                              className="text-tertiary hover:underline truncate block"
                              title={i.project_name}
                            >
                              <span className="font-mono text-10">{i.project_identifier}</span> {i.project_name}
                            </Link>
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              to={`/${slug}/projects/${i.project_id}/issues/${i.id}`}
                              className="text-primary hover:underline"
                            >
                              {i.name}
                            </Link>
                            <div className="text-10 text-tertiary mt-0.5 flex items-center gap-2 flex-wrap">
                              {i.module_name && <span>{i.module_name}</span>}
                              {i.stage_name && <span>· {i.stage_name}</span>}
                              {i.process_step_name && <span>· {i.process_step_name}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 w-16 text-tertiary">{PRIORITY_LABEL[i.priority] ?? i.priority}</td>
                          <td className="px-3 py-2 w-20 text-tertiary">{i.state_name ?? "—"}</td>
                          <td
                            className={cn(
                              "px-3 py-2 w-24 text-right font-mono text-11",
                              i.is_overdue ? "text-rose-600" : "text-tertiary"
                            )}
                          >
                            {i.target_date ?? "—"}
                          </td>
                          <td className="px-3 py-2 w-12 text-right font-mono text-tertiary">
                            {i.estimate_hours != null ? `${i.estimate_hours}h` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
      </div>
    </>
  );
}

export default observer(MyQueuePage);
