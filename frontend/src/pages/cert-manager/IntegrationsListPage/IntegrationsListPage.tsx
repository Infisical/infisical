import { useNavigate, useSearch } from "@tanstack/react-router";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization, useProject } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { PkiSyncsTab } from "./components";

export const IntegrationsListPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { t } = useTranslation();

  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.CertManager.IntegrationsListPage.id
  });

  const currentTab = selectedTab || IntegrationsListPageTabs.PkiSyncs;

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: ROUTE_PATHS.CertManager.IntegrationsListPage.path,
      search: {
        selectedTab: tab as IntegrationsListPageTabs
      },
      params: {
        projectId: currentProject?.id,
        orgId: currentOrg.id
      }
    });
  };

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("integrations.title") })}</title>
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your certificates in seconds" />
        <meta name="og:description" content="Sync and manage PKI certificates across services" />
      </Helmet>
      <div className="relative mx-auto max-w-8xl pb-12 text-white">
        <div className="mb-8">
          <PageHeader
            scope={ProjectType.CertificateManager}
            title="Project Integrations"
            description="Manage integrations with third-party certificate services."
          />
          <Tabs orientation="vertical" value={currentTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab variant="project" value={IntegrationsListPageTabs.PkiSyncs}>
                Certificate Syncs
              </Tab>
            </TabList>
            <TabPanel value={IntegrationsListPageTabs.PkiSyncs}>
              <ProjectPermissionCan
                renderGuardBanner
                I={ProjectPermissionPkiSyncActions.Read}
                a={ProjectPermissionSub.PkiSyncs}
              >
                <PkiSyncsTab />
              </ProjectPermissionCan>
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </>
  );
};
