/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Stages admin page – TMS customization.
 *
 * Minimal CRUD UI for managing Stages within a project. Stages sit between
 * Project and Module/Category in the hierarchy.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Plus, Trash2 } from "lucide-react";
// plane
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IStage, TStageWritePayload } from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import { StageService } from "@/services/stage.service";
import type { Route } from "./+types/page";

const stageService = new StageService();

type TStep = "loading" | "ready" | "error";

function ProjectStagesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;

  const [step, setStep] = useState<TStep>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [stages, setStages] = useState<IStage[]>([]);
  const [editingStage, setEditingStage] = useState<IStage | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Load
  const reload = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const data = await stageService.getStages(workspaceSlug.toString(), projectId.toString());
      setStages(data);
      setStep("ready");
    } catch (e) {
      const msg =
        typeof e === "string"
          ? e
          : (e as { detail?: string; error?: string })?.detail ??
            (e as { detail?: string; error?: string })?.error ??
            (e instanceof Error ? e.message : JSON.stringify(e));
      setErrorMsg(msg ?? "Unknown error");
      setStep("error");
    }
  };

  useEffect(() => {
    setStep("loading");
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId]);

  const ordered = useMemo(
    () => [...stages].sort((a, b) => a.sort_order - b.sort_order),
    [stages]
  );

  const handleDelete = async (stage: IStage) => {
    if (!confirm(`確定刪除階段「${stage.name}」？\n底下的分類（Modules）會變成「未分類」狀態。`)) return;
    try {
      await stageService.deleteStage(workspaceSlug.toString(), projectId.toString(), stage.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除", message: `階段「${stage.name}」已刪除` });
      reload();
    } catch (e) {
      const msg = (e as { detail?: string })?.detail ?? "刪除失敗";
      setToast({ type: TOAST_TYPE.ERROR, title: "刪除失敗", message: msg });
    }
  };

  return (
    <>
      <PageHead title="階段管理" />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-15 font-semibold text-primary">
            階段 <span className="text-12 font-normal text-tertiary">· {stages.length}</span>
          </h2>
          <Button variant="primary" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="size-4" />
            新增階段
          </Button>
        </div>

        {step === "loading" && (
          <div className="flex h-72 items-center justify-center text-tertiary text-13">載入中…</div>
        )}
        {step === "error" && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-13">
            {errorMsg}
          </div>
        )}
        {step === "ready" && ordered.length === 0 && !isCreating && (
          <div className="flex h-72 items-center justify-center text-tertiary text-13">
            尚未建立任何階段。點右上「新增階段」開始。
          </div>
        )}

        {step === "ready" && ordered.length > 0 && (
          <div className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
            <table className="w-full text-13">
              <thead className="bg-surface-2 text-12 font-semibold text-secondary">
                <tr>
                  <th className="text-left px-3 py-2">名稱</th>
                  <th className="text-left px-3 py-2">描述</th>
                  <th className="text-right px-3 py-2">分類數</th>
                  <th className="text-left px-3 py-2">起始</th>
                  <th className="text-left px-3 py-2">截止</th>
                  <th className="text-right px-3 py-2 w-24">動作</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((s) => (
                  <tr key={s.id} className="border-t border-subtle hover:bg-surface-2/40">
                    <td className="px-3 py-2 font-medium text-primary">{s.name}</td>
                    <td className="px-3 py-2 text-tertiary truncate max-w-md">{s.description || "—"}</td>
                    <td className="px-3 py-2 text-right">{s.total_modules ?? 0}</td>
                    <td className="px-3 py-2 text-tertiary">{s.start_date ?? "—"}</td>
                    <td className="px-3 py-2 text-tertiary">{s.target_date ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center size-7 rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                        onClick={() => setEditingStage(s)}
                        title="編輯"
                      >
                        <Pencil className="size-3.5 text-tertiary" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center size-7 rounded hover:bg-rose-500/10"
                        onClick={() => handleDelete(s)}
                        title="刪除"
                      >
                        <Trash2 className="size-3.5 text-rose-500" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {(isCreating || editingStage) && (
          <StageEditModal
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            stage={editingStage}
            onClose={() => {
              setIsCreating(false);
              setEditingStage(null);
            }}
            onSaved={() => {
              setIsCreating(false);
              setEditingStage(null);
              reload();
            }}
          />
        )}
      </div>
    </>
  );
}

// ─── Inline create / edit modal ──────────────────────────────────────────────

type ModalProps = {
  workspaceSlug: string;
  projectId: string;
  stage: IStage | null;
  onClose: () => void;
  onSaved: () => void;
};

function StageEditModal({ workspaceSlug, projectId, stage, onClose, onSaved }: ModalProps) {
  const [name, setName] = useState(stage?.name ?? "");
  const [description, setDescription] = useState(stage?.description ?? "");
  const [startDate, setStartDate] = useState(stage?.start_date ?? "");
  const [targetDate, setTargetDate] = useState(stage?.target_date ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    setErr("");
    if (!name.trim()) {
      setErr("名稱必填");
      return;
    }
    setBusy(true);
    try {
      const payload: TStageWritePayload = {
        name: name.trim(),
        description,
        start_date: startDate || null,
        target_date: targetDate || null,
      };
      if (stage) {
        await stageService.patchStage(workspaceSlug, projectId, stage.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "已更新", message: `階段「${name}」` });
      } else {
        await stageService.createStage(workspaceSlug, projectId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "已建立", message: `階段「${name}」` });
      }
      onSaved();
    } catch (e) {
      const msg =
        (e as { name?: string[] | string })?.name?.toString?.() ??
        (e as { detail?: string })?.detail ??
        "儲存失敗";
      setErr(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className={cn("w-full max-w-md rounded-lg border border-subtle bg-surface-1 shadow-xl")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-14 font-semibold text-primary">
            {stage ? "編輯階段" : "新增階段"}
          </h3>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">名稱 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：需求 / 開發 / 驗收" />
          </div>
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">描述</label>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="可選"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-12 font-medium text-secondary mb-1 block">起始日期</label>
              <Input type="date" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-12 font-medium text-secondary mb-1 block">截止日期</label>
              <Input type="date" value={targetDate ?? ""} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          </div>
          {err && <div className="text-12 text-rose-500">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={busy}>
            {stage ? "儲存" : "建立"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default observer(ProjectStagesPage);
