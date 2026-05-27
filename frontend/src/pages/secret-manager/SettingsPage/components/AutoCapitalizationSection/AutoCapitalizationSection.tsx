import { useTranslation } from "react-i18next";

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
      <CardHeader>
        <CardTitle>{t("settings.project.enforce-capitalization")}</CardTitle>
        <CardDescription>
          {t("settings.project.enforce-capitalization-description")}
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
            {(isAllowed) => (
              <Switch
                id="autoCapitalization"
                variant="project"
                checked={currentProject?.autoCapitalization ?? false}
                disabled={!isAllowed}
                onCheckedChange={(state) => {
                  handleToggleCapitalizationToggle(state);
                }}
              />
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
    </Card>
  );
};
