/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TOverviewMode } from "@/helpers/projects-overview.helper";

type Props = {
  value: TOverviewMode;
  onChange: (value: TOverviewMode) => void;
};

const MODES: { key: TOverviewMode; labelKey: string }[] = [
  { key: "project", labelKey: "projects_overview_page.view_project" },
  { key: "main", labelKey: "projects_overview_page.view_main_task" },
  { key: "sub", labelKey: "projects_overview_page.view_sub_task" },
];

export function ViewToggle({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center rounded-md border border-subtle bg-surface-1 p-0.5">
      {MODES.map((m) => {
        const isActive = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            className={cn(
              "px-3 py-1 text-13 font-medium rounded transition-colors",
              isActive ? "bg-surface-3 text-primary" : "text-tertiary hover:bg-surface-2"
            )}
          >
            {t(m.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
