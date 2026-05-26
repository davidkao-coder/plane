/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Stage — TMS customization (Phase 1.5).
 *
 *   Project ⊥ Stage (cross-cutting tag on Issue)
 *   Project → Module → Requirement → Feature → Issue
 */

export interface IStage {
  id: string;
  /** Stable identifier: req_analysis / design / poc / dev / testing / deployment / maintenance / unsorted / null */
  key: string | null;
  name: string;
  description: string;
  sort_order: number;
  start_date: string | null;
  target_date: string | null;
  archived_at: string | null;
  logo_props: Record<string, unknown>;
  external_source: string | null;
  external_id: string | null;
  project: string;
  workspace: string;
  process_template: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  /** Computed: how many issues are tagged with this stage. */
  total_issues?: number;
}

export type TStageWritePayload = Partial<
  Pick<
    IStage,
    "name" | "description" | "sort_order" | "start_date" | "target_date" | "logo_props"
  >
>;
