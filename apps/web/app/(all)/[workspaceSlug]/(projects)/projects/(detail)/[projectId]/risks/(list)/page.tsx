/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Risk register page (PC) – TMS Phase 2 / B4.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { twShortDate } from "@/components/tms/format-date";
import { RiskService, type TRisk, type TRiskWritePayload, type TRiskStatus } from "@/services/risk.service";
import type { Route } from "./+types/page";

const riskService = new RiskService();

const SEVERITY_META: Record<string, { label: string; cls: string }> = {
  critical: { label: "嚴重", cls: "bg-rose-600/15 text-rose-700" },
  high: { label: "高", cls: "bg-rose-500/10 text-rose-600" },
  medium: { label: "中", cls: "bg-amber-500/10 text-amber-600" },
  low: { label: "低", cls: "bg-slate-500/10 text-slate-500" },
};
const STATUS_META: Record<TRiskStatus, { label: string; cls: string }> = {
  open: { label: "未處理", cls: "bg-rose-500/10 text-rose-600" },
  mitigating: { label: "處理中", cls: "bg-amber-500/10 text-amber-600" },
  closed: { label: "已關閉", cls: "bg-emerald-500/10 text-emerald-600" },
};
const LIKELIHOOD_LABEL: Record<string, string> = { high: "高", medium: "中", low: "低" };

function ProjectRisksPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const slug = workspaceSlug.toString();
  const pid = projectId.toString();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [risks, setRisks] = useState<TRisk[]>([]);
  const [editing, setEditing] = useState<TRisk | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      setRisks(await riskService.list(slug, pid));
      setErr("");
    } catch (e) {
      setErr((e as { detail?: string })?.detail ?? "載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, pid]);

  const visible = useMemo(
    () => (showClosed ? risks : risks.filter((r) => r.status !== "closed")),
    [risks, showClosed]
  );

  const handleDelete = async (r: TRisk) => {
    if (!confirm(`刪除風險「${r.title}」？`)) return;
    try {
      await riskService.remove(slug, pid, r.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除" });
      reload();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "刪除失敗" });
    }
  };

  return (
    <>
      <PageHead title="風險登記簿" />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-15 font-semibold text-primary">
              風險登記簿 <span className="text-12 font-normal text-tertiary">· {visible.length}</span>
            </h2>
            <label className="text-12 text-tertiary inline-flex items-center gap-1">
              <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
              顯示已關閉
            </label>
          </div>
          <Button variant="primary" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="size-4" /> 新增風險
          </Button>
        </div>

        {loading && <div className="text-tertiary text-13 py-10 text-center">載入中…</div>}
        {err && <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-13">{err}</div>}
        {!loading && visible.length === 0 && (
          <div className="text-tertiary text-13 py-10 text-center">目前沒有風險項目</div>
        )}

        {!loading && visible.length > 0 && (
          <div className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
            <table className="w-full text-13">
              <thead className="bg-surface-2 text-12 font-semibold text-secondary">
                <tr>
                  <th className="text-left px-3 py-2">風險</th>
                  <th className="text-left px-3 py-2 w-16">嚴重度</th>
                  <th className="text-left px-3 py-2 w-16">可能性</th>
                  <th className="text-left px-3 py-2 w-20">狀態</th>
                  <th className="text-left px-3 py-2 w-24">處理期限</th>
                  <th className="text-right px-3 py-2 w-20">動作</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-t border-subtle hover:bg-surface-2/40 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-primary">{r.title}</div>
                      {r.mitigation && <div className="text-11 text-tertiary mt-0.5">緩解：{r.mitigation}</div>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-flex rounded px-2 py-0.5 text-11", SEVERITY_META[r.severity]?.cls)}>
                        {SEVERITY_META[r.severity]?.label ?? r.severity}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-tertiary">{LIKELIHOOD_LABEL[r.likelihood] ?? r.likelihood}</td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-flex rounded px-2 py-0.5 text-11", STATUS_META[r.status]?.cls)}>
                        {STATUS_META[r.status]?.label ?? r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-tertiary text-11">{twShortDate(r.due_date)}</td>
                    <td className="px-3 py-2 text-right">
                      <button className="inline-flex items-center justify-center size-7 rounded hover:bg-black/[0.05]" onClick={() => setEditing(r)}>
                        <Pencil className="size-3.5 text-tertiary" />
                      </button>
                      <button className="inline-flex items-center justify-center size-7 rounded hover:bg-rose-500/10" onClick={() => handleDelete(r)}>
                        <Trash2 className="size-3.5 text-rose-500" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(isCreating || editing) && (
          <RiskModal
            slug={slug}
            pid={pid}
            risk={editing}
            onClose={() => {
              setIsCreating(false);
              setEditing(null);
            }}
            onSaved={() => {
              setIsCreating(false);
              setEditing(null);
              reload();
            }}
          />
        )}
      </div>
    </>
  );
}

function RiskModal({
  slug,
  pid,
  risk,
  onClose,
  onSaved,
}: {
  slug: string;
  pid: string;
  risk: TRisk | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(risk?.title ?? "");
  const [mitigation, setMitigation] = useState(risk?.mitigation ?? "");
  const [severity, setSeverity] = useState(risk?.severity ?? "medium");
  const [likelihood, setLikelihood] = useState(risk?.likelihood ?? "medium");
  const [statusVal, setStatusVal] = useState<TRiskStatus>(risk?.status ?? "open");
  const [dueDate, setDueDate] = useState(risk?.due_date ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!title.trim()) {
      setErr("風險標題必填");
      return;
    }
    setBusy(true);
    try {
      const payload: TRiskWritePayload = {
        title: title.trim(),
        mitigation,
        severity: severity as any,
        likelihood: likelihood as any,
        status: statusVal,
        due_date: dueDate || null,
      };
      if (risk) await riskService.update(slug, pid, risk.id, payload);
      else await riskService.create(slug, pid, payload);
      setToast({ type: TOAST_TYPE.SUCCESS, title: risk ? "已更新" : "已建立" });
      onSaved();
    } catch (e) {
      setErr((e as { detail?: string })?.detail ?? "儲存失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-subtle bg-surface-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-14 font-semibold text-primary">{risk ? "編輯風險" : "新增風險"}</h3>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">風險標題 *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例：客戶下週驗收但前端僅完成 80%" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-12 font-medium text-secondary mb-1 block">嚴重度</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13">
                <option value="critical">嚴重</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
            <div>
              <label className="text-12 font-medium text-secondary mb-1 block">可能性</label>
              <select value={likelihood} onChange={(e) => setLikelihood(e.target.value)} className="w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13">
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>
            <div>
              <label className="text-12 font-medium text-secondary mb-1 block">狀態</label>
              <select value={statusVal} onChange={(e) => setStatusVal(e.target.value as TRiskStatus)} className="w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13">
                <option value="open">未處理</option>
                <option value="mitigating">處理中</option>
                <option value="closed">已關閉</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">緩解措施</label>
            <TextArea value={mitigation} onChange={(e) => setMitigation(e.target.value)} rows={3} placeholder="如何降低或排除此風險" />
          </div>
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">處理期限</label>
            <Input type="date" value={dueDate ?? ""} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          {err && <div className="text-12 text-rose-500">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" size="sm" onClick={submit} loading={busy}>{risk ? "儲存" : "建立"}</Button>
        </div>
      </div>
    </div>
  );
}

export default observer(ProjectRisksPage);
