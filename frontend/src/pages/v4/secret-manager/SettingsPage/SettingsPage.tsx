import { useSearch } from "@tanstack/react-router";

import { ProjectVersion } from "@app/hooks/api/projects/types";

import { useProjectScope } from "../../access/project/scope";
import { useV4Adapter } from "../../data/adapters";
import { orgHref } from "../../links";
import { ProjectGeneralSettings } from "../../project/SettingsPage/general";
import { ProjectSettingsLayout, type ProjectSettingsTab } from "../../project/SettingsPage/layout";

export const SettingsPage = () => {
  const { selectedTab } = useSearch({
    from: "/v4/organizations/$orgId/projects/secret-management/$projectId/settings"
  });
  const { orgId, projectId } = useProjectScope();
  const { data: project } = useV4Adapter("projectSettings").useProject(projectId);
  const tabs: ProjectSettingsTab[] = [
    { key: "tab-project-general", name: "General", Body: ProjectGeneralSettings },
    { key: "tab-secret-environments", name: "Environments" },
    { key: "tab-secret-tags", name: "Tags" },
    { key: "tab-secret-policies", name: "Policies" },
    {
      key: "tab-project-encryption",
      name: "Encryption",
      hidden: project?.version !== ProjectVersion.V3
    },
    { key: "tab-workflow-integrations", name: "Workflow integrations" },
    { key: "tab-project-webhooks", name: "Webhooks" }
  ];
  return (
    <ProjectSettingsLayout
      tabs={tabs}
      selectedTab={selectedTab}
      generalHref={orgHref(orgId, `/projects/secret-management/${projectId}/settings`)}
    />
  );
};
