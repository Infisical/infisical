import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { Alert, AlertTitle } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { AppConnectionsTable } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";
import { ExternalMigrationsTab } from "@app/pages/organization/SettingsPage/components/ExternalMigrationsTab";
import { OrgWorkflowIntegrationTab } from "@app/pages/organization/SettingsPage/components/OrgWorkflowIntegrationTab";
import { IntegrationsListPageTabs } from "@app/types/integrations";

const AppConnectionsTab = withPermission(
  () => (
    <>
      <Alert variant="info" className="mb-4">
        <InfoIcon />
        <AlertTitle>
          App connections can also be created and managed independently in projects now.
        </AlertTitle>
      </Alert>
      <AppConnectionsTable />
    </>
  ),
  {
    action: OrgPermissionAppConnectionActions.Read,
    subject: OrgPermissionSubjects.AppConnections
  }
);

export const IntegrationsPage = () => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const selectedTab = useSearch({
    from: ROUTE_PATHS.Organization.IntegrationsPage.id,
    select: (el) => el.selectedTab,
    structuralSharing: true
  });

  const tabs = [
    {
      key: IntegrationsListPageTabs.AppConnections as string,
      label: "App Connections",
      component: AppConnectionsTab
    },
    {
      key: "workflow-integrations",
      label: "Workflow Integrations",
      component: OrgWorkflowIntegrationTab
    },
    {
      key: "external-migrations",
      label: "External Migrations",
      component: ExternalMigrationsTab
    }
  ];

  const activeTab = tabs.some((tab) => tab.key === selectedTab)
    ? selectedTab
    : IntegrationsListPageTabs.AppConnections;

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/integrations",
      params: { orgId: currentOrg.id },
      search: { selectedTab: tab }
    });
  };

  return (
    <>
      <Helmet>
        <title>Infisical | Integrations</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title="Integrations"
            description="Connect Infisical to external services and manage organization-wide integrations."
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
