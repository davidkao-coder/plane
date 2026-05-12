/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TTimeScale } from "@/helpers/projects-overview.helper";

type Props = {
  value: TTimeScale;
  onChange: (value: TTimeScale) => void;
};

const SCALES: { key: TTimeScale; labelKey: string }[] = [
  { key: "week", labelKey: "projects_overview_page.scale_week" },
  { key: "month", labelKey: "projects_overview_page.scale_month" },
  { key: "quarter", labelKey: "projects_overview_page.scale_quarter" },
];

export function ScaleToggle({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center rounded-md border border-subtle bg-surface-1 p-0.5">
      {SCALES.map((s) => {
        const isActive = value === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            className={cn(
              "px-2.5 py-1 text-12 font-medium rounded transition-colors",
              isActive ? "bg-surface-3 text-primary" : "text-tertiary hover:bg-surface-2"
            )}
          >
            {t(s.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
