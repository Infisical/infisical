import { useState } from "react";
import { useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";

import { SecretSharingSettingsGeneralTab } from "../SecretSharingSettingsGeneralTab";

export const SecretSharingSettingsTabGroup = () => {
  const search = useSearch({
    from: ROUTE_PATHS.Organization.SecretSharingSettings.id
  });
  const tabs = [
    {
      name: "General",
      key: "tab-secret-sharing-general",
      component: SecretSharingSettingsGeneralTab
    }
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
