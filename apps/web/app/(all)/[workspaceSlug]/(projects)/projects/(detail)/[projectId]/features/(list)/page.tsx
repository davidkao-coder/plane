/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Features admin page – TMS customization.
 *
 * Minimal CRUD UI for managing Features within a project. Each Feature
 * optionally belongs to a Stage and exposes a "linked requirements" panel
 * (reverse view of the Requirement ↔ Feature pivot).
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Plus, Trash2, Link2 } from "lucide-react";
// plane
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IFeature, IRequirement, IStage, TFeatureWritePayload } from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import { FeatureService } from "@/services/feature.service";
import { RequirementService } from "@/services/requirement.service";
import { StageService } from "@/services/stage.service";
import type { Route } from "./+types/page";

const featureService = new FeatureService();
const requirementService = new RequirementService();
const stageService = new StageService();

type TStep = "loading" | "ready" | "error";

function ProjectFeaturesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;

  const [step, setStep] = useState<TStep>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [features, setFeatures] = useState<IFeature[]>([]);
  const [stages, setStages] = useState<IStage[]>([]);
  const [requirements, setRequirements] = useState<IRequirement[]>([]);
  const [editingFeature, setEditingFeature] = useState<IFeature | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [linkingFeature, setLinkingFeature] = useState<IFeature | null>(null);

  const reload = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const [fs, ss, rs] = await Promise.all([
        featureService.getFeatures(workspaceSlug.toString(), projectId.toString()),
        stageService.getStages(workspaceSlug.toString(), projectId.toString()),
        requirementService.getRequirements(workspaceSlug.toString(), projectId.toString()),
      ]);
      setFeatures(fs);
      setStages(ss);
      setRequirements(rs);
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

  const stageNameById = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.id, s.name])),
    [stages]
  );

  const ordered = useMemo(
    () => [...features].sort((a, b) => a.sort_order - b.sort_order),
    [features]
  );

  const handleDelete = async (feature: IFeature) => {
    if (!confirm(`確定刪除功能「${feature.name}」？`)) return;
    try {
      await featureService.deleteFeature(workspaceSlug.toString(), projectId.toString(), feature.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除", message: `功能「${feature.name}」已刪除` });
      reload();
    } catch (e) {
      const msg = (e as { detail?: string })?.detail ?? "刪除失敗";
      setToast({ type: TOAST_TYPE.ERROR, title: "刪除失敗", message: msg });
    }
  };

  return (
    <>
      <PageHead title="功能管理" />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-15 font-semibold text-primary">
            功能 <span className="text-12 font-normal text-tertiary">· {features.length}</span>
          </h2>
          <Button variant="primary" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="size-4" />
            新增功能
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
            尚未建立任何功能。點右上「新增功能」開始。
          </div>
        )}

        {step === "ready" && ordered.length > 0 && (
          <div className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
            <table className="w-full text-13">
              <thead className="bg-surface-2 text-12 font-semibold text-secondary">
                <tr>
                  <th className="text-left px-3 py-2 w-24">編號</th>
                  <th className="text-left px-3 py-2">名稱</th>
                  <th className="text-left px-3 py-2">所屬階段</th>
                  <th className="text-right px-3 py-2">預估工時</th>
                  <th className="text-right px-3 py-2">需求數</th>
                  <th className="text-right px-3 py-2 w-32">動作</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((f) => (
                  <tr key={f.id} className="border-t border-subtle hover:bg-surface-2/40">
                    <td className="px-3 py-2 text-tertiary font-mono text-12">{f.feature_id}</td>
                    <td className="px-3 py-2 font-medium text-primary">{f.name}</td>
                    <td className="px-3 py-2 text-tertiary">
                      {f.stage ? stageNameById[f.stage] ?? "—" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-tertiary">
                      {f.estimated_hours != null ? `${f.estimated_hours}h` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{f.requirement_ids?.length ?? 0}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="inline-flex items-center justify-center size-7 rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                        onClick={() => setLinkingFeature(f)}
                        title="關聯需求"
                      >
                        <Link2 className="size-3.5 text-tertiary" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center size-7 rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
                        onClick={() => setEditingFeature(f)}
                        title="編輯"
                      >
                        <Pencil className="size-3.5 text-tertiary" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center size-7 rounded hover:bg-rose-500/10"
                        onClick={() => handleDelete(f)}
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

        {(isCreating || editingFeature) && (
          <FeatureEditModal
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            stages={stages}
            feature={editingFeature}
            onClose={() => {
              setIsCreating(false);
              setEditingFeature(null);
            }}
            onSaved={() => {
              setIsCreating(false);
              setEditingFeature(null);
              reload();
            }}
          />
        )}

        {linkingFeature && (
          <FeatureRequirementsModal
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            feature={linkingFeature}
            allRequirements={requirements}
            onClose={() => setLinkingFeature(null)}
            onSaved={() => {
              setLinkingFeature(null);
              reload();
            }}
          />
        )}
      </div>
    </>
  );
}

// ─── Create / edit modal ─────────────────────────────────────────────────────

type ModalProps = {
  workspaceSlug: string;
  projectId: string;
  stages: IStage[];
  feature: IFeature | null;
  onClose: () => void;
  onSaved: () => void;
};

function FeatureEditModal({ workspaceSlug, projectId, stages, feature, onClose, onSaved }: ModalProps) {
  const [name, setName] = useState(feature?.name ?? "");
  const [description, setDescription] = useState(feature?.description ?? "");
  const [stage, setStage] = useState<string | null>(feature?.stage ?? null);
  const [estimatedHours, setEstimatedHours] = useState<string>(
    feature?.estimated_hours != null ? String(feature.estimated_hours) : ""
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    setErr("");
    if (!name.trim()) {
      setErr("名稱必填");
      return;
    }
    const hours = estimatedHours.trim() === "" ? null : Number(estimatedHours);
    if (hours != null && (Number.isNaN(hours) || hours < 0)) {
      setErr("預估工時必須是 0 或正數");
      return;
    }
    setBusy(true);
    try {
      const payload: TFeatureWritePayload = {
        name: name.trim(),
        description,
        stage: stage || null,
        estimated_hours: hours,
      };
      if (feature) {
        await featureService.patchFeature(workspaceSlug, projectId, feature.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "已更新", message: `功能「${name}」` });
      } else {
        await featureService.createFeature(workspaceSlug, projectId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "已建立", message: `功能「${name}」` });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className={cn("w-full max-w-md rounded-lg border border-subtle bg-surface-1 shadow-xl")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-14 font-semibold text-primary">{feature ? "編輯功能" : "新增功能"}</h3>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">名稱 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：登入頁、訂單匯出…" />
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
              <label className="text-12 font-medium text-secondary mb-1 block">所屬階段</label>
              <select
                className="w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13"
                value={stage ?? ""}
                onChange={(e) => setStage(e.target.value || null)}
              >
                <option value="">（不指定）</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-12 font-medium text-secondary mb-1 block">預估工時</label>
              <Input
                type="number"
                step="0.5"
                min="0"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="可選"
              />
            </div>
          </div>
          {err && <div className="text-12 text-rose-500">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={busy}>
            {feature ? "儲存" : "建立"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Reverse linking modal (Feature → Requirements) ──────────────────────────

type LinkingProps = {
  workspaceSlug: string;
  projectId: string;
  feature: IFeature;
  allRequirements: IRequirement[];
  onClose: () => void;
  onSaved: () => void;
};

function FeatureRequirementsModal({
  workspaceSlug,
  projectId,
  feature,
  allRequirements,
  onClose,
  onSaved,
}: LinkingProps) {
  // The Feature serializer returns requirement_ids[]; use that as initial set
  const initial = useMemo(() => new Set(feature.requirement_ids ?? []), [feature]);
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const toggle = (rid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rid)) next.delete(rid);
      else next.add(rid);
      return next;
    });
  };

  const handleSave = async () => {
    setErr("");
    setBusy(true);
    try {
      const toAdd = [...selected].filter((rid) => !initial.has(rid));
      const toRemove = [...initial].filter((rid) => !selected.has(rid));
      // Use the symmetric endpoint: requirements/<rid>/features/<fid>/
      await Promise.all([
        ...toAdd.map((rid) =>
          featureService.attachFeatureToRequirement(workspaceSlug, projectId, rid, feature.id)
        ),
        ...toRemove.map((rid) =>
          featureService.detachFeatureFromRequirement(workspaceSlug, projectId, rid, feature.id)
        ),
      ]);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已更新", message: `功能「${feature.name}」的需求關聯` });
      onSaved();
    } catch (e) {
      const msg = (e as { detail?: string })?.detail ?? "儲存失敗";
      setErr(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className={cn("w-full max-w-lg rounded-lg border border-subtle bg-surface-1 shadow-xl")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-14 font-semibold text-primary">
            關聯需求 · <span className="font-mono text-12 text-tertiary">{feature.feature_id}</span>{" "}
            <span className="text-tertiary">{feature.name}</span>
          </h3>
        </div>
        <div className="flex flex-col gap-2 px-5 py-4 max-h-96 overflow-y-auto">
          {allRequirements.length === 0 && (
            <div className="text-tertiary text-13 py-6 text-center">尚未建立任何需求。</div>
          )}
          {allRequirements.map((r) => (
            <label
              key={r.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-surface-2/60 cursor-pointer"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
              />
              <span className="flex-1">
                <span className="font-mono text-12 text-tertiary mr-2">{r.requirement_id}</span>
                <span className="text-13 text-primary">{r.description.slice(0, 80)}</span>
              </span>
            </label>
          ))}
          {err && <div className="text-12 text-rose-500">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={busy}>
            儲存
          </Button>
        </div>
      </div>
    </div>
  );
}

export default observer(ProjectFeaturesPage);
