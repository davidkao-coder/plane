/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import { observer } from "mobx-react";
import { LayoutDashboard } from "lucide-react";
import { Breadcrumbs, Header } from "@plane/ui";
import { AppHeader } from "@/components/core/app-header";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ContentWrapper } from "@/components/core/content-wrapper";

const TMSDashboardHeader = observer(function TMSDashboardHeader() {
  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={<BreadcrumbLink label="專案儀表板" icon={<LayoutDashboard className="size-4 text-tertiary" />} />}
          />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});

export default function TMSDashboardLayout() {
  return (
    <>
      <AppHeader header={<TMSDashboardHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
