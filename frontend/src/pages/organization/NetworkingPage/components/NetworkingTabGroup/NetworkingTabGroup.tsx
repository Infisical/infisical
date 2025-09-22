import { useState } from "react";
import { useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";

import { GatewayTab } from "../GatewayTab/GatewayTab";
import { RelayTab } from "../RelayTab/RelayTab";

export const NetworkingTabGroup = () => {
  const search = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organization/networking/"
  });

  const tabs = [
    { name: "Gateways", key: "gateways", component: GatewayTab },
    { name: "Relays", key: "relays", component: RelayTab }
  ];

  const [selectedTab, setSelectedTab] = useState(search.selectedTab || tabs[0].key);

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab}>
      <TabList>
        {tabs.map((tab) => (
          <Tab value={tab.key} key={tab.key}>
            {tab.name}
          </Tab>
        ))}
      </TabList>
      {tabs.map(({ key, component: Component }) => (
        <TabPanel value={key} key={`tab-panel-${key}`}>
          <Component />
        </TabPanel>
      ))}
    </Tabs>
  );
};
