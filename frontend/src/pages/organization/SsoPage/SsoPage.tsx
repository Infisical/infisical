import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { OrgProvisioningTab } from "@app/pages/organization/SettingsPage/components/OrgProvisioningTab";
import { OrgSsoTab } from "@app/pages/organization/SettingsPage/components/OrgSsoTab";

export const SsoPage = () => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const selectedTab = useSearch({
    from: ROUTE_PATHS.Organization.SsoPage.id,
    select: (el) => el.selectedTab,
    structuralSharing: true
  });

  const tabs = [
    { key: "sso", label: "SSO", component: OrgSsoTab },
    { key: "provisioning", label: "Provisioning", component: OrgProvisioningTab }
  ];

  const activeTab = tabs.some((tab) => tab.key === selectedTab) ? selectedTab : "sso";

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/sso",
      params: { orgId: currentOrg.id },
      search: { selectedTab: tab }
    });
  };

  return (
    <>
      <Helmet>
        <title>Infisical | SSO & Provisioning</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="flex w-full max-w-8xl flex-col gap-8">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title="SSO & Provisioning"
            description="Configure how users sign in and how accounts are provisioned in your organization."
          />
          <Tabs value={activeTab} onValueChange={updateSelectedTab}>
            <TabsList
              variant={isSubOrganization ? "sub-org" : "org"}
              aria-label="SSO and provisioning sections"
            >
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
        </div>
      </div>
    </>
  );
};
