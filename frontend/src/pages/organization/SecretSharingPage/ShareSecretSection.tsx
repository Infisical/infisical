import { Helmet } from "react-helmet";
import { useSearch } from "@tanstack/react-router";

import { TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";

import { RequestSecretTab } from "./components/RequestSecret/RequestSecretTab";
import { SecretSharingSettingsTab } from "./components/SecretSharingSettings/SecretSharingSettingsTab";
import { ShareSecretTab } from "./components/ShareSecret/ShareSecretTab";

enum SecretSharingPageTabs {
  ShareSecret = "share-secret",
  RequestSecret = "request-secret",
  Settings = "settings"
}

export const ShareSecretSection = () => {
  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.Organization.SecretSharing.id
  });

  return (
    <div>
      <Helmet>
        <title>Secret Sharing</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>

      <Tabs orientation="vertical" value={selectedTab}>
        <TabPanel value={SecretSharingPageTabs.ShareSecret}>
          <ShareSecretTab />
        </TabPanel>
        <TabPanel value={SecretSharingPageTabs.RequestSecret}>
          <RequestSecretTab />
        </TabPanel>
        <TabPanel value={SecretSharingPageTabs.Settings}>
          <SecretSharingSettingsTab />
        </TabPanel>
      </Tabs>
    </div>
  );
};
