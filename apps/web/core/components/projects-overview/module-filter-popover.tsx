/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Lightweight popover for selecting which modules of a project to show
 * in the Projects Overview Gantt. Click-outside dismisses; selection is
 * applied immediately (no Apply button needed).
 */

import { useEffect, useRef, useState } from "react";
import { Filter, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

export type TModuleOption = { id: string; name: string };

type Props = {
  modules: TModuleOption[];
  /** Currently selected module IDs (empty = no filter = all). */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
};

export function ModuleFilterPopover({ modules, selected, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  const hasFilter = selected.size > 0;
  const count = selected.size;

  return (
    <div ref={rootRef} className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-11 transition-colors",
          "border",
          hasFilter
            ? "border-blue-500/60 bg-blue-500/10 text-blue-600 dark:text-blue-300"
            : "border-subtle text-tertiary hover:bg-black/[0.05] dark:hover:bg-white/[0.05]"
        )}
        title={t("projects_overview_page.filter_modules")}
      >
        <Filter className="size-3" />
        {hasFilter ? <span className="font-semibold">{count}</span> : null}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 w-64 rounded-md border border-subtle bg-surface-1 shadow-lg overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-subtle">
            <span className="text-12 font-semibold text-secondary">
              {t("projects_overview_page.filter_modules")}
            </span>
            {hasFilter && (
              <button
                type="button"
                onClick={clearAll}
                className="text-11 text-tertiary hover:text-primary inline-flex items-center gap-0.5"
              >
                <X className="size-3" />
                {t("projects_overview_page.clear")}
              </button>
            )}
          </div>
          {modules.length === 0 ? (
            <div className="px-3 py-4 text-center text-12 text-tertiary">
              {t("projects_overview_page.no_modules")}
            </div>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {modules.map((m) => {
                const checked = selected.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => toggle(m.id)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-12 text-primary hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        className="size-3.5 accent-blue-500 pointer-events-none"
                      />
                      <span className="truncate text-left flex-1">{m.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
