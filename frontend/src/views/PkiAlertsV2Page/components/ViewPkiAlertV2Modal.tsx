import { faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Badge,
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  PkiAlertChannelTypeV2,
  PkiAlertEventTypeV2,
  TPkiAlertChannelConfigEmail,
  TPkiAlertChannelConfigWebhookResponse,
  useGetPkiAlertV2ById
} from "@app/hooks/api/pkiAlertsV2";

import {
  formatAlertBefore,
  formatEventType,
  getChannelDisplayName,
  getChannelIcon,
  getWebhookHostname
} from "../utils/pki-alert-formatters";

interface Props {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  alertId?: string;
}

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

const SectionHeader = ({ title }: { title: string }) => (
  <h3 className="border-b border-border-subtle pb-2 text-sm font-normal text-foreground">
    {title}
  </h3>
);

export const ViewPkiAlertV2Modal = ({ isOpen, onOpenChange, alertId }: Props) => {
  const { data: alert, isLoading: isLoadingAlert } = useGetPkiAlertV2ById(
    { alertId: alertId || "" },
    { enabled: !!alertId && isOpen }
  );

  if (isLoadingAlert) {
    return (
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent size="form">
          <SheetHeader>
            <SheetTitle>Certificate Alert Details</SheetTitle>
            <SheetDescription>View certificate details.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <SheetFooter className="justify-end border-t">
            <SheetClose asChild>
              <Button variant="ghost">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  if (!alert) {
    return (
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetContent size="form">
          <SheetHeader>
            <SheetTitle>Certificate Alert Details</SheetTitle>
            <SheetDescription>View certificate details.</SheetDescription>
          </SheetHeader>
          <p className="py-8 text-center text-sm text-muted">Alert not found.</p>
          <SheetFooter className="justify-end border-t">
            <SheetClose asChild>
              <Button variant="ghost">Close</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent size="form">
        <SheetHeader>
          <SheetTitle>Certificate Alert Details</SheetTitle>
          <SheetDescription>View certificate details.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">Alert Name</p>
              <p className="mt-1 truncate text-base font-semibold text-foreground">{alert.name}</p>
              {alert.description && <p className="mt-1 text-sm text-muted">{alert.description}</p>}
            </div>
            <Badge variant={alert.enabled ? "success" : "neutral"}>
              {alert.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>

          <div className="space-y-3">
            <SectionHeader title="Basic Information" />
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-accent">Event Type</p>
                <div className="text-sm text-foreground">{formatEventType(alert.eventType)}</div>
              </div>
              {alert.eventType === PkiAlertEventTypeV2.EXPIRATION && (
                <>
                  <div>
                    <p className="text-xs text-accent">Alert Before</p>
                    <div className="text-sm text-foreground">
                      {formatAlertBefore(alert.alertBefore, undefined)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-accent">Repeat daily until expiry</p>
                    <div className="text-sm text-foreground">
                      {alert.notificationConfig?.enableDailyNotification ? "Enabled" : "Disabled"}
                    </div>
                  </div>
                </>
              )}
              <div>
                <p className="text-xs text-accent">Created</p>
                <div className="text-sm text-foreground">{formatDate(alert.createdAt)}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeader title="Notification Channels" />
            {(alert.channels || []).length === 0 ? (
              <p className="text-sm text-muted/70 italic">No notification channels configured.</p>
            ) : (
              <div className="space-y-2">
                {(alert.channels || []).map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-start gap-3 rounded-md border border-border-control bg-surface-raised/40 p-3"
                  >
                    <FontAwesomeIcon
                      icon={getChannelIcon(channel.channelType)}
                      className="mt-0.5 shrink-0 text-muted"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {getChannelDisplayName(channel.channelType)}
                        </span>
                        {channel.channelType === PkiAlertChannelTypeV2.WEBHOOK &&
                          (channel.config as TPkiAlertChannelConfigWebhookResponse)
                            ?.hasSigningSecret && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <FontAwesomeIcon icon={faKey} className="text-xs text-muted" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>Signed webhook</TooltipContent>
                            </Tooltip>
                          )}
                        {!channel.enabled && <Badge variant="neutral">Disabled</Badge>}
                      </div>
                      {channel.channelType === PkiAlertChannelTypeV2.EMAIL &&
                        (() => {
                          const config = channel.config as TPkiAlertChannelConfigEmail;
                          const recipients = config?.recipients || [];
                          const count = recipients.length;
                          if (count === 0) {
                            return <p className="mt-1 text-xs text-muted">No recipients</p>;
                          }
                          const displayed = recipients.slice(0, 3).join(", ");
                          const text = count <= 3 ? displayed : `${displayed} +${count - 3} more`;
                          return count > 3 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <p className="mt-1 cursor-help text-xs text-muted">{text}</p>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{recipients.join(", ")}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <p className="mt-1 text-xs text-muted">{text}</p>
                          );
                        })()}
                      {channel.channelType === PkiAlertChannelTypeV2.WEBHOOK && (
                        <p className="mt-1 truncate text-xs text-muted">
                          {getWebhookHostname(
                            (channel.config as TPkiAlertChannelConfigWebhookResponse).url
                          )}
                        </p>
                      )}
                      {channel.channelType === PkiAlertChannelTypeV2.SLACK && (
                        <p className="mt-1 text-xs text-muted">Slack webhook configured</p>
                      )}
                      {channel.channelType === PkiAlertChannelTypeV2.PAGERDUTY && (
                        <p className="mt-1 text-xs text-muted">PagerDuty integration configured</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <SheetFooter className="justify-end border-t">
          <SheetClose asChild>
            <Button variant="ghost">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
