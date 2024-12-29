import { useState } from "react";
import { useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";

import { AppConnectionsTab } from "../AppConnectionsTab";
import { AuditLogStreamsTab } from "../AuditLogStreamTab";
import { ImportTab } from "../ImportTab";
import { OrgAuthTab } from "../OrgAuthTab";
import { OrgEncryptionTab } from "../OrgEncryptionTab";
import { OrgGeneralTab } from "../OrgGeneralTab";
import { OrgWorkflowIntegrationTab } from "../OrgWorkflowIntegrationTab/OrgWorkflowIntegrationTab";
import { ProjectTemplatesTab } from "../ProjectTemplatesTab";

export const OrgTabGroup = () => {
  const search = useSearch({
    from: ROUTE_PATHS.Organization.SettingsPage.id
  });
  const tabs = [
    { name: "General", key: "tab-org-general", component: OrgGeneralTab },
    { name: "Security", key: "tab-org-security", component: OrgAuthTab },
    { name: "Encryption", key: "tab-org-encryption", component: OrgEncryptionTab },
    {
      name: "Workflow Integrations",
      key: "workflow-integrations",
      component: OrgWorkflowIntegrationTab
    },
    { name: "App Connections", key: "app-connections", component: AppConnectionsTab },
    { name: "Audit Log Streams", key: "tag-audit-log-streams", component: AuditLogStreamsTab },
    { name: "Import", key: "tab-import", component: ImportTab },
    { name: "Project Templates", key: "project-templates", component: ProjectTemplatesTab }
  ];

  const [selectedTab, setSelectedTab] = useState(search.selectedTab || tabs[0].key);

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
