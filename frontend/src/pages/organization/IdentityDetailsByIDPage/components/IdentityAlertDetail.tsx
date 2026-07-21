import { BellPlusIcon, MoreHorizontalIcon, PencilIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Button,
  Detail,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton
} from "@app/components/v3";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { usePopUp } from "@app/hooks";
import { AlertResourceType, TAlert, useDeleteAlert, useListAlerts } from "@app/hooks/api/alerts";
import { AddAlertModal } from "@app/views/AlertsPage/components/AddAlertModal";

type Props = {
  identityId: string;
  identityName: string;
};

// "Alert" subsection of the identity Details card. Shows the single alert bound to this identity
// (name, event, channel icons) and opens the drawer in edit mode when clicked. When none exists it
// offers a create action pre-bound to the identity. Uniqueness (one alert per resource + event) is
// enforced by the backend, so at most one alert is ever returned here.
export const IdentityAlertDetail = ({ identityId, identityName }: Props) => {
  const { data: alerts = [] } = useListAlerts({
    resourceType: AlertResourceType.IdentityCredential,
    resourceId: identityId
  });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["alert", "deleteAlert"] as const);

  const deleteAlert = useDeleteAlert();

  const existingAlert = alerts[0] as TAlert | undefined;

  const handleDeleteAlert = async () => {
    if (!existingAlert) return;

    try {
      await deleteAlert.mutateAsync({ alertId: existingAlert.id });
      createNotification({ text: "Successfully deleted alert", type: "success" });
      handlePopUpToggle("deleteAlert", false);
    } catch {
      createNotification({ text: "Failed to delete alert", type: "error" });
    }
  };

  return (
    <Detail>
      <DetailLabel>Alert</DetailLabel>
      <DetailValue>
        {existingAlert ? (
          <div className="flex w-full items-center gap-2 rounded-md border border-border p-3">
            <span
              className={`size-2 shrink-0 rounded-full ${existingAlert.enabled ? "bg-success" : "bg-muted"}`}
              title={existingAlert.enabled ? "Enabled" : "Disabled"}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {existingAlert.name}
            </span>
            <OrgPermissionCan
              I={OrgPermissionIdentityActions.Edit}
              a={OrgPermissionSubjects.Identity}
            >
              {(isAllowed) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      aria-label="Alert actions"
                      isDisabled={!isAllowed}
                      variant="ghost"
                      size="xs"
                    >
                      <MoreHorizontalIcon />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handlePopUpOpen("alert")}>
                      <PencilIcon />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="danger"
                      onClick={() => handlePopUpOpen("deleteAlert")}
                    >
                      <TrashIcon />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </OrgPermissionCan>
          </div>
        ) : (
          <OrgPermissionCan
            I={OrgPermissionIdentityActions.Edit}
            a={OrgPermissionSubjects.Identity}
          >
            {(isAllowed) => (
              <Button
                variant="outline"
                size="xs"
                isDisabled={!isAllowed}
                onClick={() => handlePopUpOpen("alert")}
              >
                <BellPlusIcon />
                Create Alert
              </Button>
            )}
          </OrgPermissionCan>
        )}
      </DetailValue>
      <AddAlertModal
        isOpen={popUp.alert.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("alert", isOpen)}
        resourceId={identityId}
        resourceName={identityName}
        alert={existingAlert}
      />
      <DeleteActionModal
        isOpen={popUp.deleteAlert.isOpen}
        title={`Are you sure you want to delete the alert ${existingAlert?.name ?? ""}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteAlert", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDeleteAlert}
      />
    </Detail>
  );
};
