/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Workboard – TMS unified hierarchy view (Phase 1.5+).
 *
 * Stage / Module / Requirement / Feature / Issue all visible on one page.
 * W1 = Layout B skeleton (tree + issue list). Future: A/C layouts + DnD.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  ListChecks,
  Package,
  CheckSquare,
} from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IFeature, IModule, IRequirement, IStage } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import { FeatureService, type TFeatureIssue } from "@/services/feature.service";
import { ModuleService } from "@/services/module.service";
import { RequirementService } from "@/services/requirement.service";
import { StageService } from "@/services/stage.service";
import type { Route } from "./+types/page";

const moduleService = new ModuleService();
const requirementService = new RequirementService();
const featureService = new FeatureService();
const stageService = new StageService();

type TNodeSel =
  | { kind: "all" }
  | { kind: "module"; id: string }
  | { kind: "requirement"; id: string }
  | { kind: "feature"; id: string };

function WorkboardPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const slug = workspaceSlug.toString();
  const pid = projectId.toString();

  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<IModule[]>([]);
  const [requirements, setRequirements] = useState<IRequirement[]>([]);
  const [features, setFeatures] = useState<IFeature[]>([]);
  const [stages, setStages] = useState<IStage[]>([]);
  const [issues, setIssues] = useState<TFeatureIssue[]>([]); // for selected node
  const [issuesLoading, setIssuesLoading] = useState(false);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<TNodeSel>({ kind: "all" });
  const [stageFilter, setStageFilter] = useState<string | null>(null); // stage_id filter on right

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

  // Reload issues when selection changes
  useEffect(() => {
    const loadIssues = async () => {
      setIssuesLoading(true);
      try {
        let acc: TFeatureIssue[] = [];
        if (selected.kind === "all") {
          // pull issues for every feature in parallel
          const results = await Promise.all(
            features.map((f) => featureService.getIssuesForFeature(slug, pid, f.id))
          );
          acc = results.flat();
        } else if (selected.kind === "feature") {
          acc = await featureService.getIssuesForFeature(slug, pid, selected.id);
        } else if (selected.kind === "requirement") {
          const featuresInReq = features.filter((f) => f.requirement === selected.id);
          const results = await Promise.all(
            featuresInReq.map((f) => featureService.getIssuesForFeature(slug, pid, f.id))
          );
          acc = results.flat();
        } else if (selected.kind === "module") {
          const reqsInMod = requirements.filter((r) => r.module === selected.id);
          const featuresInMod = features.filter((f) =>
            reqsInMod.some((r) => r.id === f.requirement)
          );
          const results = await Promise.all(
            featuresInMod.map((f) => featureService.getIssuesForFeature(slug, pid, f.id))
          );
          acc = results.flat();
        }
        setIssues(acc);
      } catch {
        setIssues([]);
      } finally {
        setIssuesLoading(false);
      }
    };
    if (!loading) loadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, features, requirements, loading]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Derived: filter issues by stage tag
  const filteredIssues = useMemo(
    () => (stageFilter ? issues.filter((i) => i.stage_id === stageFilter) : issues),
    [issues, stageFilter]
  );

  const standardStages = useMemo(
    () =>
      [...stages]
        .filter((s) => s.key && s.key !== "unsorted")
        .sort((a, b) => a.sort_order - b.sort_order),
    [stages]
  );

  // Tree helpers
  const reqsByModule = useMemo(() => {
    const m = new Map<string, IRequirement[]>();
    for (const r of requirements) {
      if (!r.module) continue;
      const arr = m.get(r.module) ?? [];
      arr.push(r);
      m.set(r.module, arr);
    }
    return m;
  }, [requirements]);

  const featuresByReq = useMemo(() => {
    const m = new Map<string, IFeature[]>();
    for (const f of features) {
      if (!f.requirement) continue;
      const arr = m.get(f.requirement) ?? [];
      arr.push(f);
      m.set(f.requirement, arr);
    }
    return m;
  }, [features]);

  return (
    <>
      <PageHead title="整合檢視" />
      <div className="flex h-full w-full overflow-hidden">
        {/* ── Left: hierarchy tree ────────────────────────────────────── */}
        <aside className="w-80 flex-shrink-0 border-r border-subtle overflow-y-auto">
          <div className="px-3 py-2 border-b border-subtle bg-surface-2/60">
            <h3 className="text-12 font-semibold text-secondary">業務樹</h3>
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
                return (
                  <div key={m.id} className="mt-0.5">
                    <div
                      className={cn(
                        "flex items-center gap-1 px-1 py-1 rounded hover:bg-surface-2 cursor-pointer",
                        selected.kind === "module" && selected.id === m.id && "bg-blue-500/10"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpanded(`m:${m.id}`)}
                        className="p-0.5 hover:bg-black/[0.05] rounded"
                      >
                        {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      </button>
                      <Folder className="size-3.5 text-amber-500" />
                      <button
                        type="button"
                        onClick={() => setSelected({ kind: "module", id: m.id })}
                        className="flex-1 text-left truncate"
                        title={m.name}
                      >
                        {m.name}
                      </button>
                      <span className="text-10 text-tertiary">{moduleReqs.length}</span>
                    </div>
                    {isOpen &&
                      moduleReqs.map((r) => {
                        const reqFeatures = featuresByReq.get(r.id) ?? [];
                        const reqOpen = expanded.has(`r:${r.id}`);
                        return (
                          <div key={r.id} className="ml-5 mt-0.5">
                            <div
                              className={cn(
                                "flex items-center gap-1 px-1 py-1 rounded hover:bg-surface-2 cursor-pointer",
                                selected.kind === "requirement" &&
                                  selected.id === r.id &&
                                  "bg-blue-500/10"
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => toggleExpanded(`r:${r.id}`)}
                                className="p-0.5 hover:bg-black/[0.05] rounded"
                              >
                                {reqOpen ? (
                                  <ChevronDown className="size-3" />
                                ) : (
                                  <ChevronRight className="size-3" />
                                )}
                              </button>
                              <ListChecks className="size-3.5 text-blue-500" />
                              <button
                                type="button"
                                onClick={() => setSelected({ kind: "requirement", id: r.id })}
                                className="flex-1 text-left truncate text-12"
                                title={r.description}
                              >
                                <span className="font-mono text-10 text-tertiary mr-1">
                                  {r.requirement_id}
                                </span>
                                {r.description.slice(0, 35)}
                              </button>
                              <span className="text-10 text-tertiary">{reqFeatures.length}</span>
                            </div>
                            {reqOpen &&
                              reqFeatures.map((f) => (
                                <div
                                  key={f.id}
                                  className={cn(
                                    "ml-5 mt-0.5 flex items-center gap-1 px-1 py-1 rounded hover:bg-surface-2 cursor-pointer",
                                    selected.kind === "feature" &&
                                      selected.id === f.id &&
                                      "bg-blue-500/10"
                                  )}
                                  onClick={() => setSelected({ kind: "feature", id: f.id })}
                                >
                                  <Package className="size-3.5 text-emerald-500 ml-3" />
                                  <span className="font-mono text-10 text-tertiary">
                                    {f.feature_id}
                                  </span>
                                  <span className="truncate text-12">{f.name}</span>
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

        {/* ── Right: issue list ───────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <div className="border-b border-subtle px-4 py-2 flex items-center gap-3 bg-surface-1 sticky top-0 z-10">
            <h3 className="text-13 font-semibold text-primary">
              工作項目
              <span className="ml-1 text-11 text-tertiary font-normal">
                · {filteredIssues.length}
              </span>
            </h3>
            {/* Stage tag filter chips */}
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
            <div className="flex items-center justify-center h-72 text-tertiary text-13">
              載入結構中…
            </div>
          ) : issuesLoading ? (
            <div className="flex items-center justify-center h-72 text-tertiary text-13">
              載入工作項目…
            </div>
          ) : filteredIssues.length === 0 ? (
            <div className="flex items-center justify-center h-72 text-tertiary text-13">
              此選擇下沒有工作項目
            </div>
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
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((i) => (
                    <tr key={i.id} className="border-t border-subtle hover:bg-surface-2/40">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default observer(WorkboardPage);
