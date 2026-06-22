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
import { Link, useSearchParams } from "react-router";
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
  Rows3,
  LayoutGrid,
  Table2,
  GanttChartSquare,
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
import { GanttView } from "@/components/tms/gantt-view";
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
  // Deep-link: /workboard?stage=<id> pre-selects the stage filter (used when
  // a PM clicks a stage from the cross-project dashboard).
  const [searchParams] = useSearchParams();
  const [stageFilter, setStageFilter] = useState<string | null>(
    () => searchParams.get("stage") || null
  );

  const [addTarget, setAddTarget] = useState<TAddTarget | null>(null);
  const [editTarget, setEditTarget] = useState<TEditTarget | null>(null);

  // View mode (A = stacked / B = tree+list / C = spreadsheet / D = gantt) — persisted to localStorage
  const [viewMode, setViewMode] = useState<"A" | "B" | "C" | "D">(() => {
    if (typeof window === "undefined") return "B";
    return ((localStorage.getItem("workboard:viewMode") as "A" | "B" | "C" | "D") ?? "B");
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("workboard:viewMode", viewMode);
  }, [viewMode]);

  // W6 — multi-select state for batch operations on Issues (Layout C)
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const toggleIssueSelected = (id: string) =>
    setSelectedIssues((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const clearSelectedIssues = () => setSelectedIssues(new Set());

  // W5 — drag-and-drop reparent (HTML5 native, no library)
  // Drag data shape: { kind: "issue" | "feature" | "requirement", id: string }
  const handleDrop = async (
    dragged: { kind: "issue" | "feature" | "requirement"; id: string },
    target: { kind: "feature" | "requirement" | "module"; id: string }
  ) => {
    // Allowed transitions: issue→feature, feature→requirement, requirement→module
    const allowed =
      (dragged.kind === "issue" && target.kind === "feature") ||
      (dragged.kind === "feature" && target.kind === "requirement") ||
      (dragged.kind === "requirement" && target.kind === "module");
    if (!allowed) {
      setToast({ type: TOAST_TYPE.WARNING, title: "不支援的拖拉方向" });
      return;
    }
    try {
      if (dragged.kind === "issue") {
        await issueService.patchIssue(slug, pid, dragged.id, { feature: target.id } as any);
      } else if (dragged.kind === "feature") {
        await featureService.patchFeature(slug, pid, dragged.id, { requirement: target.id });
      } else if (dragged.kind === "requirement") {
        await requirementService.patchRequirement(slug, pid, dragged.id, { module: target.id });
      }
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已搬移" });
      reloadStructure().then(() => reloadIssues());
    } catch (e) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "搬移失敗",
        message: (e as { detail?: string })?.detail ?? "請再試一次",
      });
    }
  };

  // When switching to a flattened layout (A / C / D) eagerly load ALL issues;
  // B is lazy by selected node.
  useEffect(() => {
    if ((viewMode === "A" || viewMode === "C" || viewMode === "D") && selected.kind !== "all") {
      setSelected({ kind: "all" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

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
    () =>
      [...stages]
        // Show all named stages except the system "unsorted" fallback,
        // including admin-created stages that have no key.
        .filter((s) => s.key !== "unsorted")
        .sort((a, b) => a.sort_order - b.sort_order),
    [stages]
  );

  // Issue count per stage (from the full unfiltered set) — drives the
  // Stage-layer cards in the stacked view.
  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of issues) if (i.stage_id) m[i.stage_id] = (m[i.stage_id] ?? 0) + 1;
    return m;
  }, [issues]);

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

  // Issue progress aggregations for tree counters (total + done) per level,
  // computed from currently loaded issues. "done" = completed/cancelled group.
  const aggBy = (keyOf: (i: TFeatureIssue) => string | null) => {
    const m = new Map<string, { total: number; done: number }>();
    for (const i of issues) {
      const k = keyOf(i);
      if (!k) continue;
      const cur = m.get(k) ?? { total: 0, done: 0 };
      cur.total += 1;
      if (i.state_group === "completed" || i.state_group === "cancelled") cur.done += 1;
      m.set(k, cur);
    }
    return m;
  };
  const issuesByFeature = useMemo(() => aggBy((i) => i.feature_id), [issues]);
  const issuesByRequirement = useMemo(() => aggBy((i) => i.requirement_id), [issues]);
  const issuesByModule = useMemo(() => aggBy((i) => i.module_id), [issues]);

  // Small inline progress label "done/total" with tone
  const progressLabel = (agg?: { total: number; done: number }) => {
    if (!agg || agg.total === 0) return null;
    const pct = Math.round((agg.done / agg.total) * 100);
    return (
      <span
        className={cn(
          "text-10 tabular-nums",
          pct === 100 ? "text-emerald-600" : pct > 0 ? "text-blue-600" : "text-tertiary"
        )}
        title={`${agg.done}/${agg.total} 完成 (${pct}%)`}
      >
        {agg.done}/{agg.total}
      </span>
    );
  };

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

  // Stage filter (used by all layouts)
  const stageFilterBar = (
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
        >
          {s.name}
        </button>
      ))}
    </div>
  );

  // View switcher (top toolbar)
  const viewSwitcher = (
    <div className="inline-flex items-center rounded-md border border-subtle bg-surface-1 overflow-hidden text-11">
      {(
        [
          { id: "A", label: "堆疊", icon: Rows3 },
          { id: "B", label: "樹狀", icon: LayoutGrid },
          { id: "C", label: "試算表", icon: Table2 },
          { id: "D", label: "甘特", icon: GanttChartSquare },
        ] as const
      ).map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => setViewMode(v.id)}
          className={cn(
            "px-2 py-1 inline-flex items-center gap-1",
            viewMode === v.id ? "bg-blue-500/10 text-blue-600" : "text-tertiary hover:bg-surface-2"
          )}
          title={`Layout ${v.id} — ${v.label}`}
        >
          <v.icon className="size-3" />
          <span>{v.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <PageHead title="整合檢視" />
      {/* Top toolbar — always visible */}
      <div className="border-b border-subtle px-4 py-2 flex items-center justify-between gap-3 bg-surface-1 flex-wrap">
        {viewSwitcher}
        {stageFilterBar}
      </div>

      {viewMode === "B" && (
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
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add("ring-1", "ring-blue-400");
                      }}
                      onDragLeave={(e) => e.currentTarget.classList.remove("ring-1", "ring-blue-400")}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("ring-1", "ring-blue-400");
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("application/json"));
                          handleDrop(data, { kind: "module", id: m.id });
                        } catch {
                          /* ignore non-DnD drops */
                        }
                      }}
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
                      <span className="text-10 text-tertiary flex items-center gap-1" title="需求數 · 完成/工項數">
                        <span>{moduleReqs.length}需</span>
                        {progressLabel(issuesByModule.get(m.id))}
                      </span>
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
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData(
                                  "application/json",
                                  JSON.stringify({ kind: "requirement", id: r.id })
                                );
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.add("ring-1", "ring-blue-400");
                              }}
                              onDragLeave={(e) =>
                                e.currentTarget.classList.remove("ring-1", "ring-blue-400")
                              }
                              onDrop={(e) => {
                                e.preventDefault();
                                e.currentTarget.classList.remove("ring-1", "ring-blue-400");
                                try {
                                  const data = JSON.parse(e.dataTransfer.getData("application/json"));
                                  handleDrop(data, { kind: "requirement", id: r.id });
                                } catch {
                                  /* ignore */
                                }
                              }}
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
                              <span className="text-10 text-tertiary flex items-center gap-1" title="功能數 · 完成/工項數">
                                <span>{reqFeatures.length}功</span>
                                {progressLabel(issuesByRequirement.get(r.id))}
                              </span>
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
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData(
                                      "application/json",
                                      JSON.stringify({ kind: "feature", id: f.id })
                                    );
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.add("ring-1", "ring-blue-400");
                                  }}
                                  onDragLeave={(e) =>
                                    e.currentTarget.classList.remove("ring-1", "ring-blue-400")
                                  }
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.remove("ring-1", "ring-blue-400");
                                    try {
                                      const data = JSON.parse(e.dataTransfer.getData("application/json"));
                                      handleDrop(data, { kind: "feature", id: f.id });
                                    } catch {
                                      /* ignore */
                                    }
                                  }}
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
                                  <span className="text-10 text-tertiary" title="完成/工項數">
                                    {progressLabel(issuesByFeature.get(f.id))}
                                  </span>
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
          <div className="border-b border-subtle px-4 py-2 bg-surface-1 sticky top-0 z-10">
            <h3 className="text-13 font-semibold text-primary flex items-center gap-2 flex-wrap">
              {/* breadcrumb of current drill position */}
              <span className="text-11 font-normal text-tertiary">
                {(() => {
                  if (selected.kind === "all") return "全部";
                  if (selected.kind === "module")
                    return modules.find((m) => m.id === selected.id)?.name ?? "分類";
                  if (selected.kind === "requirement") {
                    const r = requirements.find((x) => x.id === selected.id);
                    return r ? `${r.requirement_id} ${r.description.slice(0, 20)}` : "需求";
                  }
                  const f = features.find((x) => x.id === selected.id);
                  return f ? `${f.feature_id} ${f.name}` : "功能";
                })()}
                {stageFilter ? ` · ${stages.find((s) => s.id === stageFilter)?.name ?? "階段"}` : ""}
              </span>
              <span className="text-tertiary">›</span>
              工作項目 <span className="text-11 text-tertiary font-normal">· {filteredIssues.length}</span>
              {(() => {
                const done = filteredIssues.filter(
                  (i) => i.state_group === "completed" || i.state_group === "cancelled"
                ).length;
                const overdue = filteredIssues.filter((i) => i.is_overdue).length;
                if (filteredIssues.length === 0) return null;
                return (
                  <span className="text-11 font-normal text-tertiary">
                    （{done}/{filteredIssues.length} 完成
                    {overdue > 0 ? <span className="text-rose-600"> · {overdue} 逾期</span> : null}）
                  </span>
                );
              })()}
            </h3>
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
                    <tr
                      key={i.id}
                      className="border-t border-subtle hover:bg-surface-2/40 group cursor-grab"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ kind: "issue", id: i.id })
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    >
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
      )}

      {viewMode === "A" && (
        <LayoutAStacked
          modules={modules}
          requirements={requirements}
          features={features}
          issues={filteredIssues}
          stageFilter={stageFilter}
          stages={standardStages}
          stageCounts={stageCounts}
          totalCount={issues.length}
          onStageFilter={setStageFilter}
          onAddModule={() => setAddTarget({ kind: "module" })}
          onAddRequirement={(moduleId) => setAddTarget({ kind: "requirement", moduleId })}
          onAddFeature={(requirementId) => setAddTarget({ kind: "feature", requirementId })}
          onAddIssue={(featureId) => setAddTarget({ kind: "issue", featureId })}
          onEditModule={(m) => setEditTarget({ kind: "module", data: m })}
          onEditRequirement={(r) => setEditTarget({ kind: "requirement", data: r })}
          onEditFeature={(f) => setEditTarget({ kind: "feature", data: f })}
          onEditIssue={(i) => setEditTarget({ kind: "issue", data: i })}
          onDeleteModule={handleDeleteModule}
          onDeleteRequirement={handleDeleteRequirement}
          onDeleteFeature={handleDeleteFeature}
          onDeleteIssue={handleDeleteIssue}
          loading={loading || issuesLoading}
        />
      )}

      {viewMode === "D" && (
        <div className="overflow-auto">
          {loading || issuesLoading ? (
            <div className="flex items-center justify-center h-72 text-tertiary text-13">載入中…</div>
          ) : (
            <GanttView issues={filteredIssues} />
          )}
        </div>
      )}

      {viewMode === "C" && (
        <LayoutCSpreadsheet
          slug={slug}
          pid={pid}
          modules={modules}
          requirements={requirements}
          features={features}
          stages={stages}
          issues={filteredIssues}
          onEditIssue={(i) => setEditTarget({ kind: "issue", data: i })}
          onDeleteIssue={handleDeleteIssue}
          loading={loading || issuesLoading}
          selectedIssues={selectedIssues}
          toggleIssueSelected={toggleIssueSelected}
          clearSelectedIssues={clearSelectedIssues}
          onReload={() => reloadStructure().then(() => reloadIssues())}
        />
      )}

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
        const created = await featureService.createFeature(slug, pid, {
          name: name.trim(),
          description,
          requirement: target.requirementId,
        });
        const spawned = created?.spawned_issues ?? 0;
        if (spawned > 0) {
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: "已建立功能",
            message: `自動產生 ${spawned} 個工序工作項目`,
          });
          onSaved();
          return; // skip generic toast below
        }
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
                    .filter((s) => s.key !== "unsorted")
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

// ─── Layout A — stacked 4-section view ──────────────────────────────────────

type LayoutAProps = {
  modules: IModule[];
  requirements: IRequirement[];
  features: IFeature[];
  issues: TFeatureIssue[];
  loading: boolean;
  // Active stage filter id (null = 全部階段). When set, the 分類/需求/功能
  // sections collapse to only the branches that contain a matching Issue.
  // Stage is rendered as the FIRST drill layer (階段→分類→需求→功能→工作項目).
  stageFilter: string | null;
  stages: IStage[];
  stageCounts: Record<string, number>;
  totalCount: number;
  onStageFilter: (id: string | null) => void;
  onAddModule: () => void;
  onAddRequirement: (moduleId: string) => void;
  onAddFeature: (requirementId: string) => void;
  onAddIssue: (featureId: string) => void;
  onEditModule: (m: IModule) => void;
  onEditRequirement: (r: IRequirement) => void;
  onEditFeature: (f: IFeature) => void;
  onEditIssue: (i: TFeatureIssue) => void;
  onDeleteModule: (m: IModule) => void;
  onDeleteRequirement: (r: IRequirement) => void;
  onDeleteFeature: (f: IFeature) => void;
  onDeleteIssue: (i: TFeatureIssue) => void;
};

function LayoutAStacked(props: LayoutAProps) {
  const { modules, requirements, features, issues, loading, stageFilter } = props;
  const { stages, stageCounts, totalCount, onStageFilter } = props;
  const stageFiltered = stageFilter !== null;
  const [selModule, setSelModule] = useState<string | null>(null);
  const [selRequirement, setSelRequirement] = useState<string | null>(null);
  const [selFeature, setSelFeature] = useState<string | null>(null);

  // Switching / clearing the stage filter resets the drill selection so the
  // cascaded sections start from the top rather than a now-empty branch.
  useEffect(() => {
    setSelModule(null);
    setSelRequirement(null);
    setSelFeature(null);
  }, [stageFilter]);

  // `issues` is already stage-filtered by the parent. Derive the set of
  // module / requirement / feature ids that still have a matching Issue so the
  // upper sections can collapse to only the relevant branches when a stage is
  // selected (previously they ignored the stage filter entirely → 堆疊 view
  // looked unresponsive when clicking a stage).
  const matchModuleIds = useMemo(
    () => new Set(issues.map((i) => i.module_id).filter(Boolean) as string[]),
    [issues]
  );
  const matchReqIds = useMemo(
    () => new Set(issues.map((i) => i.requirement_id).filter(Boolean) as string[]),
    [issues]
  );
  const matchFeatIds = useMemo(
    () => new Set(issues.map((i) => i.feature_id).filter(Boolean) as string[]),
    [issues]
  );

  const shownModules = useMemo(
    () => (stageFiltered ? modules.filter((m) => matchModuleIds.has(m.id)) : modules),
    [modules, stageFiltered, matchModuleIds]
  );

  const visibleReqs = useMemo(() => {
    let rs = selModule ? requirements.filter((r) => r.module === selModule) : requirements;
    if (stageFiltered) rs = rs.filter((r) => matchReqIds.has(r.id));
    return rs;
  }, [requirements, selModule, stageFiltered, matchReqIds]);
  const visibleFeatures = useMemo(() => {
    let fs = selRequirement ? features.filter((f) => f.requirement === selRequirement) : features;
    if (stageFiltered) fs = fs.filter((f) => matchFeatIds.has(f.id));
    return fs;
  }, [features, selRequirement, stageFiltered, matchFeatIds]);
  // Properly filter issues by selected node via feature_id (now exposed by API)
  const finalIssues = useMemo(() => {
    if (selFeature) {
      return issues.filter((i) => i.feature_id === selFeature);
    }
    if (selRequirement) {
      return issues.filter((i) => i.requirement_id === selRequirement);
    }
    if (selModule) {
      return issues.filter((i) => i.module_id === selModule);
    }
    return issues;
  }, [issues, selFeature, selRequirement, selModule]);

  if (loading) return <div className="flex items-center justify-center h-72 text-tertiary text-13">載入中…</div>;

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto">
      {/* Modules */}
      {/* Stage — first drill layer (階段→分類→需求→功能→工作項目) */}
      <Section title={`階段 · ${stages.length}`}>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <Card selected={!stageFilter} onClick={() => onStageFilter(null)}>
            <span className="truncate">全部階段</span>
            <span className="text-10 text-tertiary ml-auto">{totalCount}</span>
          </Card>
          {stages.map((s) => (
            <Card key={s.id} selected={stageFilter === s.id} onClick={() => onStageFilter(s.id)}>
              <span className="truncate">{s.name}</span>
              <span className="text-10 text-tertiary ml-auto">{stageCounts[s.id] ?? 0}</span>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={`分類 · ${shownModules.length}${stageFiltered ? "（已篩選）" : ""}`} onAdd={props.onAddModule} addLabel="新增分類">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {shownModules.map((m) => (
            <Card
              key={m.id}
              selected={selModule === m.id}
              onClick={() => {
                setSelModule(selModule === m.id ? null : m.id);
                setSelRequirement(null);
                setSelFeature(null);
              }}
              onEdit={() => props.onEditModule(m)}
              onDelete={() => props.onDeleteModule(m)}
              onAddChild={() => props.onAddRequirement(m.id)}
              addChildLabel="加需求"
            >
              <Folder className="size-3.5 text-amber-500" />
              <span className="truncate">{m.name}</span>
              <span className="text-10 text-tertiary ml-auto">
                {requirements.filter((r) => r.module === m.id && (!stageFiltered || matchReqIds.has(r.id))).length}
              </span>
            </Card>
          ))}
        </div>
      </Section>

      {/* Requirements */}
      <Section title={`需求 · ${visibleReqs.length}${selModule ? "（已篩選）" : ""}`}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {visibleReqs.map((r) => (
            <Card
              key={r.id}
              selected={selRequirement === r.id}
              onClick={() => {
                setSelRequirement(selRequirement === r.id ? null : r.id);
                setSelFeature(null);
              }}
              onEdit={() => props.onEditRequirement(r)}
              onDelete={() => props.onDeleteRequirement(r)}
              onAddChild={() => props.onAddFeature(r.id)}
              addChildLabel="加功能"
            >
              <ListChecks className="size-3.5 text-blue-500" />
              <div className="flex-1 truncate">
                <span className="font-mono text-10 text-tertiary mr-1">{r.requirement_id}</span>
                <span>{r.description.slice(0, 28)}</span>
              </div>
              <span className="text-10 text-tertiary ml-auto">
                {features.filter((f) => f.requirement === r.id && (!stageFiltered || matchFeatIds.has(f.id))).length}
              </span>
            </Card>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section title={`功能 · ${visibleFeatures.length}${selRequirement ? "（已篩選）" : ""}`}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {visibleFeatures.map((f) => (
            <Card
              key={f.id}
              selected={selFeature === f.id}
              onClick={() => setSelFeature(selFeature === f.id ? null : f.id)}
              onEdit={() => props.onEditFeature(f)}
              onDelete={() => props.onDeleteFeature(f)}
              onAddChild={() => props.onAddIssue(f.id)}
              addChildLabel="加工項"
            >
              <Package className="size-3.5 text-emerald-500" />
              <div className="flex-1 truncate">
                <span className="font-mono text-10 text-tertiary mr-1">{f.feature_id}</span>
                <span>{f.name}</span>
              </div>
              <span className="text-10 text-tertiary ml-auto">
                {f.estimated_hours ? `${f.estimated_hours}h` : ""}
              </span>
            </Card>
          ))}
        </div>
      </Section>

      {/* Issues */}
      <Section title={`工作項目 · ${finalIssues.length}`}>
        <IssueTableCompact
          issues={finalIssues}
          onEdit={props.onEditIssue}
          onDelete={props.onDeleteIssue}
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  onAdd,
  addLabel,
}: {
  title: string;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="rounded-md border border-subtle bg-surface-1">
      <div className="px-3 py-2 border-b border-subtle bg-surface-2/40 flex items-center justify-between">
        <h4 className="text-12 font-semibold text-secondary">{title}</h4>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="text-11 text-blue-600 hover:underline inline-flex items-center gap-0.5"
          >
            <Plus className="size-3" />
            {addLabel}
          </button>
        )}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

function Card({
  children,
  selected,
  onClick,
  onEdit,
  onDelete,
  onAddChild,
  addChildLabel,
}: {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onAddChild?: () => void;
  addChildLabel?: string;
}) {
  return (
    <div
      className={cn(
        "group rounded border bg-surface-1 px-2 py-1.5 flex items-center gap-1.5 text-12 cursor-pointer",
        selected ? "border-blue-500 bg-blue-500/5" : "border-subtle hover:bg-surface-2"
      )}
      onClick={onClick}
    >
      {children}
      <span className="invisible group-hover:visible flex items-center gap-0.5 ml-1">
        {onAddChild && (
          <NodeActionBtn icon={Plus} title={addChildLabel ?? "加子項"} onClick={onAddChild} />
        )}
        {onEdit && <NodeActionBtn icon={Pencil} title="編輯" onClick={onEdit} />}
        {onDelete && <NodeActionBtn icon={Trash2} title="刪除" danger onClick={onDelete} />}
      </span>
    </div>
  );
}

function IssueTableCompact({
  issues,
  onEdit,
  onDelete,
}: {
  issues: TFeatureIssue[];
  onEdit: (i: TFeatureIssue) => void;
  onDelete: (i: TFeatureIssue) => void;
}) {
  if (issues.length === 0)
    return <div className="text-tertiary text-12 py-2 px-1">沒有工作項目</div>;
  return (
    <table className="w-full text-12">
      <thead className="text-11 text-tertiary">
        <tr>
          <th className="text-left px-2 py-1 w-12">#</th>
          <th className="text-left px-2 py-1">名稱</th>
          <th className="text-left px-2 py-1 w-20">階段</th>
          <th className="text-left px-2 py-1 w-16">工序</th>
          <th className="text-left px-2 py-1 w-20">狀態</th>
          <th className="text-right px-2 py-1 w-12">預估</th>
          <th className="text-right px-2 py-1 w-16">動作</th>
        </tr>
      </thead>
      <tbody>
        {issues.map((i) => (
          <tr key={i.id} className="group border-t border-subtle hover:bg-surface-2/40">
            <td className="px-2 py-1 font-mono text-10 text-tertiary">#{i.sequence_id}</td>
            <td className="px-2 py-1 truncate max-w-md">{i.name}</td>
            <td className="px-2 py-1 text-tertiary">{i.stage_name ?? "—"}</td>
            <td className="px-2 py-1 text-tertiary">{i.process_step_name ?? "—"}</td>
            <td className="px-2 py-1 text-tertiary">{i.state_name ?? "—"}</td>
            <td className="px-2 py-1 text-right font-mono">
              {i.estimate_hours != null ? `${i.estimate_hours}h` : "—"}
            </td>
            <td className="px-2 py-1 text-right">
              <NodeActionBtn icon={Pencil} title="編輯" onClick={() => onEdit(i)} />
              <NodeActionBtn icon={Trash2} title="刪除" danger onClick={() => onDelete(i)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Layout C — flat spreadsheet (with multi-select + batch ops) ────────────

function LayoutCSpreadsheet({
  slug,
  pid,
  modules,
  requirements,
  features,
  stages,
  issues,
  onEditIssue,
  onDeleteIssue,
  loading,
  selectedIssues,
  toggleIssueSelected,
  clearSelectedIssues,
  onReload,
}: {
  slug: string;
  pid: string;
  modules: IModule[];
  requirements: IRequirement[];
  features: IFeature[];
  stages: IStage[];
  issues: TFeatureIssue[];
  onEditIssue: (i: TFeatureIssue) => void;
  onDeleteIssue: (i: TFeatureIssue) => void;
  loading: boolean;
  selectedIssues: Set<string>;
  toggleIssueSelected: (id: string) => void;
  clearSelectedIssues: () => void;
  onReload: () => void;
}) {
  const modById = useMemo(() => Object.fromEntries(modules.map((m) => [m.id, m])), [modules]);
  const reqById = useMemo(() => Object.fromEntries(requirements.map((r) => [r.id, r])), [requirements]);
  const featById = useMemo(() => Object.fromEntries(features.map((f) => [f.id, f])), [features]);

  // Build feature->parents lookup so we can show Module/Requirement on each Issue row.
  // TFeatureIssue doesn't have feature_id; we use process_step_id is unrelated.
  // We need to inject parent context: derive feature from feature relationship.
  // Since `getIssuesForFeature` returned issues attached to a single feature, we
  // already know the parentage when the caller loaded "all" — but we lost the
  // mapping. Workaround: walk `features` and call `getIssuesForFeature` is the
  // canonical path; here we infer feature by matching `issue.process_step` to
  // feature's parents — but that doesn't help. Easiest fix: ensure the backend
  // FeatureIssuesEndpoint also returns feature_id / requirement_id / module_id.
  // (Already enhanced; see TFeatureIssue type.)
  //
  // For now this view shows the columns it has + uses stage_id / process_step.
  // If feature_id is added to TFeatureIssue (TODO), we can show parent breadcrumb.
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"stage" | "name" | "estimate">("stage");

  const sortedIssues = useMemo(() => {
    let arr = [...issues];
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.stage_name ?? "").toLowerCase().includes(q) ||
          (i.process_step_name ?? "").toLowerCase().includes(q)
      );
    }
    if (sort === "stage") {
      arr.sort((a, b) => (a.stage_sort_order ?? 99999) - (b.stage_sort_order ?? 99999));
    } else if (sort === "name") {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "estimate") {
      arr.sort((a, b) => (b.estimate_hours ?? 0) - (a.estimate_hours ?? 0));
    }
    return arr;
  }, [issues, search, sort]);

  // W6 — bulk action handlers
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectedList = sortedIssues.filter((i) => selectedIssues.has(i.id));
  const allVisibleSelected = sortedIssues.length > 0 && sortedIssues.every((i) => selectedIssues.has(i.id));

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      sortedIssues.forEach((i) => selectedIssues.has(i.id) && toggleIssueSelected(i.id));
    } else {
      sortedIssues.forEach((i) => !selectedIssues.has(i.id) && toggleIssueSelected(i.id));
    }
  };

  const bulkUpdateStage = async (stageId: string | null) => {
    if (!selectedList.length) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        selectedList.map((i) =>
          issueService.patchIssue(slug, pid, i.id, { stage: stageId, process_step: null } as any)
        )
      );
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已更新 ${selectedList.length} 筆階段` });
      clearSelectedIssues();
      onReload();
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "批次更新失敗", message: (e as { detail?: string })?.detail ?? "" });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (!selectedList.length) return;
    if (!confirm(`刪除選取的 ${selectedList.length} 筆工作項目？`)) return;
    setBulkBusy(true);
    try {
      await Promise.all(selectedList.map((i) => issueService.deleteIssue(slug, pid, i.id)));
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已刪除 ${selectedList.length} 筆` });
      clearSelectedIssues();
      onReload();
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "刪除失敗", message: (e as { detail?: string })?.detail ?? "" });
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-72 text-tertiary text-13">載入中…</div>;

  return (
    <div className="p-4 overflow-y-auto">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜尋名稱 / 階段 / 工序..."
          className="rounded border border-subtle bg-surface-1 px-2 py-1 text-12 w-72"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="rounded border border-subtle bg-surface-1 px-2 py-1 text-12"
        >
          <option value="stage">依階段排序</option>
          <option value="name">依名稱排序</option>
          <option value="estimate">依預估工時降冪</option>
        </select>
        <span className="text-11 text-tertiary ml-auto">
          {sortedIssues.length} / {issues.length} 筆
        </span>
      </div>

      {/* W6 — bulk action toolbar (shown when any selected) */}
      {selectedList.length > 0 && (
        <div className="rounded-md border border-blue-500 bg-blue-500/5 px-3 py-2 mb-2 flex items-center gap-3 flex-wrap text-12">
          <span className="text-blue-600 font-medium">已選 {selectedList.length} 筆</span>
          <span className="text-tertiary">·</span>
          <span>批次設定階段：</span>
          <select
            disabled={bulkBusy}
            onChange={(e) => {
              if (e.target.value) bulkUpdateStage(e.target.value);
              e.target.value = "";
            }}
            className="rounded border border-subtle bg-surface-1 px-2 py-1 text-12"
            defaultValue=""
          >
            <option value="" disabled>— 選擇階段 —</option>
            {stages
              .filter((s) => s.key !== "unsorted")
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => bulkUpdateStage(null)}
            disabled={bulkBusy}
            className="text-11 text-tertiary hover:underline"
          >
            清除階段
          </button>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={bulkBusy}
            className="ml-auto text-11 text-rose-600 hover:underline"
          >
            刪除選取
          </button>
          <button
            type="button"
            onClick={clearSelectedIssues}
            disabled={bulkBusy}
            className="text-11 text-tertiary hover:underline"
          >
            取消選取
          </button>
        </div>
      )}

      <div className="rounded-md border border-subtle bg-surface-1 overflow-x-auto">
        <table className="w-full text-12">
          <thead className="bg-surface-2 text-11 text-tertiary sticky top-0">
            <tr>
              <th className="px-2 py-1.5 w-8">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} className="accent-blue-500" />
              </th>
              <th className="text-left px-2 py-1.5 w-12">#</th>
              <th className="text-left px-2 py-1.5 w-24">分類</th>
              <th className="text-left px-2 py-1.5 w-24">需求</th>
              <th className="text-left px-2 py-1.5 w-24">功能</th>
              <th className="text-left px-2 py-1.5">名稱</th>
              <th className="text-left px-2 py-1.5 w-20">階段</th>
              <th className="text-left px-2 py-1.5 w-16">工序</th>
              <th className="text-left px-2 py-1.5 w-20">狀態</th>
              <th className="text-right px-2 py-1.5 w-12">預估</th>
              <th className="text-right px-2 py-1.5 w-12">實際</th>
              <th className="text-right px-2 py-1.5 w-16">動作</th>
            </tr>
          </thead>
          <tbody>
            {sortedIssues.map((i) => {
              const isChecked = selectedIssues.has(i.id);
              return (
                <tr
                  key={i.id}
                  className={cn(
                    "group border-t border-subtle hover:bg-surface-2/40",
                    isChecked && "bg-blue-500/5"
                  )}
                >
                  <td className="px-2 py-1">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleIssueSelected(i.id)}
                      className="accent-blue-500"
                    />
                  </td>
                  <td className="px-2 py-1 font-mono text-10 text-tertiary">#{i.sequence_id}</td>
                  <td className="px-2 py-1 text-tertiary truncate" title={i.module_name ?? ""}>{i.module_name ?? "—"}</td>
                  <td className="px-2 py-1 text-tertiary truncate font-mono">{i.requirement_display_id ?? "—"}</td>
                  <td className="px-2 py-1 text-tertiary truncate font-mono">{i.feature_display_id ?? "—"}</td>
                  <td className="px-2 py-1 truncate max-w-md">{i.name}</td>
                  <td className="px-2 py-1 text-tertiary">{i.stage_name ?? "—"}</td>
                  <td className="px-2 py-1 text-tertiary">{i.process_step_name ?? "—"}</td>
                  <td className="px-2 py-1 text-tertiary">{i.state_name ?? "—"}</td>
                  <td className="px-2 py-1 text-right font-mono">
                    {i.estimate_hours != null ? `${i.estimate_hours}` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    {i.actual_hours != null ? `${i.actual_hours}` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <NodeActionBtn icon={Pencil} title="編輯" onClick={() => onEditIssue(i)} />
                    <NodeActionBtn icon={Trash2} title="刪除" danger onClick={() => onDeleteIssue(i)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
