import { useState } from "react";
import { useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { ROUTE_PATHS } from "@app/const/routes";

import { AuditLogStreamsTab } from "../AuditLogStreamTab";
import { ImportTab } from "../ImportTab";
import { KmipTab } from "../KmipTab/OrgKmipTab";
import { OrgAuthTab } from "../OrgAuthTab";
import { OrgEncryptionTab } from "../OrgEncryptionTab";
import { OrgGeneralTab } from "../OrgGeneralTab";
import { OrgWorkflowIntegrationTab } from "../OrgWorkflowIntegrationTab/OrgWorkflowIntegrationTab";

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
    { name: "Audit Log Streams", key: "tag-audit-log-streams", component: AuditLogStreamsTab },
    { name: "Import", key: "tab-import", component: ImportTab },
    {
      name: "Project Templates",
      key: "project-templates",
      // scott: temporary, remove once users have adjusted
      // eslint-disable-next-line react/no-unstable-nested-components
      component: () => (
        <div>
          <NoticeBannerV2
            className="mx-auto mt-10 max-w-4xl"
            title="Project Templates New Location"
          >
            <p className="text-sm text-bunker-200">
              Project templates have been moved to the Feature Settings page, under the &#34;Project
              Templates&#34; tab.
            </p>
            <p className="mt-2 text-sm text-bunker-200">
              Project templates are now product-specific, and can be configured for each project
              type.
            </p>
            <img
              src="/images/project-templates/project-templates-new-location.png"
              className="mt-4 w-full max-w-4xl rounded"
              alt="Project Templates New Location"
            />
          </NoticeBannerV2>
        </div>
      )
    },
    { name: "KMIP", key: "kmip", component: KmipTab }
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
