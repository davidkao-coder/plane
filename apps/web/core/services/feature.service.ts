/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IFeature, TFeatureWritePayload } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TFeatureIssue = {
  id: string;
  name: string;
  sequence_id: number;
  estimate_hours: number | null;
  actual_hours: number | null;
  start_date: string | null;
  target_date: string | null;
  is_overdue: boolean;
  stage_id: string | null;
  stage_key: string | null;
  stage_name: string | null;
  stage_sort_order: number | null;
  process_step_id: string | null;
  process_step_name: string | null;
  state_id: string | null;
  state_name: string | null;
  state_group: string | null;
  // parent breadcrumb (Phase 1.5+ workboard)
  feature_id: string | null;
  feature_display_id: string | null;
  feature_name: string | null;
  requirement_id: string | null;
  requirement_display_id: string | null;
  module_id: string | null;
  module_name: string | null;
  created_at: string;
};

export class FeatureService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  base = (slug: string, projectId: string) =>
    `/api/workspaces/${slug}/projects/${projectId}/features`;

  async getFeatures(slug: string, projectId: string): Promise<IFeature[]> {
    return this.get(`${this.base(slug, projectId)}/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async createFeature(
    slug: string,
    projectId: string,
    data: TFeatureWritePayload
  ): Promise<IFeature> {
    return this.post(`${this.base(slug, projectId)}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async patchFeature(
    slug: string,
    projectId: string,
    featureId: string,
    data: TFeatureWritePayload
  ): Promise<IFeature> {
    return this.patch(`${this.base(slug, projectId)}/${featureId}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async deleteFeature(slug: string, projectId: string, featureId: string): Promise<void> {
    return this.delete(`${this.base(slug, projectId)}/${featureId}/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  /**
   * Phase 1.5 – list the Issues spawned from this Feature (one per ProcessStep
   * per Stage). Already sorted by stage.sort_order then step.sort_order.
   */
  async getIssuesForFeature(
    slug: string,
    projectId: string,
    featureId: string
  ): Promise<TFeatureIssue[]> {
    return this.get(`${this.base(slug, projectId)}/${featureId}/issues/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  // ─── Phase 2 / B3 – Feature dependencies ─────────────────────────────────

  async addDependency(
    slug: string,
    projectId: string,
    featureId: string,
    dependsOnId: string
  ): Promise<{ linked: boolean; created: boolean }> {
    return this.post(`${this.base(slug, projectId)}/${featureId}/dependencies/`, {
      depends_on_id: dependsOnId,
    })
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async removeDependency(
    slug: string,
    projectId: string,
    featureId: string,
    dependsOnId: string
  ): Promise<void> {
    return this.delete(`${this.base(slug, projectId)}/${featureId}/dependencies/${dependsOnId}/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  // ─── Requirement ↔ Feature pivot ─────────────────────────────────────────

  async listFeaturesForRequirement(
    slug: string,
    projectId: string,
    requirementId: string
  ): Promise<IFeature[]> {
    return this.get(
      `/api/workspaces/${slug}/projects/${projectId}/requirements/${requirementId}/features/`
    )
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async attachFeatureToRequirement(
    slug: string,
    projectId: string,
    requirementId: string,
    featureId: string
  ): Promise<{ linked: boolean; created: boolean; id: string }> {
    return this.post(
      `/api/workspaces/${slug}/projects/${projectId}/requirements/${requirementId}/features/`,
      { feature_id: featureId }
    )
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async detachFeatureFromRequirement(
    slug: string,
    projectId: string,
    requirementId: string,
    featureId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${slug}/projects/${projectId}/requirements/${requirementId}/features/${featureId}/`
    )
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}
