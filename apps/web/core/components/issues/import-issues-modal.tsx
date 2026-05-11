/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserLite } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { cn } from "@plane/utils";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProjectState } from "@/hooks/store/use-project-state";
// helpers
import {
  mapRowsToIssues,
  parseExcelBuffer,
  type TMappedIssue,
  type TParseResult,
} from "@/helpers/import-issues.helper";

type TStep = "select" | "preview" | "importing" | "result";

type TImportResult = {
  success: number;
  warnings: number;
  failed: number;
  warningMessages: string[];
  errorMessages: string[];
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
};

export const ImportIssuesModal = observer(function ImportIssuesModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId } = props;
  const { t } = useTranslation();

  // state
  const [step, setStep] = useState<TStep>("select");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parseResult, setParseResult] = useState<TParseResult | null>(null);
  const [importResult, setImportResult] = useState<TImportResult | null>(null);
  const [parseErrorMsg, setParseErrorMsg] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // store hooks
  const { getProjectStates } = useProjectState();
  const { getProjectLabels } = useLabel();
  const { getUserDetails, project: { getProjectMemberIds } } = useMember();
  const { getProjectModuleIds, getModuleById } = useModule();
  const { issues: projectIssues } = useIssues(EIssuesStoreType.PROJECT);

  const handleClose = () => {
    setStep("select");
    setFileName("");
    setParseResult(null);
    setImportResult(null);
    setParseErrorMsg("");
    onClose();
  };

  // ─── File Processing ──────────────────────────────────────────────────────

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".xlsx")) {
        setParseErrorMsg(t("issue.import.error_file"));
        return;
      }
      setParseErrorMsg("");
      setFileName(file.name);

      const buffer = await file.arrayBuffer();
      const { rows, parseErrors } = await parseExcelBuffer(buffer);

      if (parseErrors.some((e) => e.message === "error_no_sheet")) {
        setParseErrorMsg(t("issue.import.error_no_sheet"));
        return;
      }

      // Get project data for mapping
      const states = getProjectStates(projectId) ?? [];
      const labels = getProjectLabels(projectId) ?? [];
      const memberIds = getProjectMemberIds(projectId, false) ?? [];
      const members: IUserLite[] = memberIds
        .map((id) => getUserDetails(id))
        .filter((m): m is IUserLite => m != null);
      const moduleIds = getProjectModuleIds(projectId) ?? [];
      const modules = moduleIds.map((id) => getModuleById(id)).filter((m): m is NonNullable<typeof m> => m != null);

      const result = mapRowsToIssues(rows, states, labels, members, modules);

      // Merge parse errors into result errors
      const allErrors = [...result.errors, ...parseErrors];
      setParseResult({ ...result, errors: allErrors });
      setStep("preview");
    },
    [projectId, getProjectStates, getProjectLabels, getUserDetails, getProjectMemberIds, t]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  // ─── Import ───────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!parseResult) return;
    setStep("importing");

    const result: TImportResult = {
      success: 0,
      warnings: parseResult.warnings.length,
      failed: parseResult.errors.length,
      warningMessages: parseResult.warnings.map((w) => w.message),
      errorMessages: parseResult.errors.map((e) => `Row ${e.row}: ${t(`issue.import.${e.message}` as any)}`),
    };

    // Map parentName → created issue id
    const parentIdMap = new Map<string, string>();

    const createOne = async (issue: TMappedIssue, parentId?: string) => {
      try {
        const payload = {
          name: issue.name,
          description_html: issue.description_html,
          state_id: issue.state_id,
          priority: issue.priority,
          assignee_ids: issue.assignee_ids,
          label_ids: issue.label_ids,
          start_date: issue.start_date,
          target_date: issue.target_date,
          estimate_hours: issue.estimate_hours,
          actual_hours: issue.actual_hours,
          completed_hours: issue.completed_hours,
          remaining_hours: issue.remaining_hours,
          parent_id: parentId ?? null,
        };
        const created = await projectIssues.createIssue(workspaceSlug, projectId, payload);
        // Add to modules (modules require a separate API call after issue creation)
        if (created?.id && issue.module_ids.length > 0) {
          await projectIssues.changeModulesInIssue(workspaceSlug, projectId, created.id, issue.module_ids, []);
        }
        result.success++;
        return created?.id as string | undefined;
      } catch {
        result.failed++;
        return undefined;
      }
    };

    // 1. Create parent issues
    for (const parent of parseResult.parents) {
      const id = await createOne(parent);
      if (id) parentIdMap.set(parent.name, id);
    }

    // 2. Create children
    for (const child of parseResult.children) {
      const parentId = parentIdMap.get(child.parentName);
      await createOne(child, parentId);
    }

    // 3. Create standalone
    for (const solo of parseResult.standalone) {
      await createOne(solo);
    }

    setImportResult(result);
    setStep("result");

    if (result.success > 0) {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("issue.import.result_title"),
        message: t("issue.import.result_success", { count: result.success }),
      });
    }
  };

  // ─── Download template ────────────────────────────────────────────────────

  const handleDownloadTemplate = async () => {
    // ExcelJS supports data validation writing (SheetJS community does not)
    const ExcelJS = await import("exceljs");

    // Gather project data for dropdowns
    const states = getProjectStates(projectId) ?? [];
    const memberIds = getProjectMemberIds(projectId, false) ?? [];
    const members: IUserLite[] = memberIds
      .map((id) => getUserDetails(id))
      .filter((m): m is IUserLite => m != null);
    const moduleIds = getProjectModuleIds(projectId) ?? [];
    const modules = moduleIds
      .map((id) => getModuleById(id))
      .filter((m): m is NonNullable<typeof m> => m != null);

    const stateNames = states.map((s) => s.name);
    const priorityValues = ["緊急", "高", "中", "低", "無"];
    const memberNames = members.map((m) => m.display_name);
    const moduleNames = modules.map((m) => m.name);

    const workbook = new ExcelJS.Workbook();

    // ── Lists sheet (hidden, provides dropdown source values) ─────────────
    const listsSheet = workbook.addWorksheet("Lists", { state: "hidden" });
    const maxRows = Math.max(stateNames.length, priorityValues.length, memberNames.length, moduleNames.length, 1);
    listsSheet.addRow(["狀態", "優先級", "指派成員", "模組"]);
    for (let i = 0; i < maxRows; i++) {
      listsSheet.addRow([stateNames[i] ?? "", priorityValues[i] ?? "", memberNames[i] ?? "", moduleNames[i] ?? ""]);
    }

    // ── Issues sheet ──────────────────────────────────────────────────────
    const ws = workbook.addWorksheet("Issues");
    ws.columns = [
      { header: t("issue.import.column_main") + " *", key: "main", width: 20 },
      { header: t("issue.import.column_sub"), key: "sub", width: 20 },
      { header: t("issue.import.column_desc"), key: "desc", width: 24 },
      { header: t("issue.import.column_state"), key: "state", width: 14 },
      { header: t("issue.import.column_priority"), key: "priority", width: 12 },
      { header: t("issue.import.column_assignees"), key: "assignees", width: 22 },
      { header: t("issue.import.column_labels"), key: "labels", width: 16 },
      { header: t("issue.import.column_modules"), key: "modules", width: 18 },
      { header: t("issue.import.column_start_date"), key: "start", width: 14 },
      { header: t("issue.import.column_due_date"), key: "due", width: 14 },
      { header: t("issue.import.column_estimate_hours"), key: "estimate", width: 14 },
      { header: t("issue.import.column_actual_hours"), key: "actual", width: 14 },
      { header: t("issue.import.column_completed_hours"), key: "completed", width: 16 },
      { header: t("issue.import.column_remaining_hours"), key: "remaining", width: 14 },
    ];

    // Example rows
    ws.addRow(["設計首頁改版", "設計 Hero Banner", "桌機與手機版 RWD", stateNames[0] ?? "進行中", priorityValues[1], memberNames[0] ?? "user@example.com", "設計,前端", moduleNames[0] ?? "前台開發", "2025-06-01", "2025-06-10", 8, "", "", ""]);
    ws.addRow(["設計首頁改版", "設計 Footer", "", stateNames[0] ?? "待辦", priorityValues[2], "", "設計", moduleNames[0] ?? "前台開發", "", "2025-06-15", 4, "", "", ""]);
    ws.addRow(["修復登入Bug", "", "點擊登入後白屏", stateNames[0] ?? "待辦", priorityValues[0], memberNames[0] ?? "user@example.com", "後端,Bug", "", "2025-06-01", "2025-06-03", 2, "", "", ""]);

    // ── Data validations ──────────────────────────────────────────────────
    // D = State (col 4), E = Priority (col 5), F = Assignees (col 6), H = Modules (col 8)
    const DATA_ROWS = "2:1000";

    // Priority — fixed inline list
    ws.dataValidations.add(`E${DATA_ROWS}`, {
      type: "list",
      allowBlank: true,
      formulae: [`"${priorityValues.join(",")}"`],
      showErrorMessage: false,
    });

    // State — from Lists sheet col A
    if (stateNames.length > 0) {
      ws.dataValidations.add(`D${DATA_ROWS}`, {
        type: "list",
        allowBlank: true,
        formulae: [`Lists!$A$2:$A$${stateNames.length + 1}`],
        showErrorMessage: false,
      });
    }

    // Assignees — from Lists sheet col C
    if (memberNames.length > 0) {
      ws.dataValidations.add(`F${DATA_ROWS}`, {
        type: "list",
        allowBlank: true,
        formulae: [`Lists!$C$2:$C$${memberNames.length + 1}`],
        showErrorMessage: false,
      });
    }

    // Modules — from Lists sheet col D
    if (moduleNames.length > 0) {
      ws.dataValidations.add(`H${DATA_ROWS}`, {
        type: "list",
        allowBlank: true,
        formulae: [`Lists!$D$2:$D$${moduleNames.length + 1}`],
        showErrorMessage: false,
      });
    }

    // ── Write & download ──────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plane_import_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── UI ───────────────────────────────────────────────────────────────────

  const totalItems = parseResult
    ? parseResult.parents.length + parseResult.children.length + parseResult.standalone.length
    : 0;

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.TOP}
      width={EModalWidth.XL}
    >
      <div className="flex flex-col gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-custom-border-200">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-custom-text-300" />
            <h3 className="text-base font-semibold text-custom-text-100">{t("issue.import.title")}</h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid size-6 place-items-center rounded-sm hover:bg-custom-background-80 text-custom-text-300"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {/* ── Step: Select ── */}
          {step === "select" && (
            <div className="flex flex-col gap-4">
              {/* Drop zone */}
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-12 cursor-pointer transition-colors",
                  isDragging
                    ? "border-custom-primary-100 bg-custom-primary-100/5"
                    : "border-custom-border-200 hover:border-custom-primary-100 hover:bg-custom-background-80"
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="size-8 text-custom-text-300" />
                <div className="text-center">
                  <p className="text-sm font-medium text-custom-text-200">{t("issue.import.select_file")}</p>
                  <p className="text-xs text-custom-text-400 mt-1">{t("issue.import.drag_drop")}</p>
                  <p className="text-xs text-custom-text-400">{t("issue.import.file_hint")}</p>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />

              {/* Error */}
              {parseErrorMsg && (
                <p className="flex items-center gap-1.5 text-sm text-red-500">
                  <AlertCircle className="size-4 flex-shrink-0" />
                  {parseErrorMsg}
                </p>
              )}

              {/* Download template */}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="text-xs text-custom-primary-100 hover:underline self-start"
              >
                {t("issue.import.download_template")}
              </button>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === "preview" && parseResult && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-custom-text-100">
                  {t("issue.import.preview_title", { count: totalItems })}
                </p>
                <button
                  type="button"
                  onClick={() => { setStep("select"); setParseResult(null); setFileName(""); }}
                  className="text-xs text-custom-text-400 hover:text-custom-text-200"
                >
                  {t("cancel")}
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-custom-border-200 p-3 text-center">
                  <p className="text-2xl font-semibold text-custom-text-100">{parseResult.parents.length}</p>
                  <p className="text-xs text-custom-text-400 mt-1">{t("issue.import.parent_count", { count: parseResult.parents.length })}</p>
                </div>
                <div className="rounded-lg border border-custom-border-200 p-3 text-center">
                  <p className="text-2xl font-semibold text-custom-text-100">{parseResult.children.length}</p>
                  <p className="text-xs text-custom-text-400 mt-1">{t("issue.import.child_count", { count: parseResult.children.length })}</p>
                </div>
                <div className="rounded-lg border border-custom-border-200 p-3 text-center">
                  <p className="text-2xl font-semibold text-custom-text-100">{parseResult.standalone.length}</p>
                  <p className="text-xs text-custom-text-400 mt-1">{t("issue.import.standalone_count", { count: parseResult.standalone.length })}</p>
                </div>
              </div>

              {/* Preview table */}
              <div className="max-h-64 overflow-y-auto rounded-lg border border-custom-border-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-custom-background-90">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-custom-text-300">{t("issue.import.column_main")}</th>
                      <th className="text-left px-3 py-2 font-medium text-custom-text-300">{t("issue.import.column_sub")}</th>
                      <th className="text-left px-3 py-2 font-medium text-custom-text-300">{t("issue.import.column_state")}</th>
                      <th className="text-left px-3 py-2 font-medium text-custom-text-300">{t("issue.import.column_priority")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...parseResult.parents, ...parseResult.children, ...parseResult.standalone]
                      .slice(0, 20)
                      .map((issue, idx) => (
                        <tr key={idx} className="border-t border-custom-border-100 hover:bg-custom-background-80">
                          <td className="px-3 py-1.5 text-custom-text-200 max-w-[180px] truncate">
                            {issue.isChild ? (
                              <span className="text-custom-text-400 ml-3">↳ {issue.parentName}</span>
                            ) : (
                              issue.name
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-custom-text-300 max-w-[180px] truncate">
                            {issue.isChild ? issue.name : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-custom-text-300">{issue.state_id ? "✓" : "—"}</td>
                          <td className="px-3 py-1.5 text-custom-text-300">{issue.priority}</td>
                        </tr>
                      ))}
                    {totalItems > 20 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-center text-custom-text-400">
                          +{totalItems - 20} more...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Warnings */}
              {parseResult.warnings.length > 0 && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                  <p className="text-xs font-medium text-yellow-600 mb-1">
                    {t("issue.import.result_warning", { count: parseResult.warnings.length })}
                  </p>
                  <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                    {parseResult.warnings.slice(0, 10).map((w, i) => (
                      <li key={i} className="text-xs text-yellow-600/80">• {w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Errors */}
              {parseResult.errors.length > 0 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <p className="text-xs font-medium text-red-500 mb-1">
                    {t("issue.import.result_failed", { count: parseResult.errors.length })}
                  </p>
                  <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                    {parseResult.errors.slice(0, 10).map((e, i) => (
                      <li key={i} className="text-xs text-red-500/80">• Row {e.row}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Importing ── */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <div className="size-10 animate-spin rounded-full border-4 border-custom-border-200 border-t-custom-primary-100" />
              <p className="text-sm text-custom-text-300">{t("issue.import.importing")}</p>
            </div>
          )}

          {/* ── Step: Result ── */}
          {step === "result" && importResult && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-green-500" />
                <h4 className="text-sm font-semibold text-custom-text-100">{t("issue.import.result_title")}</h4>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-center">
                  <p className="text-2xl font-semibold text-green-600">{importResult.success}</p>
                  <p className="text-xs text-green-600/80 mt-1">{t("issue.import.result_success", { count: importResult.success })}</p>
                </div>
                {importResult.warnings > 0 && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-center">
                    <p className="text-2xl font-semibold text-yellow-600">{importResult.warnings}</p>
                    <p className="text-xs text-yellow-600/80 mt-1">{t("issue.import.result_warning", { count: importResult.warnings })}</p>
                  </div>
                )}
                {importResult.failed > 0 && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-center">
                    <p className="text-2xl font-semibold text-red-500">{importResult.failed}</p>
                    <p className="text-xs text-red-500/80 mt-1">{t("issue.import.result_failed", { count: importResult.failed })}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-custom-border-200">
          <div className="text-xs text-custom-text-400 truncate max-w-xs">{fileName}</div>
          <div className="flex items-center gap-2">
            {step === "result" && (
              <Button variant="primary" onClick={handleClose}>
                {t("close")}
              </Button>
            )}
            {step === "preview" && (
              <>
                <Button variant="neutral-primary" onClick={() => { setStep("select"); setParseResult(null); }}>
                  {t("back")}
                </Button>
                <Button
                  variant="primary"
                  onClick={handleImport}
                  disabled={totalItems === 0}
                >
                  {t("issue.import.confirm")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalCore>
  );
});
