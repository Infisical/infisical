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
    <div className="flex w-full items-center border-b border-info/20 bg-info/5 px-4 py-2 text-sm text-foreground">
      <Info className="mr-2.5 size-4 text-info" />
      You are currently viewing the project with privileges of&nbsp;
      <b>
        {assumedPrivilegeDetails.actorType === ActorType.IDENTITY ? "identity" : "user"}{" "}
        {assumedPrivilegeDetails.actorName || assumedPrivilegeDetails.actorEmail}
      </b>
      <Button
        size="xs"
        variant="outline"
        className="ml-auto"
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
