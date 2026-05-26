/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Workspace settings → 樣板管理 (TMS Phase 1.5).
 *
 * Lets admins inspect / edit ProcessTemplates (per-stage workflows) and
 * ProjectTemplates (project type kits with default modules + example
 * requirements).
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// services
import {
  ProcessTemplateService,
  ProjectTemplateService,
  type TProcessStep,
  type TProcessTemplate,
  type TProjectTemplate,
  type TProjectTemplateModule,
} from "@/services/project-template.service";
import type { Route } from "./+types/page";

const processTemplateService = new ProcessTemplateService();
const projectTemplateService = new ProjectTemplateService();

function TemplatesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const slug = workspaceSlug.toString();

  const [processTemplates, setProcessTemplates] = useState<TProcessTemplate[]>([]);
  const [projectTemplates, setProjectTemplates] = useState<TProjectTemplate[]>([]);
  const [tab, setTab] = useState<"process" | "project">("process");
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const [pt, jt] = await Promise.all([
        processTemplateService.list(slug),
        projectTemplateService.list(slug),
      ]);
      setProcessTemplates(pt);
      setProjectTemplates(jt);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return (
    <>
      <PageHead title="樣板管理" />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-6">
        <div>
          <h1 className="text-16 font-semibold text-primary">樣板管理</h1>
          <p className="text-12 text-tertiary mt-1">
            管理員可在這裡維護全公司共用的工序樣板（依階段）與專案類型樣板（含預設業務模組與範例需求）
          </p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 border-b border-subtle">
          <button
            type="button"
            className={cn(
              "px-3 py-2 text-13 font-medium",
              tab === "process" ? "text-primary border-b-2 border-blue-500" : "text-tertiary"
            )}
            onClick={() => setTab("process")}
          >
            工序樣板 · {processTemplates.length}
          </button>
          <button
            type="button"
            className={cn(
              "px-3 py-2 text-13 font-medium",
              tab === "project" ? "text-primary border-b-2 border-blue-500" : "text-tertiary"
            )}
            onClick={() => setTab("project")}
          >
            專案類型樣板 · {projectTemplates.length}
          </button>
        </div>

        {loading && <div className="text-13 text-tertiary py-4">載入中…</div>}

        {!loading && tab === "process" && (
          <div className="flex flex-col gap-3">
            {processTemplates.map((tpl) => (
              <ProcessTemplateCard key={tpl.id} slug={slug} template={tpl} onChanged={reload} />
            ))}
          </div>
        )}

        {!loading && tab === "project" && (
          <div className="flex flex-col gap-3">
            {projectTemplates.map((tpl) => (
              <ProjectTemplateCard key={tpl.id} slug={slug} template={tpl} onChanged={reload} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── ProcessTemplate card ────────────────────────────────────────────────────

function ProcessTemplateCard({
  slug,
  template,
  onChanged,
}: {
  slug: string;
  template: TProcessTemplate;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<TProcessStep[]>(template.steps ?? []);
  const [busy, setBusy] = useState(false);

  const save = async (newSteps: TProcessStep[]) => {
    setBusy(true);
    try {
      const saved = await processTemplateService.bulkUpdateSteps(slug, template.id, newSteps);
      setSteps(saved);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已儲存" });
    } catch (e) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "儲存失敗",
        message: (e as { detail?: string })?.detail ?? "請再試一次",
      });
    } finally {
      setBusy(false);
    }
  };

  const updateStep = (idx: number, patch: Partial<TProcessStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addStep = () => {
    const maxOrder = steps.reduce((m, s) => Math.max(m, s.sort_order), 0);
    setSteps((prev) => [
      ...prev,
      {
        id: "",
        template: template.id,
        name: "",
        sort_order: maxOrder + 100,
        default_role: "",
        default_estimated_hours: 4,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded-md border border-subtle bg-surface-1">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-2/40"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <span className="text-13 font-semibold text-primary">{template.name}</span>
          <span className="text-11 text-tertiary font-mono">[{template.stage_key}]</span>
        </div>
        <span className="text-11 text-tertiary">{steps.length} 個工序</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {steps.map((s, idx) => (
            <div key={s.id || `new-${idx}`} className="grid grid-cols-[1fr_160px_120px_auto] gap-2 items-center">
              <Input
                placeholder="工序名稱"
                value={s.name}
                onChange={(e) => updateStep(idx, { name: e.target.value })}
              />
              <Input
                placeholder="預設角色"
                value={s.default_role}
                onChange={(e) => updateStep(idx, { default_role: e.target.value })}
              />
              <Input
                type="number"
                step="0.5"
                min="0.5"
                max="8"
                placeholder="工時 h"
                value={s.default_estimated_hours ?? ""}
                onChange={(e) =>
                  updateStep(idx, {
                    default_estimated_hours: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
              <button
                type="button"
                onClick={() => removeStep(idx)}
                className="size-7 inline-flex items-center justify-center rounded hover:bg-rose-500/10"
              >
                <Trash2 className="size-3.5 text-rose-500" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between mt-1">
            <button
              type="button"
              onClick={addStep}
              className="text-12 text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              <Plus className="size-3" /> 加一個工序
            </button>
            <Button variant="primary" size="sm" onClick={() => save(steps)} loading={busy}>
              儲存全部
            </Button>
          </div>
          <p className="text-11 text-tertiary">
            工時 ≤ 8h、0.5h 為一階；工程師預估超過時請自己再拆任務
          </p>
        </div>
      )}
    </div>
  );
}

// ─── ProjectTemplate card ────────────────────────────────────────────────────

function ProjectTemplateCard({
  slug,
  template,
  onChanged,
}: {
  slug: string;
  template: TProjectTemplate;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [modules, setModules] = useState<TProjectTemplateModule[]>(template.modules ?? []);
  const [newModuleName, setNewModuleName] = useState("");

  const reload = async () => {
    const fresh = await projectTemplateService.retrieve(slug, template.id);
    setModules(fresh.modules ?? []);
    onChanged();
  };

  const addModule = async () => {
    if (!newModuleName.trim()) return;
    try {
      const maxOrder = modules.reduce((m, x) => Math.max(m, x.sort_order), 0);
      await projectTemplateService.createModule(slug, template.id, {
        name: newModuleName.trim(),
        sort_order: maxOrder + 100,
      });
      setNewModuleName("");
      reload();
    } catch (e) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "新增失敗",
        message: (e as { detail?: string })?.detail ?? "請再試一次",
      });
    }
  };

  const removeModule = async (id: string) => {
    if (!confirm("刪除這個分類？範例需求會一起被刪。")) return;
    try {
      await projectTemplateService.removeModule(slug, template.id, id);
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
    <div className="rounded-md border border-subtle bg-surface-1">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-surface-2/40"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <span className="text-13 font-semibold text-primary">{template.name}</span>
          {template.is_default && (
            <span className="text-11 text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">預設</span>
          )}
        </div>
        <span className="text-11 text-tertiary">{modules.length} 個預設分類</span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-2">
          {template.description && (
            <p className="text-12 text-tertiary mb-1">{template.description}</p>
          )}

          {modules.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-3 py-1.5 rounded border border-subtle">
              <span className="text-13">{m.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-11 text-tertiary">
                  {m.requirements?.length ?? 0} 條範例需求
                </span>
                <button
                  type="button"
                  onClick={() => removeModule(m.id)}
                  className="size-6 inline-flex items-center justify-center rounded hover:bg-rose-500/10"
                >
                  <Trash2 className="size-3 text-rose-500" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 mt-2">
            <Input
              placeholder="新分類名稱"
              value={newModuleName}
              onChange={(e) => setNewModuleName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addModule();
                }
              }}
            />
            <Button variant="primary" size="sm" onClick={addModule}>
              新增
            </Button>
          </div>
          <p className="text-11 text-tertiary">
            範例需求請使用 API 維護（之後會做 UI）。當前頁面只管預設分類。
          </p>
        </div>
      )}
    </div>
  );
}

export default observer(TemplatesPage);
