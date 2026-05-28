import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch
} from "@app/components/v3";
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
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Show Secret Snapshots (legacy)</CardTitle>
        <CardDescription>
          This feature enables your project members to view secret snapshots in the legacy format.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
            {(isAllowed) => (
              <Switch
                id="showSnapshotsLegacy"
                variant="project"
                checked={currentProject?.showSnapshotsLegacy ?? false}
                disabled={!isAllowed || isLoading}
                onCheckedChange={(state) => handleToggle(state)}
              />
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
    </Card>
  );
};
