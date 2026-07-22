import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
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
      <TabsList variant={isSubOrganization ? "sub-org" : "org"}>
        {tabs.map(({ key, label }) => (
          <TabsTrigger value={key} key={`tab-${key}`}>
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map(({ key, component: Component }) => (
        <TabsContent value={key} key={`tab-panel-${key}`}>
          <Component />
        </TabsContent>
      ))}
    </Tabs>
  );
};
