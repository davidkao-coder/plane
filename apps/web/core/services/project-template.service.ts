/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Project + Process Template – TMS Phase 1.5 API client.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TProcessStep = {
  id: string;
  template: string;
  name: string;
  sort_order: number;
  default_role: string;
  default_estimated_hours: number | null;
  created_at?: string;
  updated_at?: string;
};

export type TProcessTemplate = {
  id: string;
  workspace: string;
  name: string;
  stage_key: string;
  description: string;
  steps: TProcessStep[];
  created_at?: string;
  updated_at?: string;
};

export type TProjectTemplateModule = {
  id: string;
  template: string;
  name: string;
  description: string;
  sort_order: number;
  requirements?: TProjectTemplateRequirement[];
  created_at?: string;
  updated_at?: string;
};

export type TProjectTemplateRequirement = {
  id: string;
  template_module: string;
  description: string;
  source: string;
  priority: string;
  sort_order: number;
};

export type TProjectTemplate = {
  id: string;
  workspace: string;
  name: string;
  description: string;
  icon: string;
  is_default: boolean;
  sort_order: number;
  modules: TProjectTemplateModule[];
  modules_count: number;
  created_at?: string;
  updated_at?: string;
};

export class ProcessTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  base = (slug: string) => `/api/workspaces/${slug}/process-templates`;

  async list(slug: string): Promise<TProcessTemplate[]> {
    return this.get(`${this.base(slug)}/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async retrieve(slug: string, id: string): Promise<TProcessTemplate> {
    return this.get(`${this.base(slug)}/${id}/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async listSteps(slug: string, templateId: string): Promise<TProcessStep[]> {
    return this.get(`${this.base(slug)}/${templateId}/steps/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async bulkUpdateSteps(slug: string, templateId: string, steps: Partial<TProcessStep>[]): Promise<TProcessStep[]> {
    return this.post(`${this.base(slug)}/${templateId}/steps/`, { steps })
      .then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
}

export class ProjectTemplateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }
  base = (slug: string) => `/api/workspaces/${slug}/project-templates`;

  async list(slug: string): Promise<TProjectTemplate[]> {
    return this.get(`${this.base(slug)}/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async retrieve(slug: string, id: string): Promise<TProjectTemplate> {
    return this.get(`${this.base(slug)}/${id}/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async create(slug: string, data: Partial<TProjectTemplate>): Promise<TProjectTemplate> {
    return this.post(`${this.base(slug)}/`, data).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async update(slug: string, id: string, data: Partial<TProjectTemplate>): Promise<TProjectTemplate> {
    return this.patch(`${this.base(slug)}/${id}/`, data).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async remove(slug: string, id: string): Promise<void> {
    return this.delete(`${this.base(slug)}/${id}/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }

  // Modules
  async listModules(slug: string, templateId: string): Promise<TProjectTemplateModule[]> {
    return this.get(`${this.base(slug)}/${templateId}/modules/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async createModule(slug: string, templateId: string, data: Partial<TProjectTemplateModule>) {
    return this.post(`${this.base(slug)}/${templateId}/modules/`, data).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async updateModule(slug: string, templateId: string, moduleId: string, data: Partial<TProjectTemplateModule>) {
    return this.patch(`${this.base(slug)}/${templateId}/modules/${moduleId}/`, data).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async removeModule(slug: string, templateId: string, moduleId: string) {
    return this.delete(`${this.base(slug)}/${templateId}/modules/${moduleId}/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }

  // Requirements under template module
  async listTemplateRequirements(slug: string, templateId: string, moduleId: string): Promise<TProjectTemplateRequirement[]> {
    return this.get(`${this.base(slug)}/${templateId}/modules/${moduleId}/requirements/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async createTemplateRequirement(slug: string, templateId: string, moduleId: string, data: Partial<TProjectTemplateRequirement>) {
    return this.post(`${this.base(slug)}/${templateId}/modules/${moduleId}/requirements/`, data).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async updateTemplateRequirement(slug: string, templateId: string, moduleId: string, reqId: string, data: Partial<TProjectTemplateRequirement>) {
    return this.patch(`${this.base(slug)}/${templateId}/modules/${moduleId}/requirements/${reqId}/`, data).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
  async removeTemplateRequirement(slug: string, templateId: string, moduleId: string, reqId: string) {
    return this.delete(`${this.base(slug)}/${templateId}/modules/${moduleId}/requirements/${reqId}/`).then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }

  // Apply template to existing project
  async applyToProject(slug: string, projectId: string, templateId: string): Promise<{ applied: boolean; template: string; modules_created: number; requirements_created: number }> {
    return this.post(`/api/workspaces/${slug}/projects/${projectId}/apply-template/`, { template_id: templateId })
      .then((r) => r?.data).catch((e) => { throw e?.response?.data; });
  }
}
