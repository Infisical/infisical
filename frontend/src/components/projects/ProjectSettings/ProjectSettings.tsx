import { useState } from "react";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";

import { ProjectTemplatesTab } from "./components";

const tabs = [
  { name: "Project Templates", key: "project-templates", component: ProjectTemplatesTab }
];

export const ProjectSettings = () => {
  const [selectedTab, setSelectedTab] = useState(tabs[0].key);

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab}>
      <TabList>
        {tabs.map((tab) => (
          <Tab value={tab.key} key={tab.key}>
            {tab.name}
          </Tab>
        ))}
      </TabList>
      {tabs.map(({ key, component: Component }) => (
        <TabPanel value={key} key={`tab-panel-${key}`}>
          <Component />
        </TabPanel>
      ))}
    </Tabs>
  );
};
