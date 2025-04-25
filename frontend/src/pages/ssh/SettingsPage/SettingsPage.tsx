import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { ProjectGeneralTab } from "./components/ProjectGeneralTab";
import { ProjectSshTab } from "./components/ProjectSshTab";

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-7xl">
        <PageHeader title={t("settings.project.title")} />
        <Tabs defaultValue="tab-project-general">
          <TabList>
            <Tab value="tab-project-general">General</Tab>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Project}
            >
              {(isAllowed) => isAllowed && <Tab value="tab-project-ssh">SSH Settings</Tab>}
            </ProjectPermissionCan>
          </TabList>
          <TabPanel value="tab-project-general">
            <ProjectGeneralTab />
          </TabPanel>
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Project}>
            {(isAllowed) =>
              isAllowed && (
                <TabPanel value="tab-project-ssh">
                  <ProjectSshTab />
                </TabPanel>
              )
            }
          </ProjectPermissionCan>
        </Tabs>
      </div>
    </div>
  );
};
