import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  PageHeader,
  Tab,
  TabList,
  TabPanel,
  Tabs
} from "@app/components/v2";
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
  FrameworkIntegrationTab,
  InfrastructureIntegrationTab,
  NativeIntegrationsTab,
  SecretSyncsTab
} from "./components";

export const IntegrationsListPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { t } = useTranslation();

  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.SecretManager.IntegrationsListPage.id
  });

  const { data: integrations } = useGetWorkspaceIntegrations(currentProject.id);
  const hasNativeIntegrations = Boolean(integrations?.length);

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
      search: {
        selectedTab: tab as IntegrationsListPageTabs
      },
      params: {
        projectId: currentProject.id,
        orgId: currentOrg.id
      }
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
            title="Integrations"
            description="Manage integrations with third-party services."
          />
          <Tabs orientation="vertical" value={selectedTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab variant="project" value={IntegrationsListPageTabs.SecretSyncs}>
                Secret Syncs
              </Tab>
              <Tab variant="project" value={IntegrationsListPageTabs.FrameworkIntegrations}>
                Framework Integrations
              </Tab>
              <Tab variant="project" value={IntegrationsListPageTabs.InfrastructureIntegrations}>
                Infrastructure Integrations
              </Tab>
              {hasNativeIntegrations && (
                <Tab variant="project" value={IntegrationsListPageTabs.NativeIntegrations}>
                  Native Integrations
                </Tab>
              )}
            </TabList>
            <TabPanel value={IntegrationsListPageTabs.SecretSyncs}>
              <ProjectPermissionCan
                renderGuardBanner
                I={ProjectPermissionSecretSyncActions.Read}
                a={ProjectPermissionSub.SecretSyncs}
              >
                <SecretSyncsTab />
              </ProjectPermissionCan>
            </TabPanel>
            <TabPanel value={IntegrationsListPageTabs.FrameworkIntegrations}>
              <FrameworkIntegrationTab />
            </TabPanel>
            <TabPanel value={IntegrationsListPageTabs.InfrastructureIntegrations}>
              <InfrastructureIntegrationTab />
            </TabPanel>
            {hasNativeIntegrations && (
              <TabPanel value={IntegrationsListPageTabs.NativeIntegrations}>
                <Alert variant="warning" className="mb-4" hideTitle>
                  <AlertDescription>
                    We&apos;re moving Native Integrations to{" "}
                    <a
                      href="https://infisical.com/docs/integrations/secret-syncs/overview"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-mineshaft-100"
                    >
                      Secret Syncs
                    </a>
                    . If the integration you need isn&apos;t available in the Secret Syncs menu,
                    please get in touch with us at{" "}
                    <a
                      href="mailto:team@infisical.com"
                      className="underline underline-offset-2 hover:text-mineshaft-100"
                    >
                      team@infisical.com
                    </a>
                    .
                  </AlertDescription>
                </Alert>
                <ProjectPermissionCan
                  renderGuardBanner
                  I={ProjectPermissionActions.Read}
                  a={ProjectPermissionSub.Integrations}
                >
                  <NativeIntegrationsTab />
                </ProjectPermissionCan>
              </TabPanel>
            )}
          </Tabs>
        </div>
      </div>
    </>
  );
};
