import { useState } from "react";
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

type ToggleKey = "autoCapitalization" | "enforceEncryptedMetadata" | "secretSharing";

export const PreferencesSection = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { mutateAsync } = useUpdateProject();
  const [pending, setPending] = useState<Record<ToggleKey, boolean>>({
    autoCapitalization: false,
    enforceEncryptedMetadata: false,
    secretSharing: false
  });

  const isPending = (key: ToggleKey) => pending[key];

  const runToggle = async (
    key: ToggleKey,
    state: boolean,
    successLabel: string,
    mutation: () => Promise<unknown>
  ) => {
    if (!currentProject?.id || pending[key]) return;
    setPending((prev) => ({ ...prev, [key]: true }));
    try {
      await mutation();
      createNotification({
        text: `Successfully ${state ? "enabled" : "disabled"} ${successLabel}`,
        type: "success"
      });
    } finally {
      setPending((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleToggleAutoCapitalization = (state: boolean) =>
    runToggle("autoCapitalization", state, "auto capitalization", () =>
      mutateAsync({ projectId: currentProject!.id, autoCapitalization: state })
    );

  const handleToggleEnforceEncryptedMetadata = (state: boolean) =>
    runToggle("enforceEncryptedMetadata", state, "enforced encrypted metadata", () =>
      mutateAsync({
        projectId: currentProject!.id,
        enforceEncryptedSecretManagerSecretMetadata: state
      })
    );

  const handleToggleSecretSharing = (state: boolean) =>
    runToggle("secretSharing", state, "secret sharing for this project", () =>
      mutateAsync({ projectId: currentProject!.id, secretSharing: state })
    );

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
                  disabled={!isAllowed || isPending("autoCapitalization")}
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
                  disabled={!isAllowed || isPending("enforceEncryptedMetadata")}
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
                  disabled={!isAllowed || isPending("secretSharing")}
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
