import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";

const tabs = [
  {
    name: "General",
    key: "tab-project-general",
    Component: () => <div className="text-white">Coming soon...</div>
  }
];

export const SettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-7xl">
        <PageHeader title="Settings" />
        <Tabs defaultValue={tabs[0].key}>
          <TabList>
            {tabs.map((tab) => (
              <Tab value={tab.key} key={tab.key}>
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
