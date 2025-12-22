import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionSecretScanningConfigActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

import { ProjectScanningConfigTab } from "./components/ProjectScanningConfigTab";

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { currentOrg, isSubOrganization } = useOrganization();

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.SecretScanning}
          title="Project Settings"
          description="Configure your Secret Scanning product's configurations."
        >
          <Link
            to="/organizations/$orgId/settings"
            params={{
              orgId: currentOrg.id
            }}
            className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
          >
            <InfoIcon size={12} /> Looking for {isSubOrganization ? "sub-" : ""}organization
            settings?
          </Link>
        </PageHeader>
        <Tabs orientation="vertical" defaultValue="tab-project-general">
          <TabList>
            <Tab variant="project" value="tab-project-general">
              General
            </Tab>
            <Tab variant="project" value="tab-project-secret-scanning">
              Scanning Settings
            </Tab>
          </TabList>
          <TabPanel value="tab-project-general">
            <ProjectGeneralTab />
          </TabPanel>
          <TabPanel value="tab-project-secret-scanning">
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningConfigActions.Read}
              a={ProjectPermissionSub.SecretScanningConfigs}
              renderGuardBanner
            >
              <ProjectScanningConfigTab />
            </ProjectPermissionCan>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
