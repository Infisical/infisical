import { BookOpenTextIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { AccessRestrictedDialog, PageHeader } from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { SkillsCard } from "./components/SkillsCard";

export const AgentVaultSkillsPage = () => {
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title="Skills" />

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={BookOpenTextIcon}
        title="Skills"
        description="Keep the instructions agents follow and deliver them through access bundles."
      />
      {isAdmin ? <SkillsCard /> : <AccessRestrictedDialog />}
    </div>
  );
};
