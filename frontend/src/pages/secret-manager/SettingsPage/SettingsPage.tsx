import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

import { EncryptionTab } from "./components/EncryptionTab";
import { SecretSettingsTab } from "./components/ProjectGeneralTab";
import { WebhooksTab } from "./components/WebhooksTab";
import { WorkflowIntegrationTab } from "./components/WorkflowIntegrationSection";

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { isSubOrganization } = useOrganization();

  const { currentProject } = useProject();
  const tabs = [
    { name: "General", key: "tab-project-general", Component: ProjectGeneralTab },
    { name: "Secrets Management", key: "tab-secret-general", Component: SecretSettingsTab },
    {
      name: "Encryption",
      key: "tab-project-encryption",
      isHidden: currentProject?.version !== ProjectVersion.V3,
      Component: EncryptionTab
    },
    {
      name: "Workflow Integrations",
      key: "tab-workflow-integrations",
      Component: WorkflowIntegrationTab
    },
    {
      name: "Webhooks",
      key: "tab-project-webhooks",
      Component: WebhooksTab
    }
  ];

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.SecretManager}
          title="Project Settings"
          description="Configure your secret manager's encryption, environments, webhooks and other configurations."
        >
          <Link
            to="/organizations/$orgId/settings"
            params={{
              orgId: currentProject.orgId
            }}
            className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
          >
            <InfoIcon size={12} /> Looking for {isSubOrganization ? "sub-" : ""}organization
            settings?
          </Link>
        </PageHeader>
        <Tabs orientation="vertical" defaultValue={tabs[0].key}>
          <TabList>
            {tabs
              .filter((el) => !el.isHidden)
              .map((tab) => (
                <Tab variant="project" value={tab.key} key={tab.key}>
                  {tab.name}
                </Tab>
              ))}
          </TabList>
          {tabs
            .filter((el) => !el.isHidden)
            .map(({ key, Component }) => (
              <TabPanel value={key} key={key}>
                <Component />
              </TabPanel>
            ))}
        </Tabs>
      </div>
    </div>
  );
};
