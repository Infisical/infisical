import { ComponentProps, useState } from "react";
import { Helmet } from "react-helmet";
import { Bell } from "lucide-react";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useScopeVariant } from "@app/hooks";

import { AlarmsTable } from "./components/AlarmsTable";
import { ChannelsTable } from "./components/channels/ChannelsTable";

type Props = {
  projectId?: string;
  scopeName?: string;
  scope: ComponentProps<typeof PageHeader>["scope"];
};

enum AlarmsPageTab {
  Alarms = "alarms",
  Channels = "channels"
}

export const AlarmsPage = ({ projectId, scopeName, scope }: Props) => {
  const scopeVariant = useScopeVariant();
  const tabVariant = scopeVariant === "sub-org" ? "namespace" : scopeVariant;
  const [selectedTab, setSelectedTab] = useState<string>(AlarmsPageTab.Alarms);

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>Infisical | Alarms</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 pb-6 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={scope}
            icon={Bell}
            title="Alarms"
            description="Route resource events to recipients over your channels. An alarm covers a bound resource, or every resource matching a filter."
          />
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabList>
              <Tab variant={tabVariant} value={AlarmsPageTab.Alarms}>
                Alarms
              </Tab>
              <Tab variant={tabVariant} value={AlarmsPageTab.Channels}>
                Channels
              </Tab>
            </TabList>
            <TabPanel value={AlarmsPageTab.Alarms}>
              <AlarmsTable projectId={projectId} scopeName={scopeName} />
            </TabPanel>
            <TabPanel value={AlarmsPageTab.Channels}>
              <ChannelsTable projectId={projectId} />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
