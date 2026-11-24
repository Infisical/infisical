import { WebhookIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { AccessRestrictedDialog, PageHeader } from "@app/components/v3";
import {
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { HooksCard } from "./components/HooksCard";

export const AgentVaultHooksPage = () => {
  const { permission } = useProjectPermission();
  const canRead = permission.can(
    ProjectPermissionAgentVaultHookActions.Read,
    ProjectPermissionSub.AgentVaultHooks
  );

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title="Hooks" />

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={WebhookIcon}
        title="Hooks"
        description="Let a server of yours allow or refuse what a session's agent sends."
      />
      {canRead ? <HooksCard /> : <AccessRestrictedDialog />}
    </div>
  );
};
