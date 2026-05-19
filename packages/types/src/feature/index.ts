/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Feature (功能) – TMS customization. Mapped M:N to Requirement, optionally
 * lives under a Stage.
 */

export interface IFeature {
  id: string;
  sequence_id: number;
  /** Display id, e.g. "FEA-001" – computed by backend. */
  feature_id: string;
  name: string;
  description: string;
  stage: string | null;
  estimated_hours: number | null;
  sort_order: number;
  project: string;
  workspace: string;
  /** Linked requirement UUIDs (read-only convenience field). */
  requirement_ids: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type TFeatureWritePayload = Partial<
  Pick<IFeature, "name" | "description" | "stage" | "estimated_hours" | "sort_order">
>;
