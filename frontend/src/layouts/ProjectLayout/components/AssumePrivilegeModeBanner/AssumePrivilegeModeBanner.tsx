import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import { useRemoveAssumeProjectPrivilege } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";

export const AssumePrivilegeModeBanner = () => {
  const { isSubOrganization, currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const exitAssumePrivilegeMode = useRemoveAssumeProjectPrivilege();
  const { assumedPrivilegeDetails } = useProjectPermission();

  if (!assumedPrivilegeDetails) return null;

  return (
    <div className="flex w-full items-center border-b border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
      <div>
        <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
        You are currently viewing the project with privileges of{" "}
        <b>
          {assumedPrivilegeDetails?.actorType === ActorType.IDENTITY ? "identity" : "user"}{" "}
          {assumedPrivilegeDetails?.actorName}
        </b>
      </div>
      <div className="ml-auto">
        <Button
          size="xs"
          variant="outline_bg"
          className="hover:bg-mineshaft-500"
          onClick={() => {
            exitAssumePrivilegeMode.mutate(
              {
                projectId: currentProject.id
              },
              {
                onSuccess: () => {
                  const url = `${getProjectHomePage(currentProject.type, currentProject.environments)}${isSubOrganization ? `?subOrganization=${currentOrg.slug}` : ""}`;
                  window.location.href = url.replace("$projectId", currentProject.id);
                }
              }
            );
          }}
        >
          Click to exit
        </Button>
      </div>
    </div>
  );
};
