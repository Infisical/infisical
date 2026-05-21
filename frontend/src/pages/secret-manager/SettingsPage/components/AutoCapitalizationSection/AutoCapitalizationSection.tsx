import { useTranslation } from "react-i18next";

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

export const AutoCapitalizationSection = () => {
  const { t } = useTranslation();

  const { currentProject } = useProject();
  const { mutateAsync } = useUpdateProject();

  const handleToggleCapitalizationToggle = async (state: boolean) => {
    if (!currentProject?.id) return;

    await mutateAsync({
      projectId: currentProject.id,
      autoCapitalization: state
    });

    const text = `Successfully ${state ? "enabled" : "disabled"} auto capitalization`;
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
                <FieldTitle>{t("settings.project.enforce-capitalization")}</FieldTitle>
                <FieldDescription>
                  {t("settings.project.enforce-capitalization-description")}
                </FieldDescription>
              </FieldContent>
              <Switch
                id="autoCapitalization"
                variant="project"
                checked={currentProject?.autoCapitalization ?? false}
                disabled={!isAllowed}
                onCheckedChange={(state) => {
                  handleToggleCapitalizationToggle(state);
                }}
              />
            </Field>
          )}
        </ProjectPermissionCan>
      </CardContent>
    </Card>
  );
};
