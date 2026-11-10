import { useSearch } from "@tanstack/react-router";

import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useProjectScope } from "../../access/project/scope";
import { useV4Adapter } from "../../data/adapters";
import { orgHref } from "../../links";
import { ProjectGeneralSettings } from "../../project/SettingsPage/general";
import { ProjectSettingsLayout } from "../../project/SettingsPage/layout";
import { SessionLogsTab } from "./session-logs/session-logs";

const AgentVaultGeneral = () => <ProjectGeneralSettings adminOnlyDanger />;

export const AgentVaultSettingsPage = () => {
  const { selectedTab } = useSearch({
    from: "/v4/organizations/$orgId/projects/agent-vault/$projectId/settings"
  });
  const { orgId, projectId } = useProjectScope();
  const { data } = useV4Adapter("access").useProjectPermission({ projectId });
  const isAdmin = (data?.memberships ?? []).some((membership) =>
    membership.roles.some((role) => role.role === ProjectMembershipRole.Admin)
  );
  return (
    <ProjectSettingsLayout
      tabs={[
        { key: "tab-project-general", name: "General", Body: AgentVaultGeneral },
        {
          key: "tab-session-logs",
          name: "Session logs",
          description: "Record your agents' requests and choose where the logs are stored.",
          hidden: !isAdmin,
          Body: SessionLogsTab
        }
      ]}
      selectedTab={selectedTab}
      generalHref={orgHref(orgId, `/projects/agent-vault/${projectId}/settings`)}
    />
  );
};
