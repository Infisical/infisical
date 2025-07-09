import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { useProjectPermission, useWorkspace } from "@app/context";
import { getCurrentProductFromUrl, getProjectHomePage } from "@app/helpers/project";
import { useRemoveAssumeProjectPrivilege } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { ProjectType } from "@app/hooks/api/workspace/types";

export const AssumePrivilegeModeBanner = () => {
  const { currentWorkspace } = useWorkspace();
  const exitAssumePrivilegeMode = useRemoveAssumeProjectPrivilege();
  const { assumedPrivilegeDetails } = useProjectPermission();

  if (!assumedPrivilegeDetails) return null;

  return (
    <div className="z-10 -mx-4 flex items-center justify-center gap-2 rounded border border-mineshaft-600 bg-primary-400 p-2 text-mineshaft-800 shadow">
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
                projectId: currentWorkspace.id
              },
              {
                onSuccess: () => {
                  const url = getProjectHomePage(
                    getCurrentProductFromUrl(window.location.href) || ProjectType.SecretManager
                  );

                  window.location.href = url.replace("$projectId", currentWorkspace.id);
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
