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
import { SecretSettingsTab } from "./components/ProjectGeneralTab";
import { SecretValidationRulesTab } from "./components/SecretValidationRulesTab";
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
    { key: "tab-project-general", Component: ProjectGeneralTab },
    { key: "tab-secret-general", Component: SecretSettingsTab },
    {
      key: "tab-secret-validation-rules",
      Component: SecretValidationRulesTab
    },
    {
      key: "tab-project-encryption",
      isHidden: currentProject?.version !== ProjectVersion.V3,
      Component: EncryptionTab
    },
    { key: "tab-workflow-integrations", Component: WorkflowIntegrationTab },
    { key: "tab-project-webhooks", Component: WebhooksTab }
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
