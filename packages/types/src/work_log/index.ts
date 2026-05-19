/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * WorkLog (工作日誌) – TMS customization.
 *
 * Multiple entries per Issue. Replaces the single Issue.actual_hours value.
 */

export interface IWorkLog {
  id: string;
  issue: string;
  user: string;
  /** ISO date – YYYY-MM-DD */
  log_date: string;
  /** Decimal hours, server-validated > 0 and ≤ 24. */
  hours: number;
  note: string;
  project: string;
  workspace: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type TWorkLogWritePayload = Partial<
  Pick<IWorkLog, "log_date" | "hours" | "note">
>;
