import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader scope="project" title="Settings" description="Configure your PAM project." />
        <Tabs orientation="vertical" defaultValue="tab-project-general">
          <TabList>
            <Tab variant="project" value="tab-project-general">
              General
            </Tab>
          </TabList>
          <TabPanel value="tab-project-general">
            <ProjectGeneralTab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
