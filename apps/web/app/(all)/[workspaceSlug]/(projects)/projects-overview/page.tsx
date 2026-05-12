/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IState, IUserLite, TIssue } from "@plane/types";
// components
import { PageHead } from "@/components/core/page-title";
import { SimpleGantt } from "@/components/projects-overview/simple-gantt";
import { ViewToggle } from "@/components/projects-overview/view-toggle";
import { ScaleToggle } from "@/components/projects-overview/scale-toggle";
import { MemberLoadingTable } from "@/components/projects-overview/member-loading-table";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { WorkspaceService } from "@/services/workspace.service";
// helpers
import {
  computeDateWindow,
  computeMemberLoading,
  computeOverviewBlocks,
  type TMemberLoading,
  type TOverviewBlock,
  type TOverviewMode,
  type TTimeScale,
} from "@/helpers/projects-overview.helper";
import type { Route } from "./+types/page";

const workspaceService = new WorkspaceService();

type TStep = "loading" | "ready" | "error";

function flattenIssueResults(r: unknown): TIssue[] {
  if (Array.isArray(r)) return r as TIssue[];
  if (r && typeof r === "object") {
    return Object.values(r as Record<string, unknown>).flatMap((v) => {
      if (Array.isArray(v)) return v as TIssue[];
      if (v && typeof v === "object" && "results" in (v as object))
        return flattenIssueResults((v as { results: unknown }).results);
      return [];
    });
  }
  return [];
}

function ProjectsOverviewPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const router = useRouter();

  // permission gate – Admin only
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.WORKSPACE,
    workspaceSlug?.toString()
  );

  useEffect(() => {
    if (!isAdmin && workspaceSlug) router.push(`/${workspaceSlug}/`);
  }, [isAdmin, workspaceSlug, router]);

  // store hooks
  const { workspaceProjectIds, getProjectById } = useProject();
  const { getProjectStates } = useProjectState();
  const memberRoot = useMember();

  // ensure workspace members are loaded so we can resolve assignee names
  useEffect(() => {
    if (!isAdmin || !workspaceSlug) return;
    memberRoot.workspace
      .fetchWorkspaceMembers(workspaceSlug.toString())
      .catch(() => {
        /* non-fatal – we'll fall back to user IDs */
      });
  }, [isAdmin, workspaceSlug, memberRoot]);

  // local state
  const [step, setStep] = useState<TStep>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [issues, setIssues] = useState<TIssue[]>([]);
  const [mode, setMode] = useState<TOverviewMode>("project");
  const [scale, setScale] = useState<TTimeScale>("month");

  // fetch all issues across workspace (paginated)
  useEffect(() => {
    if (!isAdmin || !workspaceSlug) return;
    let cancelled = false;
    setStep("loading");
    setIssues([]);

    const load = async () => {
      try {
        const acc: TIssue[] = [];
        let cursor: string | undefined;
        do {
          const queryParams: Record<string, string | number> = {
            per_page: 1000,
            order_by: "-created_at",
          };
          if (cursor) queryParams["cursor"] = cursor;
          const page = await workspaceService.getViewIssues(workspaceSlug.toString(), queryParams);
          if (cancelled) return;
          acc.push(...flattenIssueResults(page.results));
          cursor = page.next_page_results ? page.next_cursor : undefined;
        } while (cursor);

        if (!cancelled) {
          setIssues(acc);
          setStep("ready");
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          typeof err === "string"
            ? err
            : ((err as Record<string, unknown>)?.detail as string) ??
              ((err as Record<string, unknown>)?.error as string) ??
              (err instanceof Error ? err.message : null) ??
              JSON.stringify(err);
        setErrorMsg(msg ?? "Unknown error");
        setStep("error");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, workspaceSlug]);

  // derived: projects, states, members
  const projects = useMemo(
    () =>
      (workspaceProjectIds ?? [])
        .map((id) => getProjectById(id))
        .filter((p): p is NonNullable<typeof p> => p != null)
        .map((p) => ({ id: p.id, name: p.name })),
    [workspaceProjectIds, getProjectById]
  );

  const states: IState[] = useMemo(() => {
    const seen = new Set<string>();
    const out: IState[] = [];
    for (const pid of workspaceProjectIds ?? []) {
      const list = getProjectStates(pid) ?? [];
      for (const s of list) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          out.push(s);
        }
      }
    }
    return out;
  }, [workspaceProjectIds, getProjectStates]);

  // Build the member list from:
  //   1. workspace member IDs (preferred – includes inactive assignees)
  //   2. distinct assignee_ids in fetched issues (covers any user the store missed)
  const members: IUserLite[] = useMemo(() => {
    const seen = new Set<string>();
    const out: IUserLite[] = [];
    const wsIds = memberRoot.workspace.getWorkspaceMemberIds(workspaceSlug?.toString() ?? "") ?? [];
    for (const id of wsIds) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const u = memberRoot.getUserDetails(id);
      if (u) out.push(u);
    }
    for (const issue of issues) {
      for (const id of issue.assignee_ids ?? []) {
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const u = memberRoot.getUserDetails(id);
        if (u) out.push(u);
      }
    }
    return out;
  }, [memberRoot, workspaceSlug, issues]);

  // compute blocks + member loading
  const blocks: TOverviewBlock[] = useMemo(
    () => computeOverviewBlocks(mode, issues, projects, states),
    [mode, issues, projects, states]
  );

  const memberLoading: TMemberLoading[] = useMemo(
    () => computeMemberLoading(issues, members, states, projects),
    [issues, members, states, projects]
  );

  const dateWindow = useMemo(() => computeDateWindow(blocks), [blocks]);

  if (!isAdmin) return null;

  return (
    <>
      <PageHead title={t("projects_overview_page.title")} />
      <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ViewToggle value={mode} onChange={setMode} />
          <ScaleToggle value={scale} onChange={setScale} />
        </div>

        {/* Body */}
        {step === "loading" && (
          <div className="flex h-72 items-center justify-center text-tertiary text-13">
            {t("projects_overview_page.loading")}
          </div>
        )}

        {step === "error" && (
          <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 text-13">
            <AlertTriangle className="size-4 flex-shrink-0" />
            <span className="break-all">{errorMsg}</span>
          </div>
        )}

        {step === "ready" && (
          <>
            {/* Gantt */}
            <div className="h-[60vh] min-h-[420px]">
              {blocks.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-md border border-subtle bg-surface-1 text-tertiary text-13">
                  {t("projects_overview_page.no_data")}
                </div>
              ) : (
                <SimpleGantt
                  blocks={blocks}
                  windowStart={dateWindow.start}
                  windowEnd={dateWindow.end}
                  scale={scale}
                  modeLabel={t(
                    mode === "project"
                      ? "projects_overview_page.view_project"
                      : mode === "main"
                        ? "projects_overview_page.view_main_task"
                        : "projects_overview_page.view_sub_task"
                  )}
                />
              )}
            </div>

            {/* Member Loading */}
            <section className="flex flex-col gap-2">
              <h3 className="text-14 font-semibold text-primary">
                {t("projects_overview_page.member_loading")}
              </h3>
              <MemberLoadingTable data={memberLoading} />
            </section>
          </>
        )}
      </div>
    </>
  );
}

export default observer(ProjectsOverviewPage);
