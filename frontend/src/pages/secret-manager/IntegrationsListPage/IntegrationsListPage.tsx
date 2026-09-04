import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
            <TabsList variant="project" aria-label="Project integrations sections">
              <TabsTrigger value={IntegrationsListPageTabs.AppConnections}>
                App Connections
              </TabsTrigger>
              <TabsTrigger value={IntegrationsListPageTabs.SecretSyncs}>Secret Syncs</TabsTrigger>
              <TabsTrigger value={IntegrationsListPageTabs.FrameworkIntegrations}>
                Framework Integrations
              </TabsTrigger>
              <TabsTrigger value={IntegrationsListPageTabs.InfrastructureIntegrations}>
                Infrastructure Integrations
              </TabsTrigger>
              {showNativeIntegrations && (
                <TabsTrigger value={IntegrationsListPageTabs.NativeIntegrations}>
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
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value={IntegrationsListPageTabs.AppConnections}>
              <AppConnectionsTab />
            </TabsContent>
            <TabsContent value={IntegrationsListPageTabs.FrameworkIntegrations}>
              <FrameworkIntegrationTab />
            </TabsContent>
            <TabsContent value={IntegrationsListPageTabs.InfrastructureIntegrations}>
              <InfrastructureIntegrationTab />
            </TabsContent>
            {showNativeIntegrations && (
              <TabsContent value={IntegrationsListPageTabs.NativeIntegrations}>
                <ProjectPermissionCan
                  renderGuardBanner
                  I={ProjectPermissionActions.Read}
                  a={ProjectPermissionSub.Integrations}
                >
                  <NativeIntegrationsTab />
                </ProjectPermissionCan>
              </TabsContent>
            )}
            <TabsContent value={IntegrationsListPageTabs.SecretSyncs}>
              <ProjectPermissionCan
                renderGuardBanner
                I={ProjectPermissionSecretSyncActions.Read}
                a={ProjectPermissionSub.SecretSyncs}
              >
                <SecretSyncsTab />
              </ProjectPermissionCan>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};
