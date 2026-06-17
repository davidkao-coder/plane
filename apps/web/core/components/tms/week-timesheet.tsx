/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * WeekTimesheet – TMS. Editable Mon–Sun grid for the current user's
 * "本週" work items. Each cell is the user's actual hours logged on that
 * issue for that day, persisted via the existing WorkLog API
 * (create / update / delete). Entering 0 / blank removes the day's log.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { Flag } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkLog } from "@plane/types";
import { cn } from "@plane/utils";
import { WorkLogService } from "@/services/work-log.service";
import type { TQueueIssue } from "@/services/tms-dashboard.service";

const svc = new WorkLogService();
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type TCell = { hours: number; logId: string | null; multi: boolean };

type Props = {
  slug: string;
  userId?: string;
  weekStart?: string | null; // Monday ISO
  issues: TQueueIssue[];
  onEscalate?: (projectId: string, issueId: string) => void;
};

export const WeekTimesheet = observer(function WeekTimesheet({
  slug,
  userId,
  weekStart,
  issues,
  onEscalate,
}: Props) {
  // Monday..Sunday of the target week
  const days = useMemo(() => {
    const base = weekStart
      ? new Date(weekStart)
      : (() => {
          const t = new Date();
          const dow = (t.getDay() + 6) % 7; // 0 = Monday
          t.setDate(t.getDate() - dow);
          return t;
        })();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [weekStart]);
  const dayKeys = useMemo(() => days.map(iso), [days]);
  const todayKey = iso(new Date());

  const [cells, setCells] = useState<Record<string, Record<string, TCell>>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const issueIdsKey = issues.map((i) => i.id).join(",");

  const load = async () => {
    setLoading(true);
    const from = dayKeys[0];
    const to = dayKeys[6];
    const map: Record<string, Record<string, TCell>> = {};
    await Promise.all(
      issues.map(async (it) => {
        map[it.id] = {};
        let logs: IWorkLog[] = [];
        try {
          logs = await svc.list(slug, it.project_id, it.id, {
            user_id: userId,
            date_from: from,
            date_to: to,
          });
        } catch {
          logs = [];
        }
        const byDate: Record<string, IWorkLog[]> = {};
        for (const l of logs) (byDate[l.log_date] ??= []).push(l);
        for (const dk of dayKeys) {
          const ls = byDate[dk] ?? [];
          const sum = ls.reduce((a, l) => a + Number(l.hours || 0), 0);
          map[it.id][dk] = {
            hours: sum,
            logId: ls.length === 1 ? ls[0].id : null,
            multi: ls.length > 1,
          };
        }
      })
    );
    setCells(map);
    setLoading(false);
  };

  useEffect(() => {
    if (issues.length) load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, userId, dayKeys[0], dayKeys[6], issueIdsKey]);

  const commit = async (it: TQueueIssue, dk: string, raw: string) => {
    const cur = cells[it.id]?.[dk];
    if (!cur || cur.multi) return;
    const val = raw.trim() === "" ? 0 : parseFloat(raw);
    if (isNaN(val) || val < 0 || val > 24) {
      setToast({ type: TOAST_TYPE.ERROR, title: "工時需介於 0–24" });
      load();
      return;
    }
    if (val === cur.hours) return;
    const cellKey = `${it.id}:${dk}`;
    setSavingKey(cellKey);
    try {
      let newLogId = cur.logId;
      if (cur.logId && val > 0) {
        await svc.update(slug, it.project_id, it.id, cur.logId, { hours: val });
      } else if (cur.logId && val === 0) {
        await svc.remove(slug, it.project_id, it.id, cur.logId);
        newLogId = null;
      } else if (!cur.logId && val > 0) {
        const created = await svc.create(slug, it.project_id, it.id, {
          log_date: dk,
          hours: val,
          note: "",
        });
        newLogId = created.id;
      }
      setCells((p) => ({
        ...p,
        [it.id]: { ...p[it.id], [dk]: { hours: val, logId: newLogId, multi: false } },
      }));
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已儲存工時" });
    } catch (e) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "儲存失敗",
        message:
          (e as { error?: string; detail?: string })?.error ??
          (e as { detail?: string })?.detail ??
          "請再試一次",
      });
      load();
    } finally {
      setSavingKey(null);
    }
  };

  const rowTotal = (id: string) =>
    dayKeys.reduce((a, dk) => a + (cells[id]?.[dk]?.hours ?? 0), 0);
  const dayTotal = (dk: string) =>
    issues.reduce((a, it) => a + (cells[it.id]?.[dk]?.hours ?? 0), 0);
  const grandTotal = issues.reduce((a, it) => a + rowTotal(it.id), 0);
  const fmt = (n: number) => (n ? +n.toFixed(2) : "");

  return (
    <div className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
      <div className="px-3 py-2 border-b border-subtle bg-blue-500/10 flex items-center gap-2">
        <h3 className="text-13 font-semibold text-blue-600">本週工時填寫</h3>
        <span className="text-11 text-tertiary">直接在格子內輸入每日實際工時（小時），離開欄位即儲存</span>
        {grandTotal > 0 && (
          <span className="ml-auto text-12 font-mono text-primary">本週合計 {fmt(grandTotal)}h</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-12">
          <thead className="bg-surface-2/40 text-11 text-tertiary">
            <tr>
              <th className="text-left px-3 py-1.5 min-w-[16rem]">工作項目</th>
              {days.map((d, i) => (
                <th
                  key={dayKeys[i]}
                  className={cn(
                    "px-1 py-1.5 w-16 text-center font-normal",
                    dayKeys[i] === todayKey && "bg-blue-500/10 text-blue-600"
                  )}
                >
                  <div>週{WEEKDAYS[i]}</div>
                  <div className="font-mono text-10">{`${d.getMonth() + 1}/${d.getDate()}`}</div>
                </th>
              ))}
              <th className="px-2 py-1.5 w-14 text-right">小計</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {issues.map((it) => (
              <tr key={it.id} className="border-t border-subtle hover:bg-surface-2/30">
                <td className="px-3 py-1.5 align-top">
                  <Link
                    to={`/${slug}/projects/${it.project_id}/issues/${it.id}`}
                    className="text-primary hover:underline"
                  >
                    {it.name}
                  </Link>
                  <div className="text-10 text-tertiary mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono">{it.project_identifier}</span>
                    {it.stage_name && <span>· {it.stage_name}</span>}
                    {it.estimate_hours != null && <span>· 預估 {it.estimate_hours}h</span>}
                  </div>
                </td>
                {dayKeys.map((dk) => {
                  const cell = cells[it.id]?.[dk];
                  const cellKey = `${it.id}:${dk}`;
                  if (cell?.multi) {
                    return (
                      <td key={dk} className="px-1 py-1 text-center">
                        <span
                          className="text-11 font-mono text-tertiary"
                          title="此日有多筆工時紀錄，請至工作項目詳情頁編輯"
                        >
                          {fmt(cell.hours)}*
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={dk}
                      className={cn("px-1 py-1 text-center", dk === todayKey && "bg-blue-500/5")}
                    >
                      <input
                        key={`${cellKey}-${cell?.hours ?? 0}`}
                        type="number"
                        min={0}
                        max={24}
                        step={0.5}
                        defaultValue={cell?.hours ? fmt(cell.hours) : ""}
                        disabled={loading || savingKey === cellKey || !userId}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        onBlur={(e) => commit(it, dk, e.target.value)}
                        className={cn(
                          "w-12 rounded border border-subtle bg-surface-1 px-1 py-0.5 text-center text-12 font-mono",
                          "outline-none focus:border-blue-500 disabled:opacity-50",
                          savingKey === cellKey && "border-blue-400"
                        )}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right font-mono text-secondary">{fmt(rowTotal(it.id))}</td>
                <td className="px-1 py-1 text-right">
                  {onEscalate && (
                    <button
                      type="button"
                      title="回報問題 / 卡關"
                      onClick={() => onEscalate(it.project_id, it.id)}
                      className="inline-flex items-center justify-center size-6 rounded hover:bg-rose-500/10"
                    >
                      <Flag className="size-3 text-tertiary hover:text-rose-500" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-subtle bg-surface-2/40 text-11">
              <td className="px-3 py-1.5 text-tertiary">每日合計</td>
              {dayKeys.map((dk) => (
                <td
                  key={dk}
                  className={cn(
                    "px-1 py-1.5 text-center font-mono",
                    dk === todayKey ? "text-blue-600" : "text-secondary"
                  )}
                >
                  {fmt(dayTotal(dk))}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-mono text-primary">{fmt(grandTotal)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
});
