import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { PkiSyncsTab } from "./components";

export const IntegrationsListPage = () => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
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
        projectId: currentWorkspace.id
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
      <div className="container relative mx-auto max-w-7xl pb-12 text-white">
        <div className="mb-8">
          <PageHeader
            title="Integrations"
            description="Manage integrations with third-party certificate services."
          />
          <Tabs value={currentTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab value={IntegrationsListPageTabs.PkiSyncs}>Certificate Syncs</Tab>
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
