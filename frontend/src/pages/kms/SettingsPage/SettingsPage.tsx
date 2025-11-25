import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useOrganization } from "@app/context";
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

  const { currentOrg } = useOrganization();

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.KMS}
          title="Project Settings"
          description="Configure general project settings"
        >
          <Link
            to="/organizations/$orgId/settings"
            params={{
              orgId: currentOrg.id
            }}
            className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
          >
            <InfoIcon size={12} /> Looking for organization settings?
          </Link>
        </PageHeader>
        <Tabs orientation="vertical" defaultValue={tabs[0].key}>
          <TabList>
            {tabs.map((tab) => (
              <Tab variant="project" value={tab.key} key={tab.key}>
                {tab.name}
              </Tab>
            ))}
          </TabList>
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
