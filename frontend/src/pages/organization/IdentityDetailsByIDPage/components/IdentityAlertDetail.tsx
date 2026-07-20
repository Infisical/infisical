import { BellPlusIcon, PencilIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
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

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["alert"] as const);

  const existingAlert = alerts[0] as TAlert | undefined;
  const eventLabel = existingAlert
    ? (ALERT_EVENT_TYPE_LABELS[existingAlert.eventType as AlertEventType] ??
      existingAlert.eventType)
    : "";

  return (
    <Detail>
      <DetailLabel>Alert</DetailLabel>
      <DetailValue>
        {existingAlert ? (
          <div className="flex w-full items-center justify-between gap-2 rounded-md border border-mineshaft-600 p-3">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="truncate font-medium text-foreground">{existingAlert.name}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="warning">{eventLabel}</Badge>
                {existingAlert.channels.map((channel) => {
                  const Icon = getChannelIcon(channel.channelType);
                  return (
                    <Tooltip key={channel.id}>
                      <TooltipTrigger asChild>
                        <span className="flex size-6 items-center justify-center rounded border border-mineshaft-600 text-muted">
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
            <OrgPermissionCan
              I={OrgPermissionIdentityActions.Edit}
              a={OrgPermissionSubjects.Identity}
            >
              {(isAllowed) => (
                <IconButton
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("alert")}
                  variant="ghost"
                  size="xs"
                >
                  <PencilIcon />
                </IconButton>
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
    </Detail>
  );
};
