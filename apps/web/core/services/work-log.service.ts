/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * WorkLog – TMS customization API client.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IWorkLog, TWorkLogWritePayload } from "@plane/types";
import { APIService } from "@/services/api.service";

export type TWorkLogListFilters = {
  user_id?: string;
  date_from?: string; // YYYY-MM-DD
  date_to?: string;
};

export class WorkLogService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  base = (slug: string, projectId: string, issueId: string) =>
    `/api/workspaces/${slug}/projects/${projectId}/issues/${issueId}/work-logs`;

  async list(
    slug: string,
    projectId: string,
    issueId: string,
    filters: TWorkLogListFilters = {}
  ): Promise<IWorkLog[]> {
    return this.get(`${this.base(slug, projectId, issueId)}/`, { params: filters })
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async create(
    slug: string,
    projectId: string,
    issueId: string,
    data: TWorkLogWritePayload
  ): Promise<IWorkLog> {
    return this.post(`${this.base(slug, projectId, issueId)}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async update(
    slug: string,
    projectId: string,
    issueId: string,
    workLogId: string,
    data: TWorkLogWritePayload
  ): Promise<IWorkLog> {
    return this.patch(`${this.base(slug, projectId, issueId)}/${workLogId}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }

  async remove(slug: string, projectId: string, issueId: string, workLogId: string): Promise<void> {
    return this.delete(`${this.base(slug, projectId, issueId)}/${workLogId}/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}
