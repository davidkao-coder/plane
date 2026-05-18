/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 *
 * Billing & plans page is hidden in this deployment – redirect any direct
 * URL access back to general workspace settings.
 */

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

function BillingSettingsPage() {
  const router = useRouter();
  const { workspaceSlug } = useParams();

  useEffect(() => {
    if (workspaceSlug) router.replace(`/${workspaceSlug}/settings`);
  }, [workspaceSlug, router]);

  return null;
}

export default BillingSettingsPage;
