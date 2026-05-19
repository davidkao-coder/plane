/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Stage – TMS customization API client.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IStage, TStageWritePayload } from "@plane/types";
import { APIService } from "@/services/api.service";

export class StageService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getStages(workspaceSlug: string, projectId: string): Promise<IStage[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/stages/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async createStage(
    workspaceSlug: string,
    projectId: string,
    data: TStageWritePayload
  ): Promise<IStage> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/stages/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async patchStage(
    workspaceSlug: string,
    projectId: string,
    stageId: string,
    data: TStageWritePayload
  ): Promise<IStage> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/stages/${stageId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async deleteStage(
    workspaceSlug: string,
    projectId: string,
    stageId: string
  ): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/stages/${stageId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
