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
  const { currentOrg, isSubOrganization } = useOrganization();
  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.Organization.SecretSharing.id
  });

  const tabs = [
    { key: SecretSharingPageTabs.ShareSecret, label: "Share Secrets", component: ShareSecretTab },
    {
      key: SecretSharingPageTabs.RequestSecret,
      label: "Request Secrets",
      component: RequestSecretTab
    },
    ...(!isSubOrganization
      ? [
          {
            key: SecretSharingPageTabs.Settings,
            label: "Settings",
            component: SecretSharingSettingsTab
          }
        ]
      : [])
  ];

  const activeTab = tabs.some((tab) => tab.key === selectedTab)
    ? selectedTab
    : SecretSharingPageTabs.ShareSecret;

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/projects/secret-management/secret-sharing",
      params: { orgId: currentOrg.id },
      search: { selectedTab: tab }
    });
  };

  return (
    <div>
      <Helmet>
        <title>Secret Sharing</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>

      <Tabs value={activeTab} onValueChange={updateSelectedTab}>
        <TabList>
          {tabs.map(({ key, label }) => (
            <Tab variant="project" value={key} key={`tab-${key}`}>
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
    </div>
  );
};
