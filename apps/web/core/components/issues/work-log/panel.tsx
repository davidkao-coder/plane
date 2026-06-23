/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * WorkLog panel – TMS customization.
 *
 * Embedded inside Issue detail. Lists existing logs and lets the current
 * user add new ones. The form pre-fills one empty row per day between the
 * issue's start_date and target_date (with sensible fallbacks); additional
 * dates can be added on top.
 *
 * Policies enforced server-side:
 *   * Backfill window: 14 days for non-managers (POST rejected otherwise)
 *   * Edit/delete window: 7 days for the row's own author; managers any age
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Plus, Trash2 } from "lucide-react";
// plane
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUser, IWorkLog, TWorkLogWritePayload } from "@plane/types";
import { Input, TextArea } from "@plane/ui";
// services
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useUserPermissions } from "@/hooks/store/user";
import { WorkLogService } from "@/services/work-log.service";
import { twShortDate } from "@/components/tms/format-date";

const workLogService = new WorkLogService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  /** Issue.start_date in ISO date string, optional. */
  startDate?: string | null;
  /** Issue.target_date in ISO date string, optional. */
  targetDate?: string | null;
  /** Current user – used to gate inline edit/delete. */
  currentUser?: Pick<IUser, "id" | "role"> | null;
};

type TDraftRow = {
  key: string;
  log_date: string;
  hours: string; // free text → parsed
  note: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function eachDate(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const s = new Date(startISO);
  const e = new Date(endISO);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || s > e) return out;
  const cursor = new Date(s);
  // cap at 14 days so we don't render a 365-row form for year-long issues
  for (let i = 0; i < 14 && cursor <= e; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function suggestDates(start?: string | null, target?: string | null): string[] {
  if (start && target) return eachDate(start, target);
  if (target && !start) return [target];
  if (start && !target) return [start];
  return [today()];
}

export const WorkLogPanel = observer(function WorkLogPanel({
  workspaceSlug,
  projectId,
  issueId,
  startDate,
  targetDate,
  currentUser,
}: Props) {
  // TMS #6 — a work log is locked once submitted; only a PM (project Admin)
  // may edit/delete it. Mirrors the backend enforcement.
  const { allowPermissions } = useUserPermissions();
  const isPM = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  const [logs, setLogs] = useState<IWorkLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [drafts, setDrafts] = useState<TDraftRow[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await workLogService.list(workspaceSlug, projectId, issueId);
      setLogs(data);
    } catch (e) {
      setErr((e as { detail?: string })?.detail ?? "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, issueId]);

  // (Re)initialise the draft rows whenever the suggested-date set changes.
  useEffect(() => {
    const dates = suggestDates(startDate, targetDate);
    setDrafts(
      dates.map((d, i) => ({
        key: `pref-${d}-${i}`,
        log_date: d,
        hours: "",
        note: "",
      }))
    );
  }, [startDate, targetDate]);

  const total = useMemo(
    () => logs.reduce((acc, l) => acc + Number(l.hours || 0), 0),
    [logs]
  );

  const perUserTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of logs) m[l.user] = (m[l.user] ?? 0) + Number(l.hours || 0);
    return m;
  }, [logs]);

  const addDraftRow = () => {
    setDrafts((prev) => [
      ...prev,
      { key: `draft-${Date.now()}-${Math.random()}`, log_date: today(), hours: "", note: "" },
    ]);
  };

  const removeDraftRow = (key: string) => {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  };

  const updateDraft = (key: string, patch: Partial<TDraftRow>) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };

  const handleSubmit = async () => {
    const ready = drafts
      .map((d) => {
        const hrs = parseFloat(d.hours);
        return { d, hrs };
      })
      .filter(({ hrs }) => !Number.isNaN(hrs) && hrs > 0);

    if (ready.length === 0) {
      setToast({ type: TOAST_TYPE.INFO, title: "沒有可送出的工時", message: "請至少填一列工時" });
      return;
    }

    setBusy(true);
    let okCount = 0;
    let failMsg = "";
    for (const { d, hrs } of ready) {
      try {
        const payload: TWorkLogWritePayload = {
          log_date: d.log_date,
          hours: hrs,
          note: d.note,
        };
        await workLogService.create(workspaceSlug, projectId, issueId, payload);
        okCount += 1;
      } catch (e) {
        failMsg = (e as { error?: string; detail?: string })?.error
          ?? (e as { detail?: string })?.detail
          ?? "送出失敗";
      }
    }
    setBusy(false);
    if (okCount > 0) {
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已新增 ${okCount} 筆工時` });
    }
    if (failMsg) {
      setToast({ type: TOAST_TYPE.ERROR, title: "部分失敗", message: failMsg });
    }
    // Clear draft hours but keep the rows visible so user can keep editing
    setDrafts((prev) => prev.map((d) => ({ ...d, hours: "", note: "" })));
    reload();
  };

  const handleDelete = async (log: IWorkLog) => {
    if (!confirm(`刪除 ${twShortDate(log.log_date)} 的 ${log.hours}h 工時？`)) return;
    try {
      await workLogService.remove(workspaceSlug, projectId, issueId, log.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除" });
      reload();
    } catch (e) {
      const msg = (e as { error?: string; detail?: string })?.error
        ?? (e as { detail?: string })?.detail
        ?? "刪除失敗（可能超過 7 天）";
      setToast({ type: TOAST_TYPE.ERROR, title: "刪除失敗", message: msg });
    }
  };

  // Only a PM (project Admin) can edit/delete a submitted work log; the author
  // cannot change it after submitting (the backend rejects it either way).
  const canEditOwn = (_log: IWorkLog) => isPM;

  return (
    <div className="flex flex-col gap-4">
      {/* Existing logs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-13 font-semibold text-primary">工作日誌</h4>
          <span className="text-12 text-tertiary">
            總工時 <span className="font-mono text-primary">{total.toFixed(2)}h</span>
            {Object.keys(perUserTotals).length > 1 && (
              <span> · {Object.keys(perUserTotals).length} 人</span>
            )}
          </span>
        </div>

        {loading && <div className="text-12 text-tertiary">載入中…</div>}
        {!loading && err && <div className="text-12 text-rose-500">{err}</div>}
        {!loading && !err && logs.length === 0 && (
          <div className="text-12 text-tertiary py-2">尚無工時紀錄</div>
        )}
        {!loading && logs.length > 0 && (
          <div className="rounded border border-subtle bg-surface-1 overflow-hidden">
            <table className="w-full text-12">
              <thead className="bg-surface-2 text-secondary">
                <tr>
                  <th className="text-left px-2 py-1.5">日期</th>
                  <th className="text-right px-2 py-1.5 w-16">小時</th>
                  <th className="text-left px-2 py-1.5">備註</th>
                  <th className="px-2 py-1.5 w-10" />
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-subtle">
                    <td className="px-2 py-1.5 text-tertiary">{twShortDate(l.log_date)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{Number(l.hours).toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-primary truncate max-w-md">{l.note || "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      {canEditOwn(l) ? (
                        <button
                          type="button"
                          className="inline-flex items-center justify-center size-6 rounded hover:bg-rose-500/10"
                          onClick={() => handleDelete(l)}
                          title="刪除"
                        >
                          <Trash2 className="size-3 text-rose-500" />
                        </button>
                      ) : (
                        <span className="text-tertiary text-12">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Draft rows */}
      {!isManager && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-13 font-semibold text-primary">新增工時</h4>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-12 text-primary hover:underline"
              onClick={addDraftRow}
            >
              <Plus className="size-3" />
              加一列
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {drafts.map((d) => (
              <div
                key={d.key}
                className="grid grid-cols-[140px_90px_1fr_auto] gap-2 items-center"
              >
                <Input
                  type="date"
                  value={d.log_date}
                  onChange={(e) => updateDraft(d.key, { log_date: e.target.value })}
                />
                <Input
                  type="number"
                  step="0.25"
                  min="0"
                  max="24"
                  placeholder="小時"
                  value={d.hours}
                  onChange={(e) => updateDraft(d.key, { hours: e.target.value })}
                />
                <Input
                  placeholder="備註（可選）"
                  value={d.note}
                  onChange={(e) => updateDraft(d.key, { note: e.target.value })}
                />
                <button
                  type="button"
                  className="inline-flex items-center justify-center size-7 rounded hover:bg-rose-500/10"
                  onClick={() => removeDraftRow(d.key)}
                  title="移除"
                >
                  <Trash2 className="size-3.5 text-rose-500" />
                </button>
              </div>
            ))}
            <div className="mt-1 flex justify-end">
              <Button variant="primary" size="sm" onClick={handleSubmit} loading={busy}>
                送出
              </Button>
            </div>
          </div>
        </div>
      )}

      {isManager && (
        <div className="rounded border border-amber-200/60 bg-amber-50/40 text-amber-700 dark:text-amber-300 px-3 py-2 text-12">
          您是管理者（manager），無須填寫工時。可隨時編輯/刪除任何工時紀錄。
        </div>
      )}
    </div>
  );
});
