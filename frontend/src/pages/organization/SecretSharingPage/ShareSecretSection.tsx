import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";

import { RequestSecretTab } from "./components/RequestSecret/RequestSecretTab";
import { SecretSharingSettingsTab } from "./components/SecretSharingSettings/SecretSharingSettingsTab";
import { ShareSecretTab } from "./components/ShareSecret/ShareSecretTab";

enum SecretSharingPageTabs {
  ShareSecret = "share-secret",
  RequestSecret = "request-secret",
  Settings = "settings"
}

export const ShareSecretSection = () => {
  const navigate = useNavigate();
  const { isSubOrganization, currentOrg } = useOrganization();

  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.Organization.SecretSharing.id
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: ROUTE_PATHS.Organization.SecretSharing.path,
      params: { orgId: currentOrg.id },
      search: (prev) => ({ ...prev, selectedTab: tab as SecretSharingPageTabs })
    });
  };

  const tabVariant = isSubOrganization ? "namespace" : "org";

  return (
    <div>
      <Helmet>
        <title>Secret Sharing</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>

      <Tabs orientation="vertical" value={selectedTab} onValueChange={updateSelectedTab}>
        <TabList>
          <Tab variant={tabVariant} value={SecretSharingPageTabs.ShareSecret}>
            Share Secrets
          </Tab>
          <Tab variant={tabVariant} value={SecretSharingPageTabs.RequestSecret}>
            Request Secrets
          </Tab>
          {!isSubOrganization && (
            <Tab variant={tabVariant} value={SecretSharingPageTabs.Settings}>
              Settings
            </Tab>
          )}
        </TabList>
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
