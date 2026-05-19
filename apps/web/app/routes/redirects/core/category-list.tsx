/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * /:workspaceSlug/projects/:projectId/categories
 *   -> /:workspaceSlug/projects/:projectId/modules
 */
import { redirect } from "react-router";
import type { Route } from "./+types/category-list";

export const clientLoader = ({ params }: Route.ClientLoaderArgs) => {
  const { workspaceSlug, projectId } = params;
  throw redirect(`/${workspaceSlug}/projects/${projectId}/modules`);
};

export default function CategoryListRedirect() {
  return null;
}
