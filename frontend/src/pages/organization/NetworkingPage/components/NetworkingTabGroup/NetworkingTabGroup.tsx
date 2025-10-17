import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";

import { GatewayTab } from "../GatewayTab/GatewayTab";
import { RelayTab } from "../RelayTab/RelayTab";

export const NetworkingTabGroup = () => {
  const navigate = useNavigate({
    from: ROUTE_PATHS.Organization.NetworkingPage.path
  });
  const selectedTab = useSearch({
    from: ROUTE_PATHS.Organization.NetworkingPage.id,
    select: (el) => el.selectedTab,
    structuralSharing: true
  });

  const tabs = [
    { name: "Gateways", key: "gateways", component: GatewayTab },
    { name: "Relays", key: "relays", component: RelayTab }
  ];

  const handleTabChange = (tab: string) => {
    navigate({
      search: { selectedTab: tab }
    });
  };

  return (
    <Tabs value={selectedTab} onValueChange={handleTabChange}>
      <TabList>
        {tabs.map((tab) => (
          <Tab variant="org" value={tab.key} key={tab.key}>
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
