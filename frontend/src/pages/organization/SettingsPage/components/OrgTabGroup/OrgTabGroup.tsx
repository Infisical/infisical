import { useState } from "react";
import { useSearch } from "@tanstack/react-router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";

import { AuditLogStreamsTab } from "../AuditLogStreamTab";
import { ExternalMigrationsTab } from "../ExternalMigrationsTab";
import { OrgEncryptionTab } from "../OrgEncryptionTab";
import { OrgGeneralTab } from "../OrgGeneralTab";
import { OrgProductSettingsTab } from "../OrgProductSettingsTab";
import { OrgProvisioningTab } from "../OrgProvisioningTab";
import { OrgSecurityTab } from "../OrgSecurityTab";
import { OrgSsoTab } from "../OrgSsoTab";
import { OrgWorkflowIntegrationTab } from "../OrgWorkflowIntegrationTab";
import { ProjectTemplatesTab } from "../ProjectTemplatesTab";

export const OrgTabGroup = () => {
  const search = useSearch({
    from: ROUTE_PATHS.Organization.SettingsPage.id
  });
  const { isSubOrganization } = useOrganization();

  const tabs = [
    { name: "General", key: "tab-org-general", component: OrgGeneralTab },
    {
      name: "SSO",
      key: "sso-settings",
      component: OrgSsoTab,
      isHidden: isSubOrganization
    },
    {
      name: "Provisioning",
      key: "provisioning-settings",
      component: OrgProvisioningTab,
      isHidden: isSubOrganization
    },
    {
      name: "Security",
      key: "tab-org-security",
      component: OrgSecurityTab,
      isHidden: isSubOrganization
    },
    {
      name: "Encryption",
      key: "tab-org-encryption",
      component: OrgEncryptionTab
    },
    {
      name: "Workflow Integrations",
      key: "workflow-integrations",
      component: OrgWorkflowIntegrationTab
    },
    { name: "Audit Log Streams", key: "tag-audit-log-streams", component: AuditLogStreamsTab },
    {
      name: "External Migrations",
      key: "tab-external-migrations",
      component: ExternalMigrationsTab
    },
    {
      name: "Project Templates",
      key: "project-templates",
      component: ProjectTemplatesTab
    },
    {
      name: "Product Enforcements",
      key: "product-enforcements",
      component: OrgProductSettingsTab
    }
  ];

  const [selectedTab, setSelectedTab] = useState(search.selectedTab || tabs[0].key);

  return (
    <Tabs orientation="vertical" value={selectedTab} onValueChange={setSelectedTab}>
      <TabList>
        {tabs
          .filter((el) => !el.isHidden)
          .map((tab) => (
            <Tab variant={isSubOrganization ? "namespace" : "org"} value={tab.key} key={tab.key}>
              {tab.name}
            </Tab>
          ))}
      </TabList>
      {tabs
        .filter((el) => !el.isHidden)
        .map(({ key, component: Component }) => (
          <TabPanel value={key} key={`tab-panel-${key}`}>
            <Component />
          </TabPanel>
        ))}
    </Tabs>
  );
};
