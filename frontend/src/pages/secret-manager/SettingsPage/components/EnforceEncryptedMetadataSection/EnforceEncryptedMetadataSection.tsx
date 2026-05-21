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
      <CardContent>
        <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
          {(isAllowed) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Enforce Encrypted Metadata</FieldTitle>
                <FieldDescription>
                  When enabled, secrets in this project can only have encrypted metadata.
                  Unencrypted metadata fields will be rejected.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="enforceEncryptedMetadata"
                variant="project"
                checked={currentProject?.enforceEncryptedSecretManagerSecretMetadata ?? false}
                disabled={!isAllowed}
                onCheckedChange={(state) => {
                  handleToggle(state);
                }}
              />
            </Field>
          )}
        </ProjectPermissionCan>
      </CardContent>
    </Card>
  );
};
