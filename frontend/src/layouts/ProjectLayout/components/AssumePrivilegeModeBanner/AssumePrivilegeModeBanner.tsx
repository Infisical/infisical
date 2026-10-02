import { Info } from "lucide-react";

import { Button } from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import { useRemoveAssumeProjectPrivilege } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";

export const AssumePrivilegeModeBanner = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const exitAssumePrivilegeMode = useRemoveAssumeProjectPrivilege();
  const { assumedPrivilegeDetails } = useProjectPermission();

  if (!assumedPrivilegeDetails) return null;

  return (
    <div className="flex w-full shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-l-2 border-info/20 border-l-info bg-info/5 px-4 py-2 text-foreground">
      <Info className="mt-1 size-4 shrink-0 self-start text-info" />
      <div className="min-w-0 flex-1 basis-64">
        <div className="mb-0.5 text-xs font-medium text-info">Assumed privileges</div>
        <span className="min-w-0 text-sm [overflow-wrap:anywhere]">
          You are currently viewing the project with privileges of{" "}
          <b>
            {assumedPrivilegeDetails.actorType === ActorType.IDENTITY ? "identity" : "user"}{" "}
            {assumedPrivilegeDetails.actorName || assumedPrivilegeDetails.actorEmail}
          </b>
        </span>
      </div>
      <Button
        size="xs"
        variant="outline"
        className="shrink-0"
        isPending={exitAssumePrivilegeMode.isPending}
        isDisabled={exitAssumePrivilegeMode.isPending}
        onClick={() => {
          exitAssumePrivilegeMode.mutate(
            {
              projectId: currentProject.id
            },
            {
              onSuccess: () => {
                const url = getProjectHomePage(currentProject.type, currentProject.environments);
                window.location.assign(
                  url.replace("$orgId", currentOrg.id).replace("$projectId", currentProject.id)
                );
              }
            }
          );
        }}
      >
        Click to exit
      </Button>
    </div>
  );
};
