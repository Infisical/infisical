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
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Enforce Encrypted Metadata</CardTitle>
        <CardDescription>
          When enabled, secrets in this project can only have encrypted metadata. Unencrypted
          metadata fields will be rejected.
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
            {(isAllowed) => (
              <Switch
                id="enforceEncryptedMetadata"
                variant="project"
                checked={currentProject?.enforceEncryptedSecretManagerSecretMetadata ?? false}
                disabled={!isAllowed}
                onCheckedChange={(state) => {
                  handleToggle(state);
                }}
              />
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
    </Card>
  );
};
