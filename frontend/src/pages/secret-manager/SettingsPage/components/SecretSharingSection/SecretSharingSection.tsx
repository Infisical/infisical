import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Card,
  CardContent,
  Field,
  FieldContent,
  FieldDescription,
  FieldTitle,
  Switch
} from "@app/components/v3";
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
    <Card className="mb-6">
      <CardContent>
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
          {(isAllowed) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Allow Secret Sharing</FieldTitle>
                <FieldDescription>
                  This feature enables your project members to securely share secrets.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="secretSharing"
                variant="project"
                checked={currentProject?.secretSharing ?? true}
                disabled={!isAllowed || isLoading}
                onCheckedChange={(state) => handleToggle(state)}
              />
            </Field>
          )}
        </ProjectPermissionCan>
      </CardContent>
    </Card>
  );
};
