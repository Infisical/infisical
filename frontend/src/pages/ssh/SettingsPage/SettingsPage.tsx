import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { ProjectSshTab } from "./components/ProjectSshTab";

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-7xl">
        <PageHeader title="Settings" description="Configure your SSH product's configurations." />
        <Tabs defaultValue="tab-project-general">
          <TabList>
            <Tab value="tab-project-general">General</Tab>
          </TabList>
          <TabPanel value="tab-project-general">
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Project}
              renderGuardBanner
            >
              <ProjectSshTab />
            </ProjectPermissionCan>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
