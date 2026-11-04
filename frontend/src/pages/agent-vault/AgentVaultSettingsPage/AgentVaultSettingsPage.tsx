import { SettingsIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { AccessRestrictedDialog, PageHeader } from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { SessionLogAlerts } from "./components/SessionLogAlerts";
import { SessionLogSection } from "./components/SessionLogSection";

export const AgentVaultSettingsPage = () => {
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title="Settings" />

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={SettingsIcon}
        title="Settings"
        description="Configure session logs and the connections Agent Vault uses."
      />
      {isAdmin ? (
        <div className="flex flex-col gap-8">
          <SessionLogAlerts />
          <SessionLogSection />
        </div>
      ) : (
        <AccessRestrictedDialog />
      )}
    </div>
  );
};
