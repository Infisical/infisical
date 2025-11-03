import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Checkbox } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";

export const DeleteProjectProtection = () => {
  const { projectId, currentProject } = useProject();

  const { mutateAsync } = useUpdateProject();

  const handleToggleDeleteProjectProtection = async (state: boolean) => {
    await mutateAsync({
      projectId,
      hasDeleteProtection: state
    });

    const text = `Successfully ${state ? "enabled" : "disabled"} delete protection`;
    createNotification({
      text,
      type: "success"
    });
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-3 text-xl font-medium">Delete Protection</p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <div>
            <Checkbox
              id="hasDeleteProtection"
              isDisabled={!isAllowed}
              isChecked={currentProject?.hasDeleteProtection ?? false}
              onCheckedChange={(state) => {
                handleToggleDeleteProjectProtection(state as boolean);
              }}
              allowMultilineLabel
            >
              Protects the project from being deleted accidentally. While this option is enabled,
              you can&apos;t delete the project.
            </Checkbox>
          </div>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
