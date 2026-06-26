import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
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
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title="SSO & Provisioning"
            description="Configure how users sign in and how accounts are provisioned in your organization."
          />
          <Tabs value={activeTab} onValueChange={updateSelectedTab}>
            <TabList>
              {tabs.map(({ key, label }) => (
                <Tab
                  variant={isSubOrganization ? "namespace" : "org"}
                  value={key}
                  key={`tab-${key}`}
                >
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
      </div>
    </>
  );
};
