import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Input } from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import { useToggle } from "@app/hooks";
import { useDeleteWorkspace } from "@app/hooks/api";

export const DeleteProjectSection = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { createNotification } = useNotificationContext();
  const { currentWorkspace } = useWorkspace();
  const { currentOrg } = useOrganization();
  const [isDeleting, setIsDeleting] = useToggle();
  const [deleteProjectInput, setDeleteProjectInput] = useState("");
  const deleteWorkspace = useDeleteWorkspace();

  const onDeleteWorkspace = async () => {
    setIsDeleting.on();
    try {
      if (!currentWorkspace?._id) return;
      await deleteWorkspace.mutateAsync({
        workspaceID: currentWorkspace?._id
      });
      // redirect user to the org overview
      router.push(`/org/${currentOrg?._id}/overview`);

      createNotification({
        text: "Successfully deleted workspace",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to delete workspace",
        type: "error"
      });
    } finally {
      setIsDeleting.off();
    }
  };

  return (
    <div className="mb-6 p-4 bg-mineshaft-900 rounded-lg border border-red">
      <p className="mb-3 text-xl font-semibold text-red">{t("settings.project.danger-zone")}</p>
      <p className="text-gray-400 mb-8">{t("settings.project.danger-zone-note")}</p>
      <div className="mr-auto mt-4 max-h-28 w-full max-w-md">
        <FormControl
          label={
            <div className="mb-0.5 text-sm font-normal text-gray-400">
              Type <span className="font-bold">{currentWorkspace?.name}</span> to delete the
              workspace
            </div>
          }
        >
          <Input
            onChange={(e) => setDeleteProjectInput(e.target.value)}
            value={deleteProjectInput}
            placeholder="Type the project name to delete"
            className="bg-mineshaft-800"
          />
        </FormControl>
      </div>
      <Button
        colorSchema="danger"
        onClick={onDeleteWorkspace}
        isDisabled={deleteProjectInput !== currentWorkspace?.name || isDeleting}
        isLoading={isDeleting}
      >
        {t("settings.project.delete-project")}
      </Button>
      <p className="mt-3 ml-0.5 text-xs text-gray-500">
        {t("settings.project.delete-project-note")}
      </p>
    </div>
  );
};
