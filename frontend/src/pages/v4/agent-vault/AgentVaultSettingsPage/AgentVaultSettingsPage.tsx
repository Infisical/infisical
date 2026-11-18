import { useSearch } from "@tanstack/react-router";

import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { useProjectPermission } from "../../access/permissions";
import { useProjectScope } from "../../access/project/scope";
import { orgHref } from "../../links";
import { ProjectGeneralSettings } from "../../project/SettingsPage/general";
import { ProjectSettingsLayout } from "../../project/SettingsPage/layout";
import { SessionLogsTab } from "./session-logs/session-logs";

const AgentVaultGeneral = () => <ProjectGeneralSettings dangerNeedsDeletePermission />;

export const AgentVaultSettingsPage = () => {
  const { selectedTab } = useSearch({
    from: "/v4/organizations/$orgId/projects/agent-vault/$projectId/settings"
  });
  const { orgId, projectId } = useProjectScope();
  const { permission } = useProjectPermission(projectId);
  const canReadSessionLogSettings = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Settings
  );
  return (
    <ProjectSettingsLayout
      tabs={[
        { key: "tab-project-general", name: "General", Body: AgentVaultGeneral },
        {
          key: "tab-session-logs",
          name: "Session logs",
          description: "Record your agents' requests and choose where the logs are stored.",
          hidden: !canReadSessionLogSettings,
          Body: SessionLogsTab
        }
      ]}
      selectedTab={selectedTab}
      generalHref={orgHref(orgId, `/projects/agent-vault/${projectId}/settings`)}
    />
  );
};
