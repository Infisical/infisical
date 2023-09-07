import { useTranslation } from "react-i18next";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Checkbox } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useToggleAutoCapitalization } from "@app/hooks/api";

export const AutoCapitalizationSection = () => {
  const { t } = useTranslation();
  const { createNotification } = useNotificationContext();
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync } = useToggleAutoCapitalization();

  const handleToggleCapitalizationToggle = async (state: boolean) => {
    try {
      if (!currentWorkspace?._id) return;

      await mutateAsync({
        workspaceID: currentWorkspace._id,
        state
      });

      const text = `Successfully ${state ? "enabled" : "disabled"} auto capitalization`;
      createNotification({
        text,
        type: "success"
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to update auto capitalization",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 p-4 bg-mineshaft-900 rounded-lg border border-mineshaft-600">
      <p className="mb-3 text-xl font-semibold">{t("settings.project.auto-capitalization")}</p>
      <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Settings}>
        {(isAllowed) => (
          <div className="w-max">
            <Checkbox
              className="data-[state=checked]:bg-primary"
              id="autoCapitalization"
              isDisabled={!isAllowed}
              isChecked={currentWorkspace?.autoCapitalization ?? false}
              onCheckedChange={(state) => {
                handleToggleCapitalizationToggle(state as boolean);
              }}
            >
              {t("settings.project.auto-capitalization-description")}
            </Checkbox>
          </div>
        )}
      </ProjectPermissionCan>
    </div>
  );
};
