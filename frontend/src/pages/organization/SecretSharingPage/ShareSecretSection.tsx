import { useNavigate, useSearch } from "@tanstack/react-router";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
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
    <Tabs value={activeTab} onValueChange={updateSelectedTab}>
      <TabsList variant="project" aria-label="Secret sharing sections">
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
