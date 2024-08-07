import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useDeleteAlert } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { AlertModal } from "./AlertModal";
import { AlertsTable } from "./AlertsTable";

export const AlertsSection = () => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { mutateAsync: deleteAlert } = useDeleteAlert();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "alert",
    "deleteAlert"
  ] as const);

  const onRemoveAlertSubmit = async (alertId: string) => {
    try {
      if (!projectId) return;

      await deleteAlert({
        alertId,
        projectId
      });

      await createNotification({
        text: "Successfully deleted alert",
        type: "success"
      });

      handlePopUpClose("deleteAlert");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete alert",
        type: "error"
      });
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex justify-between">
        <p className="text-xl font-semibold text-mineshaft-100">Alerts</p>
        <ProjectPermissionCan I={ProjectPermissionActions.Create} a={ProjectPermissionSub.Alerts}>
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("alert")}
              isDisabled={!isAllowed}
            >
              Create Alert
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <AlertsTable handlePopUpOpen={handlePopUpOpen} />
      <AlertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deleteAlert.isOpen}
        title={`Are you sure want to remove the alert ${
          (popUp?.deleteAlert?.data as { name: string })?.name || ""
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deleteAlert", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveAlertSubmit((popUp?.deleteAlert?.data as { alertId: string })?.alertId)
        }
      />
    </div>
  );
};
