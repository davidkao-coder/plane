/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Requirement (需求) – TMS customization.
 */

export type TRequirementPriority = "urgent" | "high" | "medium" | "low" | "none";

export interface IRequirement {
  id: string;
  sequence_id: number;
  /** Display id, e.g. "REQ-001" – computed by backend. */
  requirement_id: string;
  description: string;
  source: string;
  priority: TRequirementPriority;
  /** Phase 1.5 – parent Module (business module). Required for new records. */
  module: string | null;
  project: string;
  workspace: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type TRequirementWritePayload = Partial<
  Pick<IRequirement, "description" | "source" | "priority" | "module">
>;
