import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader, TabPanel, Tabs } from "@app/components/v2";
import { LookingForOrgPageLink } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

const tabs = [
  {
    name: "General",
    key: "tab-project-general",
    Component: ProjectGeneralTab
  }
];

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full justify-center bg-background text-foreground">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.KMS}
          title="Project Settings"
          description="Configure general project settings"
        >
          <LookingForOrgPageLink page="settings" />
        </PageHeader>
        <Tabs orientation="vertical" defaultValue={tabs[0].key}>
          {tabs.map(({ key, Component }) => (
            <TabPanel value={key} key={key}>
              <Component />
            </TabPanel>
          ))}
        </Tabs>
      </div>
    </div>
  );
};
