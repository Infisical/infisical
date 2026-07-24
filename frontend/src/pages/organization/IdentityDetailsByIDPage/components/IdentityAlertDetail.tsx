import { BellPlusIcon, MoreHorizontalIcon, PencilIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
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
import {
  ALERT_EVENT_TYPE_LABELS,
  AlertEventType,
  AlertResourceType,
  TAlert,
  useDeleteAlert,
  useListAlerts
} from "@app/hooks/api/alerts";
import { AddAlertModal } from "@app/views/AlertsPage/components/AddAlertModal";

type Props = {
  identityId: string;
  identityName: string;
};

const TIME_UNIT_WORD: Record<string, string> = { d: "day", w: "week", m: "month", y: "year" };

const formatCondition = (alertBefore?: string): string => {
  const match = alertBefore?.match(/^(\d+)([dwmy])$/);
  if (!match) return "";
  const amount = parseInt(match[1], 10);
  const word = TIME_UNIT_WORD[match[2]] ?? match[2];
  return `alert ${amount} ${word}${amount === 1 ? "" : "s"} before`;
};

export const IdentityAlertDetail = ({ identityId, identityName }: Props) => {
  const { data: alerts = [] } = useListAlerts({
    resourceType: AlertResourceType.IdentityAuthentication,
    resourceId: identityId
  });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["alert", "deleteAlert"] as const);

  const deleteAlert = useDeleteAlert();

  const existingAlert = alerts[0] as TAlert | undefined;

  const eventLabel = existingAlert
    ? (ALERT_EVENT_TYPE_LABELS[existingAlert.eventType as AlertEventType] ??
      existingAlert.eventType)
    : "";
  const conditionLabel = formatCondition(existingAlert?.condition?.alertBefore);
  const summary = [eventLabel, conditionLabel].filter(Boolean).join(" · ");

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
          <div className="flex w-full items-center gap-2">
            <Badge variant={existingAlert.enabled ? "success" : "neutral"}>
              {existingAlert.enabled ? "Enabled" : "Disabled"}
            </Badge>
            <span className="min-w-0 flex-1 truncate text-xs text-muted">{summary}</span>
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
