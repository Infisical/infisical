import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
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

      <Tabs orientation="vertical" value={selectedTab} onValueChange={updateSelectedTab}>
        <TabList>
          <Tab variant="org" value={SecretSharingPageTabs.ShareSecret}>
            Share Secrets
          </Tab>
          <Tab variant="org" value={SecretSharingPageTabs.RequestSecret}>
            Request Secrets
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
