import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { useProject } from "@app/context";
import { useDeletePkiAlert } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiAlertModal } from "./PkiAlertModal";
import { PkiAlertsTable } from "./PkiAlertsTable";

export const PkiAlertsSection = () => {
  const { currentProject } = useProject();
  const projectId = currentProject?.id || "";
  const { mutateAsync: deletePkiAlert } = useDeletePkiAlert();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiAlert",
    "deletePkiAlert"
  ] as const);

  const onRemoveAlertSubmit = async (alertId: string) => {
    if (!projectId) return;

    await deletePkiAlert({
      alertId
    });

    createNotification({
      text: "Successfully deleted alert",
      type: "success"
    });

    handlePopUpClose("deletePkiAlert");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-x-2">
          <p className="text-xl font-medium text-mineshaft-100">Alerts</p>
          <span className="rounded bg-mineshaft-600 px-2 py-0.5 text-xs tracking-wide text-mineshaft-200 uppercase">
            Legacy
          </span>
        </div>
        <p className="text-xs text-bunker-300">Create new alerts inside an Application.</p>
      </div>
      <PkiAlertsTable handlePopUpOpen={handlePopUpOpen} />
      <PkiAlertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deletePkiAlert.isOpen}
        title={`Are you sure you want to remove the alert ${
          (popUp?.deletePkiAlert?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deletePkiAlert", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveAlertSubmit((popUp?.deletePkiAlert?.data as { alertId: string })?.alertId)
        }
      />
    </div>
  );
};
