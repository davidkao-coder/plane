/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Risk register – TMS Phase 2 / B4.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TRiskSeverity = "low" | "medium" | "high" | "critical";
export type TRiskLikelihood = "low" | "medium" | "high";
export type TRiskStatus = "open" | "mitigating" | "closed";

export type TRisk = {
  id: string;
  title: string;
  description: string;
  severity: TRiskSeverity;
  likelihood: TRiskLikelihood;
  status: TRiskStatus;
  mitigation: string;
  owner: string | null;
  due_date: string | null;
  project: string;
  workspace: string;
  created_at: string;
  updated_at: string;
};

export type TRiskWritePayload = Partial<
  Pick<TRisk, "title" | "description" | "severity" | "likelihood" | "status" | "mitigation" | "owner" | "due_date">
>;

export class RiskService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  base = (slug: string, projectId: string) => `/api/workspaces/${slug}/projects/${projectId}/risks`;

  async list(slug: string, projectId: string): Promise<TRisk[]> {
    return this.get(`${this.base(slug, projectId)}/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
  async create(slug: string, projectId: string, data: TRiskWritePayload): Promise<TRisk> {
    return this.post(`${this.base(slug, projectId)}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
  async update(slug: string, projectId: string, riskId: string, data: TRiskWritePayload): Promise<TRisk> {
    return this.patch(`${this.base(slug, projectId)}/${riskId}/`, data)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
  async remove(slug: string, projectId: string, riskId: string): Promise<void> {
    return this.delete(`${this.base(slug, projectId)}/${riskId}/`)
      .then((r) => r?.data)
      .catch((e) => {
        throw e?.response?.data;
      });
  }
}
