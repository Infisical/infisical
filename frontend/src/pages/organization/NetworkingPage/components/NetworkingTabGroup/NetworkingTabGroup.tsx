import { useSearch } from "@tanstack/react-router";

import { TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";

import { GatewayTab } from "../GatewayTab/GatewayTab";
import { RelayTab } from "../RelayTab/RelayTab";

export const NetworkingTabGroup = () => {
  const selectedTab = useSearch({
    from: ROUTE_PATHS.Organization.NetworkingPage.id,
    select: (el) => el.selectedTab,
    structuralSharing: true
  });

  const tabs = [
    { key: "gateways", component: GatewayTab },
    { key: "relays", component: RelayTab }
  ];

  return (
    <Tabs orientation="vertical" value={selectedTab}>
      {tabs.map(({ key, component: Component }) => (
        <TabPanel value={key} key={`tab-panel-${key}`}>
          <Component />
        </TabPanel>
      ))}
    </Tabs>
  );
};
