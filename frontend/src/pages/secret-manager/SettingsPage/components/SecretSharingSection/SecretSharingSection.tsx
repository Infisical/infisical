import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Checkbox } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useUpdateProject } from "@app/hooks/api/projects/queries";

export const SecretSharingSection = () => {
  const { currentProject } = useProject();
  const { mutateAsync: updateProject } = useUpdateProject();

  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (state: boolean) => {
    setIsLoading(true);

    if (!currentProject?.id) {
      setIsLoading(false);
      return;
    }

    try {
      await updateProject({
        projectId: currentProject.id,
        secretSharing: state
      });

      createNotification({
        text: `Successfully ${state ? "enabled" : "disabled"} secret sharing for this project`,
        type: "success"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-3 text-xl font-medium">Allow Secret Sharing</p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <div>
            <Checkbox
              id="secretSharing"
              isDisabled={!isAllowed || isLoading}
              isChecked={currentProject?.secretSharing ?? true}
              onCheckedChange={(state) => handleToggle(state as boolean)}
              allowMultilineLabel
            >
              This feature enables your project members to securely share secrets.
            </Checkbox>
          </div>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
