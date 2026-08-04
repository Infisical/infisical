import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { NATIVE_INTEGRATION_DEPRECATION_DATE } from "@app/const/nativeIntegrationDeprecation";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { useGetWorkspaceIntegrations } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import {
  AppConnectionsTab,
  FrameworkIntegrationTab,
  InfrastructureIntegrationTab,
  NativeIntegrationsTab,
  SecretSyncsTab
} from "./components";

export const IntegrationsListPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.SecretManager.IntegrationsListPage.id
  });

  const { data: integrations = [] } = useGetWorkspaceIntegrations(currentProject.id, {
    refetchInterval: false
  });

  // Native integrations are deprecated: the tab is only offered to projects that already have one.
  // Keeping it mounted while the user is standing on it avoids an empty page when they delete their
  // last integration.
  const showNativeIntegrations =
    integrations.length > 0 || selectedTab === IntegrationsListPageTabs.NativeIntegrations;

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
      params: { orgId: currentOrg.id, projectId: currentProject.id },
      search: { selectedTab: tab as IntegrationsListPageTabs }
    });
  };

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("integrations.title") })}</title>
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta name="og:description" content={t("integrations.description") as string} />
      </Helmet>
      <div className="relative mx-auto max-w-8xl pb-12 text-white">
        <div className="mb-8">
          <PageHeader
            scope={ProjectType.SecretManager}
            title="Project Integrations"
            description="Manage integrations with third-party services."
          />
          <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab variant="project" value={IntegrationsListPageTabs.AppConnections}>
                App Connections
              </Tab>
              <Tab variant="project" value={IntegrationsListPageTabs.SecretSyncs}>
                Secret Syncs
              </Tab>
              <Tab variant="project" value={IntegrationsListPageTabs.FrameworkIntegrations}>
                Framework Integrations
              </Tab>
              <Tab variant="project" value={IntegrationsListPageTabs.InfrastructureIntegrations}>
                Infrastructure Integrations
              </Tab>
              {showNativeIntegrations && (
                <Tab
                  variant="project"
                  value={IntegrationsListPageTabs.NativeIntegrations}
                  className="gap-2"
                >
                  Native Integrations
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <TriangleAlertIcon className="size-3.5 text-warning" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Native Integrations are being retired on {NATIVE_INTEGRATION_DEPRECATION_DATE}
                      . Migrate to Secret Syncs.
                    </TooltipContent>
                  </Tooltip>
                </Tab>
              )}
            </TabList>
            <TabPanel value={IntegrationsListPageTabs.AppConnections}>
              <AppConnectionsTab />
            </TabPanel>
            <TabPanel value={IntegrationsListPageTabs.FrameworkIntegrations}>
              <FrameworkIntegrationTab />
            </TabPanel>
            <TabPanel value={IntegrationsListPageTabs.InfrastructureIntegrations}>
              <InfrastructureIntegrationTab />
            </TabPanel>
            {showNativeIntegrations && (
              <TabPanel value={IntegrationsListPageTabs.NativeIntegrations}>
                <ProjectPermissionCan
                  renderGuardBanner
                  I={ProjectPermissionActions.Read}
                  a={ProjectPermissionSub.Integrations}
                >
                  <NativeIntegrationsTab />
                </ProjectPermissionCan>
              </TabPanel>
            )}
            <TabPanel value={IntegrationsListPageTabs.SecretSyncs}>
              <ProjectPermissionCan
                renderGuardBanner
                I={ProjectPermissionSecretSyncActions.Read}
                a={ProjectPermissionSub.SecretSyncs}
              >
                <SecretSyncsTab />
              </ProjectPermissionCan>
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </>
  );
};
