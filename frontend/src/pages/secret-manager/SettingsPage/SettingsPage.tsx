import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { ProjectType, ProjectVersion } from "@app/hooks/api/projects/types";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

import { EncryptionTab } from "./components/EncryptionTab";
import { EnvironmentsTab } from "./components/EnvironmentsTab";
import { PoliciesTab } from "./components/PoliciesTab";
import { TagsTab } from "./components/TagsTab";
import { WebhooksTab } from "./components/WebhooksTab";
import { WorkflowIntegrationTab } from "./components/WorkflowIntegrationSection";

export const SettingsPage = () => {
  const { t } = useTranslation();
  const { isSubOrganization } = useOrganization();
  const { currentProject } = useProject();

  const { selectedTab } = useSearch({
    from: ROUTE_PATHS.SecretManager.SettingsPage.id
  });

  const tabs = [
    {
      name: "General",
      description: "Manage your project's name, audit log retention, and delete protection.",
      key: "tab-project-general",
      Component: ProjectGeneralTab
    },
    {
      name: "Environments",
      description:
        "Define the environments your secrets live in, such as development, staging, and production.",
      key: "tab-secret-environments",
      Component: EnvironmentsTab
    },
    {
      name: "Tags",
      description: "Organize secrets with tags to make them easier to find and govern.",
      key: "tab-secret-tags",
      Component: TagsTab
    },
    {
      name: "Policies",
      description:
        "Configure validation rules, retention, sharing, and other behaviors that govern this project's secrets.",
      key: "tab-secret-policies",
      Component: PoliciesTab
    },
    {
      name: "Encryption",
      description: "Choose the Key Management System used to encrypt this project's data.",
      key: "tab-project-encryption",
      isHidden: currentProject?.version !== ProjectVersion.V3,
      Component: EncryptionTab
    },
    {
      name: "Workflow Integrations",
      description: "Connect Slack and Microsoft Teams for approval and notification workflows.",
      key: "tab-workflow-integrations",
      Component: WorkflowIntegrationTab
    },
    {
      name: "Webhooks",
      description: "Manage webhooks that notify external services when your secrets change.",
      key: "tab-project-webhooks",
      Component: WebhooksTab
    }
  ];

  const activeTab = tabs.find((tab) => !tab.isHidden && tab.key === selectedTab);
  const baseTitle = t("settings.project.title");
  const pageTitle = activeTab ? `${activeTab.name} - ${baseTitle}` : baseTitle;

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: pageTitle })}</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.SecretManager}
          title={activeTab?.name ?? baseTitle}
          description={activeTab?.description}
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
        <Tabs orientation="vertical" value={selectedTab}>
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
