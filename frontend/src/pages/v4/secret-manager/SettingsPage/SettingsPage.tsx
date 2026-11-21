import { useSearch } from "@tanstack/react-router";

import { ProjectVersion } from "@app/hooks/api/projects/types";

import { useProjectScope } from "../../access/project/scope";
import { useV4Adapter } from "../../data/adapters";
import { orgHref } from "../../links";
import { ProjectGeneralSettings } from "../../project/SettingsPage/general";
import { ProjectSettingsLayout, type ProjectSettingsTab } from "../../project/SettingsPage/layout";
import { EncryptionSettings } from "./encryption";
import { EnvironmentsSettings } from "./environments";
import { PoliciesSettings } from "./policies";
import { TagsSettings } from "./tags";
import { WebhooksSettings } from "./webhooks";
import { WorkflowIntegrationsSettings } from "./workflow-integrations";

export const SettingsPage = () => {
  const { selectedTab } = useSearch({
    from: "/v4/organizations/$orgId/projects/secret-management/$projectId/settings"
  });
  const { orgId, projectId } = useProjectScope();
  const { data: project } = useV4Adapter("projectSettings").useProject(projectId);
  const tabs: ProjectSettingsTab[] = [
    { key: "tab-project-general", name: "General", Body: ProjectGeneralSettings },
    { key: "tab-secret-environments", name: "Environments", Body: EnvironmentsSettings },
    { key: "tab-secret-tags", name: "Tags", Body: TagsSettings },
    { key: "tab-secret-policies", name: "Policies", Body: PoliciesSettings },
    {
      key: "tab-project-encryption",
      name: "Encryption",
      hidden: project?.version !== ProjectVersion.V3,
      Body: EncryptionSettings
    },
    {
      key: "tab-workflow-integrations",
      name: "Workflow integrations",
      description:
        "Send access request, secret approval and secret sync error notifications to Slack or Microsoft Teams.",
      Body: WorkflowIntegrationsSettings
    },
    { key: "tab-project-webhooks", name: "Webhooks", Body: WebhooksSettings }
  ];
  return (
    <ProjectSettingsLayout
      tabs={tabs}
      selectedTab={selectedTab}
      generalHref={orgHref(orgId, `/projects/secret-management/${projectId}/settings`)}
    />
  );
};
