/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IRequirement, TRequirementWritePayload } from "@plane/types";
import { APIService } from "@/services/api.service";

export class RequirementService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  base = (slug: string, projectId: string) =>
    `/api/workspaces/${slug}/projects/${projectId}/requirements`;

  async getRequirements(slug: string, projectId: string): Promise<IRequirement[]> {
    return this.get(`${this.base(slug, projectId)}/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async createRequirement(
    slug: string,
    projectId: string,
    data: TRequirementWritePayload
  ): Promise<IRequirement> {
    return this.post(`${this.base(slug, projectId)}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async patchRequirement(
    slug: string,
    projectId: string,
    requirementId: string,
    data: TRequirementWritePayload
  ): Promise<IRequirement> {
    return this.patch(`${this.base(slug, projectId)}/${requirementId}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async deleteRequirement(slug: string, projectId: string, requirementId: string): Promise<void> {
    return this.delete(`${this.base(slug, projectId)}/${requirementId}/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}
