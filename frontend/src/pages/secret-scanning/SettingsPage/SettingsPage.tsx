import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningConfigActions } from "@app/context/ProjectPermissionContext/types";

import { ProjectScanningConfigTab } from "./components/ProjectScanningConfigTab";

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-7xl">
        <PageHeader
          title="Settings"
          description="Configure your Secret Scanning product's configurations."
        />
        <Tabs defaultValue="tab-project-general">
          <TabList>
            <Tab value="tab-project-general">General</Tab>
          </TabList>
          <TabPanel value="tab-project-general">
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
