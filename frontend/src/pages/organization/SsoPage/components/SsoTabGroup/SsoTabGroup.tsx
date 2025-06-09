import { useState } from "react";
import { useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";

import { OrgProvisioningTab } from "../OrgProvisioningTab";
import { OrgSsoTab } from "../OrgSsoTab";

export const SsoTabGroup = () => {
  const search = useSearch({
    from: ROUTE_PATHS.Organization.SsoPage.id
  });
  const tabs = [
    { name: "General", key: "tab-sso-auth", component: OrgSsoTab },
    { name: "Provisioning", key: "tab-sso-identity", component: OrgProvisioningTab }
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
