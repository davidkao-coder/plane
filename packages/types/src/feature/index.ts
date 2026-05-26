/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Feature (功能) – TMS customization (Phase 1.5: strict 1:N under Requirement,
 * no longer attached to Stage – Stage lives on Issue as a cross-cutting tag).
 */

export interface IFeature {
  id: string;
  sequence_id: number;
  /** Display id, e.g. "FEA-001" – computed by backend. */
  feature_id: string;
  name: string;
  description: string;
  /** Phase 1.5 – parent Requirement (1:N). */
  requirement: string | null;
  estimated_hours: number | null;
  sort_order: number;
  project: string;
  workspace: string;
  /** Number of auto-spawned Issues, present on create response only. */
  spawned_issues?: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type TFeatureWritePayload = Partial<
  Pick<IFeature, "name" | "description" | "requirement" | "estimated_hours" | "sort_order">
>;
