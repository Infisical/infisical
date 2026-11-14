import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog
} from "@app/components/v3";
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
    <Card>
      <CardHeader>
        <CardTitle>
          Alerts <Badge variant="neutral">Legacy</Badge>
        </CardTitle>
        <CardDescription>Create new alerts inside an Application.</CardDescription>
      </CardHeader>
      <CardContent>
        <PkiAlertsTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <PkiAlertModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <ConfirmationAlertDialog
        isOpen={popUp.deletePkiAlert.isOpen}
        description="This action is irreversible."
        title={`Are you sure you want to remove the alert ${
          (popUp?.deletePkiAlert?.data as { name: string })?.name || ""
        }?`}
        onOpenChange={(isOpen) => handlePopUpToggle("deletePkiAlert", isOpen)}
        confirmKey="confirm"
        onConfirm={() =>
          onRemoveAlertSubmit((popUp?.deletePkiAlert?.data as { alertId: string })?.alertId)
        }
      />
    </Card>
  );
};
