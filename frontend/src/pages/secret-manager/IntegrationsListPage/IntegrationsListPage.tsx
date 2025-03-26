import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Badge, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import {
  FrameworkIntegrationTab,
  InfrastructureIntegrationTab,
  NativeIntegrationsTab,
  SecretSyncsTab
} from "./components";

export const IntegrationsListPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.SecretManager.IntegrationsListPage.id
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
      search: (prev) => ({ ...prev, selectedTab: tab as IntegrationsListPageTabs }),
      params: {
        projectId: currentWorkspace.id
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
      <div className="container relative mx-auto max-w-7xl pb-12 text-white">
        <div className="mb-8">
          <PageHeader
            title="Integrations"
            description="Manage integrations with third-party services."
          />
          <div className="mb-4 mt-4 flex flex-col rounded-r border-l-2 border-l-primary bg-mineshaft-300/5 px-4 py-2.5">
            <div className="mb-1 flex items-center text-sm">
              <FontAwesomeIcon icon={faInfoCircle} size="sm" className="mr-1.5 text-primary" />
              Integrations Update
            </div>
            <p className="mb-2 mt-1 text-sm text-bunker-300">
              Infisical is excited to announce{" "}
              <a
                className="text-bunker-200 underline decoration-primary-700 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
                href="https://infisical.com/docs/integrations/secret-syncs/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                Secret Syncs
              </a>
              , a new way to sync your secrets to third-party services using{" "}
              <a
                className="text-bunker-200 underline decoration-primary-700 underline-offset-4 duration-200 hover:text-mineshaft-100 hover:decoration-primary-600"
                href="https://infisical.com/docs/integrations/app-connections/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                App Connections
              </a>
              , offering deeper customization and re-configurability.
            </p>
            <p className="text-sm text-bunker-300">
              Existing integrations (now called Native Integrations) will continue to be supported
              as we build out our Secret Sync library.
            </p>
          </div>
          <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab value={IntegrationsListPageTabs.SecretSyncs}>
                Secret Syncs
                <Badge variant="primary" className="ml-1 cursor-pointer text-xs">
                  New
                </Badge>
              </Tab>
              <Tab value={IntegrationsListPageTabs.NativeIntegrations}>Native Integrations</Tab>
              <Tab value={IntegrationsListPageTabs.FrameworkIntegrations}>
                Framework Integrations
              </Tab>
              <Tab value={IntegrationsListPageTabs.InfrastructureIntegrations}>
                Infrastructure Integrations
              </Tab>
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
            <TabPanel value={IntegrationsListPageTabs.NativeIntegrations}>
              <ProjectPermissionCan
                renderGuardBanner
                I={ProjectPermissionActions.Read}
                a={ProjectPermissionSub.Integrations}
              >
                <NativeIntegrationsTab />
              </ProjectPermissionCan>
            </TabPanel>
            <TabPanel value={IntegrationsListPageTabs.FrameworkIntegrations}>
              <FrameworkIntegrationTab />
            </TabPanel>
            <TabPanel value={IntegrationsListPageTabs.InfrastructureIntegrations}>
              <InfrastructureIntegrationTab />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </>
  );
};
