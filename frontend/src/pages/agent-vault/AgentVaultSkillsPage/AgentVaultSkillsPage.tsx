import { BookOpenTextIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { AccessRestrictedDialog, PageHeader } from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { canManageAgentVaultSkills } from "@app/helpers/agentVaultPermissions";
import { ProjectType } from "@app/hooks/api/projects/types";

import { SkillsCard } from "./components/SkillsCard";

export const AgentVaultSkillsPage = () => {
  const { permission } = useProjectPermission();

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title="Skills" />

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={BookOpenTextIcon}
        title="Skills"
        description="Keep the instructions agents follow and deliver them through access bundles."
      />
      {canManageAgentVaultSkills(permission) ? <SkillsCard /> : <AccessRestrictedDialog />}
    </div>
  );
};
