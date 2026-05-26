/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Workboard – TMS unified hierarchy view (W1 foundation + W2 CRUD + W3 inline stage edit).
 *
 * Stage / Module / Requirement / Feature / Issue all on one page.
 * Future: layout switcher (W4), DnD (W5), batch ops (W6).
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  ListChecks,
  Package,
  Pencil,
  Plus,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IFeature, IModule, IRequirement, IStage } from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import { FeatureService, type TFeatureIssue } from "@/services/feature.service";
import { IssueService } from "@/services/issue/issue.service";
import { ModuleService } from "@/services/module.service";
import { RequirementService } from "@/services/requirement.service";
import { StageService } from "@/services/stage.service";
import { ProcessTemplateService, type TProcessStep } from "@/services/project-template.service";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
import type { Route } from "./+types/page";

const moduleService = new ModuleService();
const requirementService = new RequirementService();
const featureService = new FeatureService();
const stageService = new StageService();
const issueService = new IssueService();
const processTemplateService = new ProcessTemplateService();

const UNSORTED_NAME = "未分類";

type TNodeSel =
  | { kind: "all" }
  | { kind: "module"; id: string }
  | { kind: "requirement"; id: string }
  | { kind: "feature"; id: string };

type TAddTarget =
  | { kind: "module" }
  | { kind: "requirement"; moduleId: string }
  | { kind: "feature"; requirementId: string }
  | { kind: "issue"; featureId: string };

type TEditTarget =
  | { kind: "module"; data: IModule }
  | { kind: "requirement"; data: IRequirement }
  | { kind: "feature"; data: IFeature }
  | { kind: "issue"; data: TFeatureIssue };

function WorkboardPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const slug = workspaceSlug.toString();
  const pid = projectId.toString();

  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<IModule[]>([]);
  const [requirements, setRequirements] = useState<IRequirement[]>([]);
  const [features, setFeatures] = useState<IFeature[]>([]);
  const [stages, setStages] = useState<IStage[]>([]);
  const [issues, setIssues] = useState<TFeatureIssue[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<TNodeSel>({ kind: "all" });
  const [stageFilter, setStageFilter] = useState<string | null>(null);

  const [addTarget, setAddTarget] = useState<TAddTarget | null>(null);
  const [editTarget, setEditTarget] = useState<TEditTarget | null>(null);

  const reloadStructure = async () => {
    setLoading(true);
    try {
      const [mods, reqs, feats, sts] = await Promise.all([
        moduleService.getModules(slug, pid),
        requirementService.getRequirements(slug, pid),
        featureService.getFeatures(slug, pid),
        stageService.getStages(slug, pid),
      ]);
      setModules(mods);
      setRequirements(reqs);
      setFeatures(feats);
      setStages(sts);
    } catch (e) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "載入失敗",
        message: (e as { detail?: string })?.detail ?? "請重新整理頁面",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reloadStructure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, pid]);

  const reloadIssues = async () => {
    setIssuesLoading(true);
    try {
      let acc: TFeatureIssue[] = [];
      if (selected.kind === "all") {
        const results = await Promise.all(
          features.map((f) => featureService.getIssuesForFeature(slug, pid, f.id))
        );
        acc = results.flat();
      } else if (selected.kind === "feature") {
        acc = await featureService.getIssuesForFeature(slug, pid, selected.id);
      } else if (selected.kind === "requirement") {
        const feats = features.filter((f) => f.requirement === selected.id);
        const results = await Promise.all(feats.map((f) => featureService.getIssuesForFeature(slug, pid, f.id)));
        acc = results.flat();
      } else if (selected.kind === "module") {
        const reqsInMod = requirements.filter((r) => r.module === selected.id);
        const feats = features.filter((f) => reqsInMod.some((r) => r.id === f.requirement));
        const results = await Promise.all(feats.map((f) => featureService.getIssuesForFeature(slug, pid, f.id)));
        acc = results.flat();
      }
      setIssues(acc);
    } catch {
      setIssues([]);
    } finally {
      setIssuesLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) reloadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, features, requirements, loading]);

  const toggleExpanded = (id: string) =>
    setExpanded((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const filteredIssues = useMemo(
    () => (stageFilter ? issues.filter((i) => i.stage_id === stageFilter) : issues),
    [issues, stageFilter]
  );

  const standardStages = useMemo(
    () => [...stages].filter((s) => s.key && s.key !== "unsorted").sort((a, b) => a.sort_order - b.sort_order),
    [stages]
  );

  const reqsByModule = useMemo(() => {
    const m = new Map<string, IRequirement[]>();
    for (const r of requirements) {
      if (!r.module) continue;
      const a = m.get(r.module) ?? [];
      a.push(r);
      m.set(r.module, a);
    }
    return m;
  }, [requirements]);

  const featuresByReq = useMemo(() => {
    const m = new Map<string, IFeature[]>();
    for (const f of features) {
      if (!f.requirement) continue;
      const a = m.get(f.requirement) ?? [];
      a.push(f);
      m.set(f.requirement, a);
    }
    return m;
  }, [features]);

  // ─── delete helpers ────────────────────────────────────────────────────
  const handleDeleteModule = async (m: IModule) => {
    if (m.name === UNSORTED_NAME) {
      setToast({ type: TOAST_TYPE.WARNING, title: "禁止刪除", message: "系統「未分類」鏈不能刪除" });
      return;
    }
    if (!confirm(`刪除分類「${m.name}」？\n底下需求 / 功能 / 工作項目會連帶刪除。`)) return;
    try {
      await moduleService.deleteModule(slug, pid, m.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除" });
      reloadStructure();
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "刪除失敗", message: (e as { detail?: string })?.detail ?? "" });
    }
  };
  const handleDeleteRequirement = async (r: IRequirement) => {
    if (!confirm(`刪除需求「${r.requirement_id}」？\n底下功能與工作項目會連帶刪除。`)) return;
    try {
      await requirementService.deleteRequirement(slug, pid, r.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除" });
      reloadStructure();
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "刪除失敗", message: (e as { detail?: string })?.detail ?? "" });
    }
  };
  const handleDeleteFeature = async (f: IFeature) => {
    if (!confirm(`刪除功能「${f.feature_id} ${f.name}」？\n底下的工序工作項目會連帶刪除。`)) return;
    try {
      await featureService.deleteFeature(slug, pid, f.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除" });
      reloadStructure();
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "刪除失敗", message: (e as { detail?: string })?.detail ?? "" });
    }
  };
  const handleDeleteIssue = async (i: TFeatureIssue) => {
    if (!confirm(`刪除工作項目「${i.name}」？`)) return;
    try {
      await issueService.deleteIssue(slug, pid, i.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已刪除" });
      reloadIssues();
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "刪除失敗", message: (e as { detail?: string })?.detail ?? "" });
    }
  };

  return (
    <>
      <PageHead title="整合檢視" />
      <div className="flex h-full w-full overflow-hidden">
        {/* ── Left ──────────────────────────────────────────────────────── */}
        <aside className="w-80 flex-shrink-0 border-r border-subtle overflow-y-auto">
          <div className="px-3 py-2 border-b border-subtle bg-surface-2/60 flex items-center justify-between">
            <h3 className="text-12 font-semibold text-secondary">業務樹</h3>
            <button
              type="button"
              onClick={() => setAddTarget({ kind: "module" })}
              className="text-11 text-blue-600 hover:underline inline-flex items-center gap-0.5"
            >
              <Plus className="size-3" />分類
            </button>
          </div>

          <div className="p-2 text-13">
            <button
              type="button"
              onClick={() => setSelected({ kind: "all" })}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded hover:bg-surface-2",
                selected.kind === "all" && "bg-blue-500/10 text-blue-600 font-medium"
              )}
            >
              全部
            </button>

            {modules
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((m) => {
                const moduleReqs = reqsByModule.get(m.id) ?? [];
                const isOpen = expanded.has(`m:${m.id}`);
                const isUnsorted = m.name === UNSORTED_NAME;
                return (
                  <div key={m.id} className="mt-0.5">
                    <div
                      className={cn(
                        "group flex items-center gap-1 px-1 py-1 rounded hover:bg-surface-2",
                        selected.kind === "module" && selected.id === m.id && "bg-blue-500/10"
                      )}
                    >
                      <button onClick={() => toggleExpanded(`m:${m.id}`)} className="p-0.5">
                        {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      </button>
                      <Folder className="size-3.5 text-amber-500" />
                      <button
                        onClick={() => setSelected({ kind: "module", id: m.id })}
                        className="flex-1 text-left truncate"
                        title={m.name}
                      >
                        {m.name}
                      </button>
                      <span className="text-10 text-tertiary">{moduleReqs.length}</span>
                      <span className="invisible group-hover:visible flex items-center gap-0.5 ml-1">
                        <NodeActionBtn icon={Plus} title="加需求" onClick={() => setAddTarget({ kind: "requirement", moduleId: m.id })} />
                        {!isUnsorted && (
                          <>
                            <NodeActionBtn icon={Pencil} title="編輯" onClick={() => setEditTarget({ kind: "module", data: m })} />
                            <NodeActionBtn icon={Trash2} title="刪除" danger onClick={() => handleDeleteModule(m)} />
                          </>
                        )}
                      </span>
                    </div>
                    {isOpen &&
                      moduleReqs.map((r) => {
                        const reqFeatures = featuresByReq.get(r.id) ?? [];
                        const reqOpen = expanded.has(`r:${r.id}`);
                        return (
                          <div key={r.id} className="ml-5 mt-0.5">
                            <div
                              className={cn(
                                "group flex items-center gap-1 px-1 py-1 rounded hover:bg-surface-2",
                                selected.kind === "requirement" && selected.id === r.id && "bg-blue-500/10"
                              )}
                            >
                              <button onClick={() => toggleExpanded(`r:${r.id}`)} className="p-0.5">
                                {reqOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                              </button>
                              <ListChecks className="size-3.5 text-blue-500" />
                              <button
                                onClick={() => setSelected({ kind: "requirement", id: r.id })}
                                className="flex-1 text-left truncate text-12"
                                title={r.description}
                              >
                                <span className="font-mono text-10 text-tertiary mr-1">{r.requirement_id}</span>
                                {r.description.slice(0, 30)}
                              </button>
                              <span className="text-10 text-tertiary">{reqFeatures.length}</span>
                              <span className="invisible group-hover:visible flex items-center gap-0.5 ml-1">
                                <NodeActionBtn icon={Plus} title="加功能" onClick={() => setAddTarget({ kind: "feature", requirementId: r.id })} />
                                <NodeActionBtn icon={Pencil} title="編輯" onClick={() => setEditTarget({ kind: "requirement", data: r })} />
                                <NodeActionBtn icon={Trash2} title="刪除" danger onClick={() => handleDeleteRequirement(r)} />
                              </span>
                            </div>
                            {reqOpen &&
                              reqFeatures.map((f) => (
                                <div
                                  key={f.id}
                                  className={cn(
                                    "ml-5 mt-0.5 group flex items-center gap-1 px-1 py-1 rounded hover:bg-surface-2",
                                    selected.kind === "feature" && selected.id === f.id && "bg-blue-500/10"
                                  )}
                                >
                                  <Package className="size-3.5 text-emerald-500 ml-3" />
                                  <button
                                    onClick={() => setSelected({ kind: "feature", id: f.id })}
                                    className="flex-1 text-left truncate text-12"
                                    title={f.name}
                                  >
                                    <span className="font-mono text-10 text-tertiary mr-1">{f.feature_id}</span>
                                    {f.name}
                                  </button>
                                  <span className="invisible group-hover:visible flex items-center gap-0.5 ml-1">
                                    <NodeActionBtn icon={Plus} title="加工項" onClick={() => setAddTarget({ kind: "issue", featureId: f.id })} />
                                    <NodeActionBtn icon={Pencil} title="編輯" onClick={() => setEditTarget({ kind: "feature", data: f })} />
                                    <NodeActionBtn icon={Trash2} title="刪除" danger onClick={() => handleDeleteFeature(f)} />
                                  </span>
                                </div>
                              ))}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
          </div>
        </aside>

        {/* ── Right ─────────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="border-b border-subtle px-4 py-2 flex items-center gap-3 bg-surface-1 sticky top-0 z-10 flex-wrap">
            <h3 className="text-13 font-semibold text-primary">
              工作項目 <span className="text-11 text-tertiary font-normal">· {filteredIssues.length}</span>
            </h3>
            <div className="flex items-center gap-1 flex-wrap text-11">
              <button
                type="button"
                onClick={() => setStageFilter(null)}
                className={cn(
                  "px-2 py-0.5 rounded border",
                  stageFilter === null
                    ? "border-blue-500 text-blue-600 bg-blue-500/10"
                    : "border-subtle text-tertiary hover:bg-surface-2"
                )}
              >
                全部階段
              </button>
              {standardStages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStageFilter(s.id)}
                  className={cn(
                    "px-2 py-0.5 rounded border",
                    stageFilter === s.id
                      ? "border-blue-500 text-blue-600 bg-blue-500/10"
                      : "border-subtle text-tertiary hover:bg-surface-2"
                  )}
                  title={s.name}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-72 text-tertiary text-13">載入結構中…</div>
          ) : issuesLoading ? (
            <div className="flex items-center justify-center h-72 text-tertiary text-13">載入工作項目…</div>
          ) : filteredIssues.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-tertiary text-13">此選擇下沒有工作項目</div>
          ) : (
            <div className="p-4">
              <table className="w-full text-12">
                <thead className="bg-surface-2 text-11 text-tertiary">
                  <tr>
                    <th className="text-left px-3 py-1.5 w-16">編號</th>
                    <th className="text-left px-3 py-1.5">名稱</th>
                    <th className="text-left px-3 py-1.5 w-24">階段</th>
                    <th className="text-left px-3 py-1.5 w-20">工序</th>
                    <th className="text-left px-3 py-1.5 w-24">狀態</th>
                    <th className="text-right px-3 py-1.5 w-16">預估</th>
                    <th className="text-right px-3 py-1.5 w-16">實際</th>
                    <th className="text-right px-3 py-1.5 w-20">動作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((i) => (
                    <tr key={i.id} className="border-t border-subtle hover:bg-surface-2/40 group">
                      <td className="px-3 py-1.5 font-mono text-11 text-tertiary">#{i.sequence_id}</td>
                      <td className="px-3 py-1.5 truncate max-w-md">{i.name}</td>
                      <td className="px-3 py-1.5 text-tertiary">{i.stage_name ?? "—"}</td>
                      <td className="px-3 py-1.5 text-tertiary">{i.process_step_name ?? "—"}</td>
                      <td className="px-3 py-1.5 text-tertiary">{i.state_name ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {i.estimate_hours != null ? `${i.estimate_hours}h` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">
                        {i.actual_hours != null ? `${i.actual_hours}h` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={() => setEditTarget({ kind: "issue", data: i })}
                          className="invisible group-hover:visible inline-flex items-center justify-center size-6 rounded hover:bg-black/[0.05]"
                          title="編輯"
                        >
                          <Pencil className="size-3 text-tertiary" />
                        </button>
                        <button
                          onClick={() => handleDeleteIssue(i)}
                          className="invisible group-hover:visible inline-flex items-center justify-center size-6 rounded hover:bg-rose-500/10"
                          title="刪除"
                        >
                          <Trash2 className="size-3 text-rose-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {addTarget && (
        <QuickCreateModal
          target={addTarget}
          slug={slug}
          pid={pid}
          modules={modules}
          requirements={requirements}
          features={features}
          stages={stages}
          onClose={() => setAddTarget(null)}
          onSaved={() => {
            setAddTarget(null);
            reloadStructure().then(() => reloadIssues());
          }}
        />
      )}
      {editTarget && (
        <QuickEditModal
          target={editTarget}
          slug={slug}
          pid={pid}
          stages={stages}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            reloadStructure().then(() => reloadIssues());
          }}
        />
      )}
    </>
  );
}

// ─── helper button ──────────────────────────────────────────────────────────
function NodeActionBtn({
  icon: Icon,
  title,
  onClick,
  danger,
}: {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "size-5 inline-flex items-center justify-center rounded",
        danger ? "hover:bg-rose-500/10" : "hover:bg-black/[0.05]"
      )}
    >
      <Icon className={cn("size-3", danger ? "text-rose-500" : "text-tertiary")} />
    </button>
  );
}

// ─── create modal (4-in-1) ──────────────────────────────────────────────────

function QuickCreateModal({
  target,
  slug,
  pid,
  modules,
  requirements,
  features,
  stages,
  onClose,
  onSaved,
}: {
  target: TAddTarget;
  slug: string;
  pid: string;
  modules: IModule[];
  requirements: IRequirement[];
  features: IFeature[];
  stages: IStage[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setErr("");
    if (!name.trim()) {
      setErr("名稱必填");
      return;
    }
    setBusy(true);
    try {
      if (target.kind === "module") {
        await moduleService.createModule(slug, pid, { name: name.trim(), description } as any);
      } else if (target.kind === "requirement") {
        await requirementService.createRequirement(slug, pid, {
          description: name.trim(),
          source: description,
          priority: "medium",
          module: target.moduleId,
        });
      } else if (target.kind === "feature") {
        await featureService.createFeature(slug, pid, {
          name: name.trim(),
          description,
          requirement: target.requirementId,
        });
      } else if (target.kind === "issue") {
        // standard Plane issue create – just name + feature_id
        await issueService.createIssue(slug, pid, {
          name: name.trim(),
          description_html: description ? `<p>${description}</p>` : "<p></p>",
          feature: target.featureId,
        } as any);
      }
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已建立" });
      onSaved();
    } catch (ex) {
      setErr((ex as { detail?: string })?.detail ?? "建立失敗");
    } finally {
      setBusy(false);
    }
  };

  const labels = {
    module: { title: "新增分類", nameLabel: "名稱", placeholder: "例：訂單模組" },
    requirement: { title: "新增需求", nameLabel: "描述", placeholder: "例：商品列表頁" },
    feature: { title: "新增功能", nameLabel: "名稱", placeholder: "例：整合信用卡 SDK" },
    issue: { title: "新增工作項目", nameLabel: "名稱", placeholder: "例：補一條額外的整合測試" },
  }[target.kind];

  return (
    <Modal onClose={onClose} title={labels.title}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className="text-12 font-medium text-secondary mb-1 block">{labels.nameLabel} *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={labels.placeholder} autoFocus />
        </div>
        <div>
          <label className="text-12 font-medium text-secondary mb-1 block">
            {target.kind === "requirement" ? "來源（可選）" : "描述"}
          </label>
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </div>
        {target.kind === "feature" && (
          <div className="text-11 text-tertiary bg-blue-50/40 border border-blue-100 rounded px-2 py-1.5">
            ⓘ 建立後系統會依「階段工序樣板」自動產生工作項目
          </div>
        )}
        {err && <div className="text-12 text-rose-500">{err}</div>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={busy} type="button">取消</Button>
          <Button variant="primary" size="sm" loading={busy} type="submit">建立</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── edit modal (4-in-1) ─────────────────────────────────────────────────────

function QuickEditModal({
  target,
  slug,
  pid,
  stages,
  onClose,
  onSaved,
}: {
  target: TEditTarget;
  slug: string;
  pid: string;
  stages: IStage[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { getProjectStates } = useProjectState();
  const states = getProjectStates(pid) ?? [];

  // Common form fields
  const initial = (() => {
    if (target.kind === "module") return { name: target.data.name, description: target.data.description ?? "" };
    if (target.kind === "requirement") return { name: target.data.description, description: target.data.source ?? "" };
    if (target.kind === "feature") return { name: target.data.name, description: target.data.description ?? "" };
    return { name: target.data.name, description: "" };
  })();

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [stageId, setStageId] = useState<string | null>(
    target.kind === "issue" ? target.data.stage_id : null
  );
  const [processStepId, setProcessStepId] = useState<string | null>(
    target.kind === "issue" ? target.data.process_step_id : null
  );
  const [stateId, setStateId] = useState<string | null>(
    target.kind === "issue" ? target.data.state_id : null
  );
  const [stepsForStage, setStepsForStage] = useState<TProcessStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Load process steps for selected stage (Issue edit only)
  useEffect(() => {
    if (target.kind !== "issue") return;
    if (!stageId) {
      setStepsForStage([]);
      return;
    }
    const stage = stages.find((s) => s.id === stageId);
    if (!stage?.process_template) {
      setStepsForStage([]);
      return;
    }
    processTemplateService
      .listSteps(slug, stage.process_template)
      .then(setStepsForStage)
      .catch(() => setStepsForStage([]));
  }, [stageId, stages, slug, target.kind]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    setErr("");
    if (!name.trim()) {
      setErr("名稱必填");
      return;
    }
    setBusy(true);
    try {
      if (target.kind === "module") {
        await moduleService.patchModule(slug, pid, target.data.id, { name: name.trim(), description } as any);
      } else if (target.kind === "requirement") {
        await requirementService.patchRequirement(slug, pid, target.data.id, {
          description: name.trim(),
          source: description,
        });
      } else if (target.kind === "feature") {
        await featureService.patchFeature(slug, pid, target.data.id, { name: name.trim(), description });
      } else if (target.kind === "issue") {
        await issueService.patchIssue(slug, pid, target.data.id, {
          name: name.trim(),
          stage: stageId,
          process_step: processStepId,
          state: stateId,
        } as any);
      }
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已更新" });
      onSaved();
    } catch (ex) {
      setErr((ex as { detail?: string })?.detail ?? "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  const title = {
    module: "編輯分類",
    requirement: "編輯需求",
    feature: "編輯功能",
    issue: "編輯工作項目",
  }[target.kind];

  return (
    <Modal onClose={onClose} title={title} wide={target.kind === "issue"}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <label className="text-12 font-medium text-secondary mb-1 block">
            {target.kind === "requirement" ? "描述" : "名稱"} *
          </label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>

        {target.kind !== "issue" && (
          <div>
            <label className="text-12 font-medium text-secondary mb-1 block">
              {target.kind === "requirement" ? "來源" : "描述"}
            </label>
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        )}

        {target.kind === "issue" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-12 font-medium text-secondary mb-1 block">階段</label>
                <select
                  value={stageId ?? ""}
                  onChange={(e) => {
                    setStageId(e.target.value || null);
                    setProcessStepId(null);
                  }}
                  className="w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13"
                >
                  <option value="">— 未指定 —</option>
                  {stages
                    .filter((s) => s.key && s.key !== "unsorted")
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-12 font-medium text-secondary mb-1 block">工序</label>
                <select
                  value={processStepId ?? ""}
                  onChange={(e) => setProcessStepId(e.target.value || null)}
                  disabled={!stageId || stepsForStage.length === 0}
                  className="w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13 disabled:opacity-50"
                >
                  <option value="">— 未指定 —</option>
                  {stepsForStage.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-12 font-medium text-secondary mb-1 block">狀態</label>
              <select
                value={stateId ?? ""}
                onChange={(e) => setStateId(e.target.value || null)}
                className="w-full rounded border border-subtle bg-surface-1 px-2 py-1.5 text-13"
              >
                <option value="">— 未指定 —</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <Link
              to={`/${slug}/projects/${pid}/issues/${target.data.id}`}
              className="text-12 text-blue-600 hover:underline inline-flex items-center gap-1"
              onClick={onClose}
            >
              <ExternalLink className="size-3" />開啟完整 Issue 詳情頁（描述/工時/留言/sub-issue…）
            </Link>
          </>
        )}

        {err && <div className="text-12 text-rose-500">{err}</div>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={busy} type="button">取消</Button>
          <Button variant="primary" size="sm" loading={busy} type="submit">儲存</Button>
        </div>
      </form>
    </Modal>
  );
}

// ─── shared modal shell ─────────────────────────────────────────────────────
function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className={cn(
          "w-full rounded-lg border border-subtle bg-surface-1 shadow-xl",
          wide ? "max-w-xl" : "max-w-md"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-subtle">
          <h3 className="text-14 font-semibold text-primary">{title}</h3>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export default observer(WorkboardPage);
