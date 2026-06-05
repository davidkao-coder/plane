/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import { observer } from "mobx-react";
import { ListTodo } from "lucide-react";
import { Breadcrumbs, Header } from "@plane/ui";
import { AppHeader } from "@/components/core/app-header";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { ContentWrapper } from "@/components/core/content-wrapper";

const MyQueueHeader = observer(function MyQueueHeader() {
  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={<BreadcrumbLink label="我的隊列" icon={<ListTodo className="size-4 text-tertiary" />} />}
          />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});

export default function MyQueueLayout() {
  return (
    <>
      <AppHeader header={<MyQueueHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
