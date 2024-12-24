import { useState } from "react";
import { useSearch } from "@tanstack/react-router";

import { OrgPermissionCan } from "@app/components/permissions";
import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";

import { AuditLogStreamsTab } from "../AuditLogStreamTab";
import { ImportTab } from "../ImportTab";
import { OrgAuthTab } from "../OrgAuthTab";
import { OrgEncryptionTab } from "../OrgEncryptionTab";
import { OrgGeneralTab } from "../OrgGeneralTab";
import { OrgWorkflowIntegrationTab } from "../OrgWorkflowIntegrationTab/OrgWorkflowIntegrationTab";
import { ProjectTemplatesTab } from "../ProjectTemplatesTab";

const tabs = [
  { name: "General", key: "tab-org-general" },
  { name: "Security", key: "tab-org-security" },
  { name: "Encryption", key: "tab-org-encryption" },
  { name: "Workflow Integrations", key: "workflow-integrations" },
  { name: "Audit Log Streams", key: "tag-audit-log-streams" },
  { name: "Import", key: "tab-import" },
  { name: "Project Templates", key: "project-templates" }
];
export const OrgTabGroup = () => {
  const search = useSearch({
    from: "/_authenticate/_ctx-org-details/organization/_layout-org/settings/"
  });
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
      <TabPanel value={tabs[0].key}>
        <OrgGeneralTab />
      </TabPanel>
      <TabPanel value={tabs[1].key}>
        <OrgAuthTab />
      </TabPanel>
      <TabPanel value={tabs[2].key}>
        <OrgEncryptionTab />
      </TabPanel>
      <TabPanel value={tabs[3].key}>
        <OrgWorkflowIntegrationTab />
      </TabPanel>
      <TabPanel value={tabs[4].key}>
        <AuditLogStreamsTab />
      </TabPanel>
      <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Workspace}>
        <TabPanel value={tabs[5].key}>
          <ImportTab />
        </TabPanel>
      </OrgPermissionCan>
      <TabPanel value={tabs[6].key}>
        <ProjectTemplatesTab />
      </TabPanel>
    </Tabs>
  );
};
