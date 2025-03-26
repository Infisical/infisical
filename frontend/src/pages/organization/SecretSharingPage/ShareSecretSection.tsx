import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Badge, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";

import { RequestSecretTab } from "./components/RequestSecret/RequestSecretTab";
import { ShareSecretTab } from "./components/ShareSecret/ShareSecretTab";

enum SecretSharingPageTabs {
  ShareSecret = "share-secret",
  RequestSecret = "request-secret"
}

export const ShareSecretSection = () => {
  const navigate = useNavigate();

  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.Organization.SecretSharing.id
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: ROUTE_PATHS.Organization.SecretSharing.path,
      search: (prev) => ({ ...prev, selectedTab: tab as SecretSharingPageTabs })
    });
  };

  return (
    <div>
      <Helmet>
        <title>Secret Sharing</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>

      <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
        <TabList>
          <Tab value={SecretSharingPageTabs.ShareSecret}>Share Secrets</Tab>
          <Tab value={SecretSharingPageTabs.RequestSecret}>
            Request Secrets
            <Badge variant="primary" className="ml-1 cursor-pointer text-xs">
              New
            </Badge>
          </Tab>
        </TabList>
        <TabPanel value={SecretSharingPageTabs.ShareSecret}>
          <ShareSecretTab />
        </TabPanel>
        <TabPanel value={SecretSharingPageTabs.RequestSecret}>
          <RequestSecretTab />
        </TabPanel>
      </Tabs>
    </div>
  );
};
