import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Checkbox } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useUpdateProject } from "@app/hooks/api/workspace/queries";

export const SecretSharingSection = () => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync: updateProject } = useUpdateProject();

  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (state: boolean) => {
    setIsLoading(true);

    try {
      if (!currentWorkspace?.id) {
        setIsLoading(false);
        return;
      }

      await updateProject({
        projectID: currentWorkspace.id,
        secretSharing: state
      });

      createNotification({
        text: `Successfully ${state ? "enabled" : "disabled"} secret sharing for this project`,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update secret sharing for this project",
        type: "error"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-3 text-xl font-semibold">Allow Secret Sharing</p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <div className="w-max">
            <Checkbox
              id="secretSharing"
              isDisabled={!isAllowed || isLoading}
              isChecked={currentWorkspace?.secretSharing ?? true}
              onCheckedChange={(state) => handleToggle(state as boolean)}
            >
              This feature enables your project members to securely share secrets.
            </Checkbox>
          </div>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
