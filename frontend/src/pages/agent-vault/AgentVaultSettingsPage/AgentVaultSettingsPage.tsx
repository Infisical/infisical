import { useSearch } from "@tanstack/react-router";
import { ScrollTextIcon, SettingsIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectOverviewChangeSection } from "@app/components/project/ProjectOverviewChangeSection";
import { PageHeader } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { DeleteProjectSection } from "@app/pages/project/SettingsPage/components/DeleteProjectSection";

import { SessionLogAlerts } from "./components/SessionLogAlerts";
import { SessionLogSection } from "./components/SessionLogSection";

const SESSION_LOGS_TAB = "tab-session-logs";

export const AgentVaultSettingsPage = () => {
  const { permission } = useProjectPermission();
  const canReadSessionLogSettings = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Settings
  );
  const canEditProject = permission.can(
    ProjectPermissionActions.Edit,
    ProjectPermissionSub.Project
  );
  const canDeleteProject = permission.can(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Project
  );
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/agent-vault/$projectId/_agent-vault-layout/settings"
  });

  const isSessionLogsTab = canReadSessionLogSettings && selectedTab === SESSION_LOGS_TAB;
  let description = "View this project's name and ID.";
  if (isSessionLogsTab)
    description = "Record your agents' requests, and choose where the logs are stored.";
  else if (canEditProject)
    description = "Manage this project's name, delete protection, and deletion.";

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title={isSessionLogsTab ? "Session Logs - Settings" : "General - Settings"} />

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={isSessionLogsTab ? ScrollTextIcon : SettingsIcon}
        title={isSessionLogsTab ? "Session Logs" : "General"}
        description={description}
      />
      {isSessionLogsTab ? (
        <div className="flex flex-col gap-8">
          <SessionLogAlerts />
          <SessionLogSection />
        </div>
      ) : (
        <>
          <ProjectOverviewChangeSection />
          {canDeleteProject && <DeleteProjectSection />}
        </>
      )}
    </div>
  );
};
