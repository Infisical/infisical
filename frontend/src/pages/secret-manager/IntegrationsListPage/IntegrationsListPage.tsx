import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
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

  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.SecretManager.IntegrationsListPage.id
  });

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
          <Tabs orientation="vertical" value={selectedTab}>
            <TabPanel value={IntegrationsListPageTabs.AppConnections}>
              <AppConnectionsTab />
            </TabPanel>
            <TabPanel value={IntegrationsListPageTabs.FrameworkIntegrations}>
              <FrameworkIntegrationTab />
            </TabPanel>
            <TabPanel value={IntegrationsListPageTabs.InfrastructureIntegrations}>
              <InfrastructureIntegrationTab />
            </TabPanel>
            <TabPanel value={IntegrationsListPageTabs.NativeIntegrations}>
              <ProjectPermissionCan
                renderGuardBanner
                I={ProjectPermissionActions.Read}
                a={ProjectPermissionSub.Integrations}
              >
                <NativeIntegrationsTab />
              </ProjectPermissionCan>
            </TabPanel>
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
