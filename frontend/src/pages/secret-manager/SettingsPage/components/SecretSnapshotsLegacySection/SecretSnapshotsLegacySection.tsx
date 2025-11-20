import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Checkbox } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useUpdateProject } from "@app/hooks/api/projects/queries";

export const SecretSnapshotsLegacySection = () => {
  const { currentProject } = useProject();
  const { mutateAsync: updateProject } = useUpdateProject();

  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (state: boolean) => {
    setIsLoading(true);

    try {
      if (!currentProject?.id) {
        setIsLoading(false);
        return;
      }

      await updateProject({
        projectId: currentProject.id,
        showSnapshotsLegacy: state
      });

      createNotification({
        text: `Successfully ${state ? "enabled" : "disabled"} secret snapshots legacy for this project`,
        type: "success"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-3 text-xl font-medium">Show Secret Snapshots ( legacy )</p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <div>
            <Checkbox
              id="showSnapshotsLegacy"
              isDisabled={!isAllowed || isLoading}
              isChecked={currentProject?.showSnapshotsLegacy ?? false}
              onCheckedChange={(state) => handleToggle(state as boolean)}
              allowMultilineLabel
            >
              This feature enables your project members to view secret snapshots in the legacy
              format.
            </Checkbox>
          </div>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
