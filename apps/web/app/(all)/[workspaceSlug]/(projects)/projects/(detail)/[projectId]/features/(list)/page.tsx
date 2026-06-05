/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Features admin page – TMS customization (Phase 1.5).
 *
 * Hierarchy: Module → Requirement → Feature → Issue.
 * Each Feature MUST belong to a Requirement. Creating a Feature triggers
 * the backend to auto-spawn Issues across all stages of the project.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ListTree, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  IFeature,
  IModule,
  IRequirement,
  TFeatureWritePayload,
} from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import { FeatureService, type TFeatureIssue } from "@/services/feature.service";
import { ModuleService } from "@/services/module.service";
import { RequirementService } from "@/services/requirement.service";
import type { Route } from "./+types/page";

const featureService = new FeatureService();
const requirementService = new RequirementService();
const moduleService = new ModuleService();

type TStep = "loading" | "ready" | "error";

function ProjectFeaturesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const slug = workspaceSlug.toString();
  const pid = projectId.toString();

  const [step, setStep] = useState<TStep>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [features, setFeatures] = useState<IFeature[]>([]);
  const [requirements, setRequirements] = useState<IRequirement[]>([]);
  const [modules, setModules] = useState<IModule[]>([]);
  const [editing, setEditing] = useState<IFeature | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [filterModule, setFilterModule] = useState<string>("");
  const [filterRequirement, setFilterRequirement] = useState<string>("");
  const [viewingWorkflow, setViewingWorkflow] = useState<IFeature | null>(null);
  const [editingDeps, setEditingDeps] = useState<IFeature | null>(null);

  const reload = async () => {
    try {
      const [fs, rs, ms] = await Promise.all([
        featureService.getFeatures(slug, pid),
        requirementService.getRequirements(slug, pid),
        moduleService.getModules(slug, pid),
      ]);
      setFeatures(fs);
      setRequirements(rs);
      setModules(ms);
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

  const reqById = useMemo(() => Object.fromEntries(requirements.map((r) => [r.id, r])), [requirements]);
  const moduleNameById = useMemo(
    () => Object.fromEntries(modules.map((m) => [m.id, m.name])),
    [modules]
  );

  // Requirements filtered by module (for the requirement filter dropdown)
  const reqsInModule = useMemo(() => {
    if (!filterModule) return requirements;
    return requirements.filter((r) => r.module === filterModule);
  }, [requirements, filterModule]);

  const filtered = useMemo(() => {
    return features.filter((f) => {
      if (filterRequirement) return f.requirement === filterRequirement;
      if (filterModule) {
        const r = f.requirement ? reqById[f.requirement] : undefined;
        return r?.module === filterModule;
      }
      return true;
    });
  }, [features, reqById, filterModule, filterRequirement]);

  const ordered = useMemo(
    () => [...filtered].sort((a, b) => a.sort_order - b.sort_order),
    [filtered]
  );

  const handleDelete = async (feature: IFeature) => {
    if (!confirm(`刪除功能「${feature.name}」？\n底下自動展開的工序 Issue 會一起被刪除。`)) return;
    try {
      await featureService.deleteFeature(slug, pid, feature.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除", message: feature.feature_id });
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
      <PageHead title="功能管理" />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-15 font-semibold text-primary">
              功能 <span className="text-12 font-normal text-tertiary">· {ordered.length}</span>
            </h2>
            <select
              value={filterModule}
              onChange={(e) => {
                setFilterModule(e.target.value);
                setFilterRequirement("");
              }}
              className="rounded border border-subtle bg-surface-1 px-2 py-1 text-12"
            >
              <option value="">全部分類</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={filterRequirement}
              onChange={(e) => setFilterRequirement(e.target.value)}
              className="rounded border border-subtle bg-surface-1 px-2 py-1 text-12"
            >
              <option value="">全部需求</option>
              {reqsInModule.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.requirement_id} {r.description.slice(0, 30)}
                </option>
              ))}
            </select>
          </div>
          <Button variant="primary" size="sm" onClick={() => setIsCreating(true)}>
            <Plus className="size-4" /> 新增功能
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
            尚未建立任何功能。
          </div>
        )}

        {step === "ready" && ordered.length > 0 && (
          <div className="rounded-md border border-subtle bg-surface-1 overflow-hidden">
            <table className="w-full text-13">
              <thead className="bg-surface-2 text-12 font-semibold text-secondary">
                <tr>
                  <th className="text-left px-3 py-2 w-24">編號</th>
                  <th className="text-left px-3 py-2">名稱</th>
                  <th className="text-left px-3 py-2 w-32">所屬分類</th>
                  <th className="text-left px-3 py-2 w-40">所屬需求</th>
                  <th className="text-right px-3 py-2 w-20">工時</th>
                  <th className="text-right px-3 py-2 w-24">動作</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((f) => {
                  const req = f.requirement ? reqById[f.requirement] : undefined;
                  const moduleName = req?.module ? moduleNameById[req.module] : null;
                  return (
                    <tr key={f.id} className="border-t border-subtle hover:bg-surface-2/40">
                      <td className="px-3 py-2 text-tertiary font-mono text-12">{f.feature_id}</td>
                      <td className="px-3 py-2 font-medium text-primary">{f.name}</td>
                      <td className="px-3 py-2 text-tertiary truncate max-w-xs">{moduleName ?? "—"}</td>
                      <td className="px-3 py-2 text-tertiary truncate max-w-xs">
                        {req ? (
                          <>
                            <span className="font-mono text-11 mr-1">{req.requirement_id}</span>
                            <span>{req.description.slice(0, 30)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-tertiary">
                        {f.estimated_hours != null ? `${f.estimated_hours}h` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center size-7 rounded hover:bg-black/[0.05]"
                          onClick={() => setViewingWorkflow(f)}
                          title="查看工序"
                        >
                          <ListTree className="size-3.5 text-tertiary" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center size-7 rounded hover:bg-black/[0.05]"
                          onClick={() => setEditingDeps(f)}
                          title="依賴關係"
                        >
                          <Link2 className={cn("size-3.5", (f.depends_on_ids?.length ?? 0) > 0 ? "text-amber-500" : "text-tertiary")} />
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center size-7 rounded hover:bg-black/[0.05]"
                          onClick={() => setEditing(f)}
                        >
                          <Pencil className="size-3.5 text-tertiary" />
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center size-7 rounded hover:bg-rose-500/10"
                          onClick={() => handleDelete(f)}
                        >
                          <Trash2 className="size-3.5 text-rose-500" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {viewingWorkflow && (
          <FeatureWorkflowModal
            workspaceSlug={slug}
            projectId={pid}
            feature={viewingWorkflow}
            onClose={() => setViewingWorkflow(null)}
          />
        )}

        {editingDeps && (
          <FeatureDependencyModal
            workspaceSlug={slug}
            projectId={pid}
            feature={editingDeps}
            allFeatures={features}
            onClose={() => setEditingDeps(null)}
            onSaved={() => {
              setEditingDeps(null);
              reload();
            }}
          />
        )}

        {(isCreating || editing) && (
          <FeatureEditModal
            workspaceSlug={slug}
            projectId={pid}
            modules={modules}
            requirements={requirements}
            feature={editing}
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

// ─── Create / edit modal ─────────────────────────────────────────────────────

function FeatureEditModal({
  workspaceSlug,
  projectId,
  modules,
  requirements,
  feature,
  onClose,
  onSaved,
}: {
  workspaceSlug: string;
  projectId: string;
  modules: IModule[];
  requirements: IRequirement[];
  feature: IFeature | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialReq = feature?.requirement
    ? requirements.find((r) => r.id === feature.requirement)
    : undefined;
  const [moduleId, setModuleId] = useState<string>(initialReq?.module ?? "");
  const [requirementId, setRequirementId] = useState<string>(feature?.requirement ?? "");
  const [name, setName] = useState(feature?.name ?? "");
  const [description, setDescription] = useState(feature?.description ?? "");
  const [estimatedHours, setEstimatedHours] = useState<string>(
    feature?.estimated_hours != null ? String(feature.estimated_hours) : ""
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reqsInModule = useMemo(() => {
    if (!moduleId) return requirements;
    return requirements.filter((r) => r.module === moduleId);
  }, [requirements, moduleId]);

  const submit = async () => {
    setErr("");
    if (!requirementId) {
      setErr("所屬需求必填");
      return;
    }
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
        requirement: requirementId,
        estimated_hours: hours,
      };
      if (feature) {
        await featureService.patchFeature(workspaceSlug, projectId, feature.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "已更新", message: `${feature.feature_id} ${name}` });
      } else {
        const created = await featureService.createFeature(workspaceSlug, projectId, payload);
        const n = created.spawned_issues ?? 0;
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "已建立",
          message: n > 0 ? `${name} · 自動產生 ${n} 個工序工作項目` : name,
        });
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
      <div className={cn("w-full max-w-md rounded-lg border border-subtle bg-surface-1 shadow-xl")} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-14 font-semibold text-primary">
            {feature ? `編輯功能 ${feature.feature_id}` : "新增功能"}
          </h3>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">所屬分類 *</label>
            <select
              value={moduleId}
              onChange={(e) => {
                setModuleId(e.target.value);
                setRequirementId("");
              }}
              className="w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13"
            >
              <option value="">— 選擇分類 —</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">所屬需求 *</label>
            <select
              value={requirementId}
              onChange={(e) => setRequirementId(e.target.value)}
              className="w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13"
              disabled={!moduleId}
            >
              <option value="">— 選擇需求 —</option>
              {reqsInModule.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.requirement_id} {r.description.slice(0, 40)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">名稱 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：整合信用卡 SDK" />
          </div>
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">描述</label>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">預估總工時（hours）</label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={estimatedHours}
              onChange={(e) => setEstimatedHours(e.target.value)}
              placeholder="可選 — 通常由工序加總"
            />
          </div>
          {!feature && (
            <div className="text-11 text-tertiary bg-blue-50/40 border border-blue-100 rounded px-2 py-1.5">
              ⓘ 建立後系統會依「階段工序樣板」自動產生工作項目
            </div>
          )}
          {err && <div className="text-12 text-rose-500">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" size="sm" onClick={submit} loading={busy}>
            {feature ? "儲存" : "建立"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Feature workflow panel ──────────────────────────────────────────────────
// Lists the Issues auto-spawned from this Feature, grouped by Stage.

function FeatureWorkflowModal({
  workspaceSlug,
  projectId,
  feature,
  onClose,
}: {
  workspaceSlug: string;
  projectId: string;
  feature: IFeature;
  onClose: () => void;
}) {
  const [issues, setIssues] = useState<TFeatureIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    featureService
      .getIssuesForFeature(workspaceSlug, projectId, feature.id)
      .then((list) => setIssues(list))
      .catch((e) => setErr((e as { detail?: string })?.detail ?? "載入失敗"))
      .finally(() => setLoading(false));
  }, [workspaceSlug, projectId, feature.id]);

  // Group by stage
  const grouped = useMemo(() => {
    const byStage = new Map<string, { name: string; sortOrder: number; issues: TFeatureIssue[] }>();
    for (const issue of issues) {
      const stageId = issue.stage_id ?? "_no_stage";
      if (!byStage.has(stageId)) {
        byStage.set(stageId, {
          name: issue.stage_name ?? "未指派階段",
          sortOrder: issue.stage_sort_order ?? 99999,
          issues: [],
        });
      }
      byStage.get(stageId)!.issues.push(issue);
    }
    return [...byStage.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [issues]);

  const totalEstimate = issues.reduce((s, i) => s + (i.estimate_hours ?? 0), 0);
  const totalActual = issues.reduce((s, i) => s + (i.actual_hours ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className={cn("w-full max-w-3xl rounded-lg border border-subtle bg-surface-1 shadow-xl")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-14 font-semibold text-primary">
            {feature.feature_id} {feature.name} · 工序展開
          </h3>
          <p className="text-11 text-tertiary mt-1">
            建立 Feature 時自動產生的工作項目，依階段排序
          </p>
        </div>

        <div className="px-5 py-4 max-h-[calc(100vh-220px)] overflow-y-auto">
          {loading && <div className="text-13 text-tertiary py-4 text-center">載入中…</div>}
          {err && <div className="text-13 text-rose-500 py-2">{err}</div>}
          {!loading && !err && issues.length === 0 && (
            <div className="text-13 text-tertiary py-4 text-center">
              此 Feature 沒有自動展開的工序。
              <br />
              <span className="text-11">（可能是 Stage 沒掛 ProcessTemplate）</span>
            </div>
          )}

          {!loading && grouped.length > 0 && (
            <div className="flex flex-col gap-4">
              {grouped.map((group) => (
                <div key={group.id}>
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-12 font-semibold text-secondary uppercase tracking-wide">
                      {group.name}
                    </h4>
                    <span className="text-11 text-tertiary">
                      {group.issues.length} 項 · {group.issues.reduce((s, i) => s + (i.estimate_hours ?? 0), 0)}h 預估
                    </span>
                  </div>
                  <div className="rounded border border-subtle bg-surface-1 overflow-hidden">
                    <table className="w-full text-12">
                      <thead className="bg-surface-2 text-11 text-tertiary">
                        <tr>
                          <th className="text-left px-3 py-1.5 w-32">工序</th>
                          <th className="text-left px-3 py-1.5">任務名稱</th>
                          <th className="text-right px-3 py-1.5 w-20">預估</th>
                          <th className="text-right px-3 py-1.5 w-20">實際</th>
                          <th className="text-left px-3 py-1.5 w-24">狀態</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.issues.map((i) => (
                          <tr key={i.id} className="border-t border-subtle">
                            <td className="px-3 py-1.5 font-medium">
                              {i.process_step_name ?? "—"}
                            </td>
                            <td className="px-3 py-1.5 text-secondary truncate max-w-md">{i.name}</td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {i.estimate_hours != null ? `${i.estimate_hours}h` : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono">
                              {i.actual_hours != null ? `${i.actual_hours}h` : "—"}
                            </td>
                            <td className="px-3 py-1.5 text-tertiary">{i.state_name ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-subtle flex items-center justify-between">
          <span className="text-12 text-tertiary">
            合計 <span className="font-mono text-primary">{issues.length}</span> 項 ·
            預估 <span className="font-mono text-primary">{totalEstimate}h</span> ·
            實際 <span className="font-mono text-primary">{totalActual}h</span>
          </span>
          <Button variant="primary" size="sm" onClick={onClose}>
            關閉
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Feature dependency modal (B3) ───────────────────────────────────────────
// Pick which other features this feature is blocked by (must finish first).

function FeatureDependencyModal({
  workspaceSlug,
  projectId,
  feature,
  allFeatures,
  onClose,
  onSaved,
}: {
  workspaceSlug: string;
  projectId: string;
  feature: IFeature;
  allFeatures: IFeature[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo(() => new Set(feature.depends_on_ids ?? []), [feature]);
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const candidates = allFeatures.filter((f) => f.id !== feature.id);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setErr("");
    setBusy(true);
    try {
      const toAdd = [...selected].filter((id) => !initial.has(id));
      const toRemove = [...initial].filter((id) => !selected.has(id));
      for (const id of toAdd) {
        await featureService.addDependency(workspaceSlug, projectId, feature.id, id);
      }
      for (const id of toRemove) {
        await featureService.removeDependency(workspaceSlug, projectId, feature.id, id);
      }
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已更新依賴" });
      onSaved();
    } catch (e) {
      setErr((e as { error?: string; detail?: string })?.error ?? (e as { detail?: string })?.detail ?? "儲存失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-subtle bg-surface-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-14 font-semibold text-primary">
            依賴關係 · <span className="font-mono text-12 text-tertiary">{feature.feature_id}</span> {feature.name}
          </h3>
          <p className="text-11 text-tertiary mt-0.5">勾選此功能「必須等哪些功能先完成」（前置依賴）</p>
        </div>
        <div className="flex flex-col gap-1 px-5 py-4 max-h-96 overflow-y-auto">
          {candidates.length === 0 && (
            <div className="text-tertiary text-13 py-6 text-center">沒有其他功能可作為前置依賴</div>
          )}
          {candidates.map((f) => (
            <label key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-2/60 cursor-pointer">
              <input type="checkbox" checked={selected.has(f.id)} onChange={() => toggle(f.id)} className="accent-blue-500" />
              <span className="font-mono text-11 text-tertiary">{f.feature_id}</span>
              <span className="text-13 text-primary truncate">{f.name}</span>
            </label>
          ))}
          {err && <div className="text-12 text-rose-500">{err}</div>}
        </div>
        <div className="px-5 py-3 border-t border-subtle flex items-center justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={busy}>取消</Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={busy}>儲存</Button>
        </div>
      </div>
    </div>
  );
}

export default observer(ProjectFeaturesPage);
