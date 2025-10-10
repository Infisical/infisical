import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { useProject, useProjectPermission } from "@app/context";
import { getProjectHomePage } from "@app/helpers/project";
import { useRemoveAssumeProjectPrivilege } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";

export const AssumePrivilegeModeBanner = () => {
  const { currentProject } = useProject();
  const exitAssumePrivilegeMode = useRemoveAssumeProjectPrivilege();
  const { assumedPrivilegeDetails } = useProjectPermission();

  if (!assumedPrivilegeDetails) return null;

  return (
    <div className="border-mineshaft-600 bg-primary-400 text-mineshaft-800 z-10 -mx-4 flex items-center justify-center gap-2 rounded-sm border p-2 shadow-sm">
      <div>
        <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
        You are currently viewing the project with privileges of{" "}
        <b>
          {assumedPrivilegeDetails?.actorType === ActorType.IDENTITY ? "identity" : "user"}{" "}
          {assumedPrivilegeDetails?.actorName}
        </b>
      </div>
      <div>
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
                  const url = getProjectHomePage(currentProject.type, currentProject.environments);
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
