/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IFeature, TFeatureWritePayload } from "@plane/types";
import { APIService } from "@/services/api.service";

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
