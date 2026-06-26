import { useTranslation } from "react-i18next";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  Switch
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useUpdateProject } from "@app/hooks/api";

export const PreferencesSection = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { mutateAsync } = useUpdateProject();

  const notify = (state: boolean, label: string) =>
    createNotification({
      text: `Successfully ${state ? "enabled" : "disabled"} ${label}`,
      type: "success"
    });

  const handleToggleAutoCapitalization = async (state: boolean) => {
    if (!currentProject?.id) return;
    await mutateAsync({ projectId: currentProject.id, autoCapitalization: state });
    notify(state, "auto capitalization");
  };

  const handleToggleEnforceEncryptedMetadata = async (state: boolean) => {
    if (!currentProject?.id) return;
    await mutateAsync({
      projectId: currentProject.id,
      enforceEncryptedSecretManagerSecretMetadata: state
    });
    notify(state, "enforced encrypted metadata");
  };

  const handleToggleSecretSharing = async (state: boolean) => {
    if (!currentProject?.id) return;
    await mutateAsync({ projectId: currentProject.id, secretSharing: state });
    notify(state, "secret sharing for this project");
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>
          Choose how secrets are formatted, stored, and shared in this project.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>{t("settings.project.enforce-capitalization")}</FieldTitle>
              <FieldDescription>
                {t("settings.project.enforce-capitalization-description")}
              </FieldDescription>
            </FieldContent>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Settings}
            >
              {(isAllowed) => (
                <Switch
                  id="autoCapitalization"
                  variant="project"
                  checked={currentProject?.autoCapitalization ?? false}
                  disabled={!isAllowed}
                  onCheckedChange={handleToggleAutoCapitalization}
                />
              )}
            </ProjectPermissionCan>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Enforce Encrypted Metadata</FieldTitle>
              <FieldDescription>
                When enabled, secrets in this project can only have encrypted metadata. Unencrypted
                metadata fields will be rejected.
              </FieldDescription>
            </FieldContent>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Settings}
            >
              {(isAllowed) => (
                <Switch
                  id="enforceEncryptedMetadata"
                  variant="project"
                  checked={currentProject?.enforceEncryptedSecretManagerSecretMetadata ?? false}
                  disabled={!isAllowed}
                  onCheckedChange={handleToggleEnforceEncryptedMetadata}
                />
              )}
            </ProjectPermissionCan>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Allow Secret Sharing</FieldTitle>
              <FieldDescription>
                Let project members securely share secrets with each other.
              </FieldDescription>
            </FieldContent>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Settings}
            >
              {(isAllowed) => (
                <Switch
                  id="secretSharing"
                  variant="project"
                  checked={currentProject?.secretSharing ?? true}
                  disabled={!isAllowed}
                  onCheckedChange={handleToggleSecretSharing}
                />
              )}
            </ProjectPermissionCan>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};
