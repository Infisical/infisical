import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";

import { GatewayTab } from "../GatewayTab/GatewayTab";
import { RelayTab } from "../RelayTab/RelayTab";

export const NetworkingTabGroup = () => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const selectedTab = useSearch({
    from: ROUTE_PATHS.Organization.NetworkingPage.id,
    select: (el) => el.selectedTab,
    structuralSharing: true
  });

  const tabs = [
    { key: "gateways", label: "Gateways", component: GatewayTab },
    { key: "relays", label: "Relays", component: RelayTab }
  ];

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/networking",
      params: { orgId: currentOrg.id },
      search: { selectedTab: tab }
    });
  };

  return (
    <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
      <TabList>
        {tabs.map(({ key, label }) => (
          <Tab variant={isSubOrganization ? "namespace" : "org"} value={key} key={`tab-${key}`}>
            {label}
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
