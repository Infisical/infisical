import type { ComponentType } from "react";

import { PageTitle } from "@app/components/PageTitle";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@app/components/v4/ui/empty";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";

export type ProjectSettingsTab = {
  key: string;
  name: string;
  description?: string;
  hidden?: boolean;
  Body?: ComponentType;
};

export const ProjectSettingsLayout = ({
  tabs,
  selectedTab,
  generalHref
}: {
  tabs: readonly ProjectSettingsTab[];
  selectedTab?: string;
  generalHref: string;
}) => {
  const visible = tabs.filter((tab) => !tab.hidden);
  const active = visible.find((tab) => tab.key === selectedTab) ?? visible[0];
  return (
    <TooltipProvider>
      <PageTitle title={visible.length > 1 ? `${active.name} - Settings` : "Settings"} />
      <Stack gap={24}>
        <PageHeader title={active.name} description={active.description} />
        {active.Body ? (
          <active.Body />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>This settings tab isn&apos;t in v4 yet</EmptyTitle>
              <EmptyDescription>
                <a href={generalHref}>Go to General</a>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </Stack>
    </TooltipProvider>
  );
};
