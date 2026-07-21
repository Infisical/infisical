import { BellPlusIcon, PencilIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
  Button,
  Detail,
  DetailLabel,
  DetailValue,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  ALERT_EVENT_TYPE_LABELS,
  AlertEventType,
  AlertResourceType,
  TAlert,
  useDeleteAlert,
  useListAlerts
} from "@app/hooks/api/alerts";
import { AddAlertModal } from "@app/views/AlertsPage/components/AddAlertModal";
import { getChannelIcon } from "@app/views/AlertsPage/components/channelIcons";

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
  const eventLabel = existingAlert
    ? (ALERT_EVENT_TYPE_LABELS[existingAlert.eventType as AlertEventType] ??
      existingAlert.eventType)
    : "";

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
          <div className="flex w-full items-center justify-between gap-2 rounded-md border border-border p-3">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="truncate text-foreground">{existingAlert.name}</span>
                {existingAlert.enabled ? (
                  <span className="flex items-center gap-1.5 text-sm text-success">
                    <span className="size-1.5 rounded-full bg-success" aria-hidden />
                    Enabled
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <span className="size-1.5 rounded-full bg-muted" aria-hidden />
                    Disabled
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="warning">{eventLabel}</Badge>
                {existingAlert.channels.map((channel) => {
                  const Icon = getChannelIcon(channel.channelType);
                  return (
                    <Tooltip key={channel.id}>
                      <TooltipTrigger asChild>
                        <span className="flex size-6 items-center justify-center rounded border border-border text-muted">
                          <Icon className="size-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {channel.name} · {ALERT_CHANNEL_TYPE_LABELS[channel.channelType]}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <OrgPermissionCan
                I={OrgPermissionIdentityActions.Edit}
                a={OrgPermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <IconButton
                    aria-label="Edit alert"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("alert")}
                    variant="ghost"
                    size="xs"
                  >
                    <PencilIcon />
                  </IconButton>
                )}
              </OrgPermissionCan>
              <OrgPermissionCan
                I={OrgPermissionIdentityActions.Edit}
                a={OrgPermissionSubjects.Identity}
              >
                {(isAllowed) => (
                  <IconButton
                    aria-label="Delete alert"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("deleteAlert")}
                    variant="ghost"
                    size="xs"
                    className="hover:text-danger"
                  >
                    <TrashIcon />
                  </IconButton>
                )}
              </OrgPermissionCan>
            </div>
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
