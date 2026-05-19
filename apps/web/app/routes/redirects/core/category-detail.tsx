/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * /:workspaceSlug/projects/:projectId/categories/:moduleId
 *   -> /:workspaceSlug/projects/:projectId/modules/:moduleId
 *
 * "Category" is the user-facing rename of "Module"; the URL accepts both
 * spellings for bookmarks and outbound links, but everything internal still
 * resolves to /modules/.
 */
import { redirect } from "react-router";
import type { Route } from "./+types/category-detail";

export const clientLoader = ({ params }: Route.ClientLoaderArgs) => {
  const { workspaceSlug, projectId, moduleId } = params;
  throw redirect(`/${workspaceSlug}/projects/${projectId}/modules/${moduleId}`);
};

export default function CategoryDetailRedirect() {
  return null;
}
