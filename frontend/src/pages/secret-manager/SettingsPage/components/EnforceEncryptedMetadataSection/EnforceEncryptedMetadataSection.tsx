import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Checkbox } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";

export const EnforceEncryptedMetadataSection = () => {
  const { currentProject } = useProject();
  const { mutateAsync } = useUpdateProject();

  const handleToggle = async (state: boolean) => {
    if (!currentProject?.id) return;

    await mutateAsync({
      projectId: currentProject.id,
      enforceEncryptedSecretManagerSecretMetadata: state
    });

    const text = `Successfully ${state ? "enabled" : "disabled"} enforced encrypted metadata`;
    createNotification({
      text,
      type: "success"
    });
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <p className="mb-3 text-xl font-medium">Enforce Encrypted Metadata</p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <div>
            <Checkbox
              id="enforceEncryptedMetadata"
              isDisabled={!isAllowed}
              isChecked={currentProject?.enforceEncryptedSecretManagerSecretMetadata ?? false}
              onCheckedChange={(state) => {
                handleToggle(state as boolean);
              }}
              allowMultilineLabel
            >
              When enabled, secrets in this project can only have encrypted metadata. Unencrypted
              metadata fields will be rejected.
            </Checkbox>
          </div>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
