import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useDeletePkiAlert } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiAlertModal } from "./PkiAlertModal";
import { PkiAlertsTable } from "./PkiAlertsTable";

export const PkiAlertsSection = () => {
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";
  const { mutateAsync: deletePkiAlert } = useDeletePkiAlert();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiAlert",
    "deletePkiAlert"
  ] as const);

  const onRemoveAlertSubmit = async (alertId: string) => {
    try {
      if (!projectId) return;

      await deletePkiAlert({
        alertId,
        projectId
      });

      createNotification({
        text: "Successfully deleted alert",
        type: "success"
      });

      handlePopUpClose("deletePkiAlert");
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
        <ProjectPermissionCan
          I={ProjectPermissionActions.Create}
          a={ProjectPermissionSub.PkiAlerts}
        >
          {(isAllowed) => (
            <Button
              colorSchema="primary"
              type="submit"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("pkiAlert")}
              isDisabled={!isAllowed}
            >
              Create
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <PkiAlertsTable handlePopUpOpen={handlePopUpOpen} />
      <PkiAlertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deletePkiAlert.isOpen}
        title={`Are you sure want to remove the alert ${
          (popUp?.deletePkiAlert?.data as { name: string })?.name || ""
        } from the project?`}
        onChange={(isOpen) => handlePopUpToggle("deletePkiAlert", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveAlertSubmit((popUp?.deletePkiAlert?.data as { alertId: string })?.alertId)
        }
      />
    </div>
  );
};
