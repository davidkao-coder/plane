/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Requirements admin page – TMS customization.
 *
 * List / create / edit / delete project requirements.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  IFeature,
  IRequirement,
  TRequirementPriority,
  TRequirementWritePayload,
} from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import { FeatureService } from "@/services/feature.service";
import { RequirementService } from "@/services/requirement.service";
import type { Route } from "./+types/page";

const requirementService = new RequirementService();
const featureService = new FeatureService();

const PRIORITY_COLOR: Record<TRequirementPriority, string> = {
  urgent: "bg-rose-500/10 text-rose-600",
  high: "bg-amber-500/10 text-amber-600",
  medium: "bg-blue-500/10 text-blue-600",
  low: "bg-slate-500/10 text-slate-500",
  none: "bg-gray-500/10 text-gray-500",
};
const PRIORITY_LABEL: Record<TRequirementPriority, string> = {
  urgent: "緊急",
  high: "高",
  medium: "中",
  low: "低",
  none: "無",
};

type TStep = "loading" | "ready" | "error";

function ProjectRequirementsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const slug = workspaceSlug.toString();
  const pid = projectId.toString();

  const [step, setStep] = useState<TStep>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [requirements, setRequirements] = useState<IRequirement[]>([]);
  const [features, setFeatures] = useState<IFeature[]>([]); // for linking
  const [editing, setEditing] = useState<IRequirement | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [linkingReq, setLinkingReq] = useState<IRequirement | null>(null);

  const reload = async () => {
    try {
      const [reqs, feats] = await Promise.all([
        requirementService.getRequirements(slug, pid),
        featureService.getFeatures(slug, pid),
      ]);
      setRequirements(reqs);
      setFeatures(feats);
      setStep("ready");
    } catch (e) {
      const msg =
        typeof e === "string"
          ? e
          : (e as { detail?: string })?.detail ?? (e instanceof Error ? e.message : JSON.stringify(e));
      setErrorMsg(msg ?? "Unknown error");
      setStep("error");
    }
  };

  useEffect(() => {
    setStep("loading");
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, pid]);

  const handleDelete = async (req: IRequirement) => {
    if (!confirm(`刪除需求「${req.requirement_id}」？`)) return;
    try {
      await requirementService.deleteRequirement(slug, pid, req.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除", message: req.requirement_id });
      reload();
    } catch (e) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "刪除失敗",
        message: (e as { detail?: string })?.detail ?? "請再試一次",
      });
    }
  };

  return (
    <>
      <PageHead title="需求管理" />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-15 font-semibold text-primary">
            需求 <span className="text-12 font-normal text-tertiary">· {requirements.length}</span>
          </h2>
          <Button variant="primary" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="size-4" /> 新增需求
          </Button>
        </div>

        {step === "loading" && (
          <div className="flex h-72 items-center justify-center text-tertiary text-13">載入中…</div>
        )}
        {step === "error" && (
          <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-13">{errorMsg}</div>
        )}
        {step === "ready" && requirements.length === 0 && !isCreating && (
          <div className="flex h-72 items-center justify-center text-tertiary text-13">
            尚未建立任何需求。
          </div>
        )}

        {step === "ready" && requirements.length > 0 && (
          <div className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
            <table className="w-full text-13">
              <thead className="bg-surface-2 text-12 font-semibold text-secondary">
                <tr>
                  <th className="text-left px-3 py-2 w-20">編號</th>
                  <th className="text-left px-3 py-2">描述</th>
                  <th className="text-left px-3 py-2 w-20">優先級</th>
                  <th className="text-left px-3 py-2 w-32">來源</th>
                  <th className="text-right px-3 py-2 w-32">動作</th>
                </tr>
              </thead>
              <tbody>
                {requirements.map((r) => (
                  <tr key={r.id} className="border-t border-subtle hover:bg-surface-2/40">
                    <td className="px-3 py-2 font-mono text-12 text-tertiary">{r.requirement_id}</td>
                    <td className="px-3 py-2 truncate max-w-md">{r.description}</td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-flex items-center rounded px-2 py-0.5 text-11", PRIORITY_COLOR[r.priority])}>
                        {PRIORITY_LABEL[r.priority]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-tertiary">{r.source || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="px-2 text-11 text-blue-600 hover:underline"
                        onClick={() => setLinkingReq(r)}
                      >
                        關聯功能
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center size-7 rounded hover:bg-black/[0.05]"
                        onClick={() => setEditing(r)}
                      >
                        <Pencil className="size-3.5 text-tertiary" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center size-7 rounded hover:bg-rose-500/10"
                        onClick={() => handleDelete(r)}
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

        {(isCreating || editing) && (
          <RequirementEditModal
            workspaceSlug={slug}
            projectId={pid}
            requirement={editing}
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

        {linkingReq && (
          <RequirementFeaturesModal
            workspaceSlug={slug}
            projectId={pid}
            requirement={linkingReq}
            allFeatures={features}
            onClose={() => setLinkingReq(null)}
          />
        )}
      </div>
    </>
  );
}

// ─── Edit modal ──────────────────────────────────────────────────────────────

function RequirementEditModal({
  workspaceSlug,
  projectId,
  requirement,
  onClose,
  onSaved,
}: {
  workspaceSlug: string;
  projectId: string;
  requirement: IRequirement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(requirement?.description ?? "");
  const [source, setSource] = useState(requirement?.source ?? "");
  const [priority, setPriority] = useState<TRequirementPriority>(requirement?.priority ?? "medium");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr("");
    if (!description.trim()) {
      setErr("描述必填");
      return;
    }
    setBusy(true);
    try {
      const payload: TRequirementWritePayload = { description: description.trim(), source, priority };
      if (requirement) {
        await requirementService.patchRequirement(workspaceSlug, projectId, requirement.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "已更新" });
      } else {
        await requirementService.createRequirement(workspaceSlug, projectId, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "已建立" });
      }
      onSaved();
    } catch (e) {
      setErr((e as { detail?: string })?.detail ?? "儲存失敗");
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
          <h3 className="text-14 font-semibold text-primary">
            {requirement ? `編輯需求 ${requirement.requirement_id}` : "新增需求"}
          </h3>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">描述 *</label>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">來源</label>
            <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="會議 / Email / 客戶..." />
          </div>
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">優先級</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TRequirementPriority)}
              className="w-full rounded border border-subtle bg-surface-1 px-2 py-1 text-13"
            >
              <option value="urgent">緊急</option>
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
              <option value="none">無</option>
            </select>
          </div>
          {err && <div className="text-12 text-rose-500">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" size="sm" onClick={submit} loading={busy}>
            {requirement ? "儲存" : "建立"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Link features modal ────────────────────────────────────────────────────

function RequirementFeaturesModal({
  workspaceSlug,
  projectId,
  requirement,
  allFeatures,
  onClose,
}: {
  workspaceSlug: string;
  projectId: string;
  requirement: IRequirement;
  allFeatures: IFeature[];
  onClose: () => void;
}) {
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    featureService
      .listFeaturesForRequirement(workspaceSlug, projectId, requirement.id)
      .then((feats) => setLinked(new Set(feats.map((f) => f.id))))
      .catch(() => setLinked(new Set()));
  }, [workspaceSlug, projectId, requirement.id]);

  const toggle = async (featureId: string) => {
    setBusy(true);
    try {
      if (linked.has(featureId)) {
        await featureService.detachFeatureFromRequirement(workspaceSlug, projectId, requirement.id, featureId);
        setLinked((s) => {
          const n = new Set(s);
          n.delete(featureId);
          return n;
        });
      } else {
        await featureService.attachFeatureToRequirement(workspaceSlug, projectId, requirement.id, featureId);
        setLinked((s) => new Set(s).add(featureId));
      }
    } catch (e) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "操作失敗",
        message: (e as { detail?: string })?.detail ?? "請再試一次",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-subtle bg-surface-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-14 font-semibold text-primary">關聯功能 — {requirement.requirement_id}</h3>
        </div>
        <div className="px-5 py-4 max-h-96 overflow-y-auto">
          {allFeatures.length === 0 ? (
            <p className="text-13 text-tertiary text-center py-4">此專案尚無功能，先到「功能」頁建立。</p>
          ) : (
            <ul className="space-y-1">
              {allFeatures.map((f) => (
                <li key={f.id}>
                  <label className={cn("flex items-center gap-2 px-2 py-1.5 rounded text-13 cursor-pointer hover:bg-surface-2", busy && "opacity-50")}>
                    <input
                      type="checkbox"
                      checked={linked.has(f.id)}
                      onChange={() => toggle(f.id)}
                      disabled={busy}
                      className="size-4 accent-blue-500"
                    />
                    <span className="font-mono text-11 text-tertiary">{f.feature_id}</span>
                    <span>{f.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>完成</Button>
        </div>
      </div>
    </div>
  );
}

export default observer(ProjectRequirementsPage);
