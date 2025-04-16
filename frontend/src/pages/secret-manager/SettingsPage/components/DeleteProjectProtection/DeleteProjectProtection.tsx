import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Checkbox } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useToggleDeleteProjectProtection } from "@app/hooks/api/workspace/queries";

export const DeleteProjectProtection = () => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync } = useToggleDeleteProjectProtection();

  const handleToggleDeleteProjectProtection = async (state: boolean) => {
    try {
      if (!currentWorkspace?.id) return;

      await mutateAsync({
        workspaceID: currentWorkspace.id,
        state
      });

      const text = `Successfully ${state ? "enabled" : "disabled"} delete protection`;
      createNotification({
        text,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update delete protection",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-3 text-xl font-semibold">Delete Protection</p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <div className="w-max">
            <Checkbox
              className="data-[state=checked]:bg-primary"
              id="hasDeleteProtection"
              isDisabled={!isAllowed}
              isChecked={currentWorkspace?.hasDeleteProtection ?? false}
              onCheckedChange={(state) => {
                handleToggleDeleteProjectProtection(state as boolean);
              }}
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
