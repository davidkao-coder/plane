/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// types
import type { TIssue } from "@plane/types";
// components
import { HoursProperty } from "@/components/issues/issue-detail/hours-property";

type THoursField = "estimate_hours" | "actual_hours" | "completed_hours" | "remaining_hours";

type Props = {
  issue: TIssue;
  onClose: () => void;
  onChange: (issue: TIssue, data: Partial<TIssue>, updates: any) => void;
  disabled: boolean;
  field: THoursField;
};

const SpreadsheetHoursColumnBase = observer(function SpreadsheetHoursColumnBase(props: Props) {
  const { issue, onChange, disabled, onClose, field } = props;

  return (
    <div className="h-11 border-b-[0.5px] border-subtle flex items-center px-page-x">
      <HoursProperty
        label=""
        value={issue[field] != null ? Number(issue[field]) : null}
        onChange={(val) => {
          onChange(issue, { [field]: val }, { changed_property: field, change_details: val });
          onClose();
        }}
        disabled={disabled}
      />
    </div>
  );
});

export const SpreadsheetEstimateHoursColumn = observer(function SpreadsheetEstimateHoursColumn(
  props: Omit<Props, "field">
) {
  return <SpreadsheetHoursColumnBase {...props} field="estimate_hours" />;
});

export const SpreadsheetActualHoursColumn = observer(function SpreadsheetActualHoursColumn(
  props: Omit<Props, "field">
) {
  return <SpreadsheetHoursColumnBase {...props} field="actual_hours" />;
});

export const SpreadsheetCompletedHoursColumn = observer(function SpreadsheetCompletedHoursColumn(
  props: Omit<Props, "field">
) {
  return <SpreadsheetHoursColumnBase {...props} field="completed_hours" />;
});

export const SpreadsheetRemainingHoursColumn = observer(function SpreadsheetRemainingHoursColumn(
  props: Omit<Props, "field">
) {
  return <SpreadsheetHoursColumnBase {...props} field="remaining_hours" />;
});
