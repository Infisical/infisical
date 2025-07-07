import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { ProjectVersion } from "@app/hooks/api/workspace/types";

import { EncryptionTab } from "./components/EncryptionTab";
import { ProjectGeneralTab } from "./components/ProjectGeneralTab";
import { WebhooksTab } from "./components/WebhooksTab";
import { WorkflowIntegrationTab } from "./components/WorkflowIntegrationSection";

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const tabs = [
    { name: "General", key: "tab-project-general", Component: ProjectGeneralTab },
    {
      name: "Encryption",
      key: "tab-project-encryption",
      isHidden: currentWorkspace?.version !== ProjectVersion.V3,
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
      <div className="w-full max-w-7xl">
        <PageHeader
          title="Settings"
          description="Configure your secret manager's encryption, environments, webhooks and other configurations."
        />
        <Tabs defaultValue={tabs[0].key}>
          <TabList>
            {tabs
              .filter((el) => !el.isHidden)
              .map((tab) => (
                <Tab value={tab.key} key={tab.key}>
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
