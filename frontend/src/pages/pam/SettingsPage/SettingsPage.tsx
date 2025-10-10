import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-bunker-800 flex h-full w-full justify-center text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-7xl">
        <PageHeader title="Settings" description="Configure your PAM project." />
        <Tabs defaultValue="tab-project-general">
          <TabList>
            <Tab value="tab-project-general">General</Tab>
          </TabList>
          <TabPanel value="tab-project-general">
            <ProjectGeneralTab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
