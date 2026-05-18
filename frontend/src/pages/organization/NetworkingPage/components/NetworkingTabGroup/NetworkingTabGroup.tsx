import { useSearch } from "@tanstack/react-router";

import { TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";

import { GatewaysSection } from "../GatewaysSection/GatewaysSection";
import { RelaysSection } from "../RelaysSection/RelaysSection";

export const NetworkingTabGroup = () => {
  const selectedTab = useSearch({
    from: ROUTE_PATHS.Organization.NetworkingPage.id,
    select: (el) => el.selectedTab,
    structuralSharing: true
  });

  return (
    <Tabs orientation="vertical" value={selectedTab}>
      <TabPanel value="gateways">
        <GatewaysSection />
      </TabPanel>
      <TabPanel value="relays">
        <RelaysSection />
      </TabPanel>
    </Tabs>
  );
};
