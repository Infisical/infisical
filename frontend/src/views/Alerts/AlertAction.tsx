import { ReactNode, useState } from "react";
import { BellIcon, EllipsisIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Toggle
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { usePopUp, useScopeVariant } from "@app/hooks";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  ALERT_EVENT_TYPE_LABELS,
  AlertChannelType,
  AlertEventType,
  AlertResourceType,
  TAlert,
  useDeleteAlert,
  useListAlerts,
  useUpdateAlert
} from "@app/hooks/api/alerts";

import { AddAlertModal } from "./AddAlertModal";
import { getChannelIcon } from "./channelIcons";

type Props = {
  identityId: string;
  // Org-scoped when omitted.
  projectId?: string;
  // Renders the alerts without any way to create, edit or remove them.
  readOnly?: boolean;
  // Wraps the mutating actions in the caller's permission gate (org- or project-scoped), which is the
  // only thing that differs between the org and project entry points.
  renderPermissionGate: (render: (isAllowed: boolean) => ReactNode) => ReactNode;
};

const getEnabledChannelTypes = (alert: TAlert): AlertChannelType[] =>
  Object.values(AlertChannelType).filter((type) =>
    alert.channels.some((channel) => channel.channelType === type && channel.enabled)
  );

export const AlertAction = ({
  identityId,
  projectId,
  readOnly = false,
  renderPermissionGate
}: Props) => {
  const { data: alerts = [] } = useListAlerts({
    resourceType: AlertResourceType.IdentityAuthentication,
    resourceId: identityId,
    ...(projectId ? { projectId } : {})
  });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["alert", "deleteAlert"] as const);
  const [isListOpen, setIsListOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<TAlert | undefined>();
  const scopeVariant = useScopeVariant();

  const updateAlert = useUpdateAlert();
  const deleteAlert = useDeleteAlert();

  const enabledCount = alerts.filter((alert) => alert.enabled).length;
  const usedEventTypes = alerts.map((alert) => alert.eventType as AlertEventType);
  const canAddAlert = Object.values(AlertEventType).some(
    (eventType) => !usedEventTypes.includes(eventType)
  );

  const openAlertForm = (alert?: TAlert) => {
    setSelectedAlert(alert);
    setIsListOpen(false);
    handlePopUpOpen("alert");
  };

  const handleToggleEnabled = async (alert: TAlert, enabled: boolean) => {
    try {
      await updateAlert.mutateAsync({ alertId: alert.id, enabled });
      createNotification({ text: `Alert ${enabled ? "enabled" : "disabled"}`, type: "success" });
    } catch {
      // MutationCache reports request errors globally.
    }
  };

  const handleDeleteAlert = async () => {
    if (!selectedAlert) return;

    try {
      await deleteAlert.mutateAsync({ alertId: selectedAlert.id });
      createNotification({ text: "Successfully deleted alert", type: "success" });
      handlePopUpToggle("deleteAlert", false);
    } catch {
      // MutationCache reports request errors globally; keep the dialog open.
    }
  };

  if (!alerts.length && readOnly) return null;

  return (
    <>
      {alerts.length ? (
        <Popover open={isListOpen} onOpenChange={setIsListOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline">
              <BellIcon />
              Alerts
              <span className="flex items-center gap-1.5 text-muted">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    enabledCount ? "bg-success" : "bg-neutral"
                  )}
                />
                <span aria-label={`${enabledCount} enabled`}>{enabledCount}</span>
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <span className="text-sm font-semibold text-foreground">Alerts</span>
              <span className="text-xs text-muted">
                {enabledCount} of {alerts.length} enabled
              </span>
            </div>
            <div className="max-h-80 divide-y divide-border overflow-y-auto">
              {alerts.map((alert) => {
                const channelTypes = getEnabledChannelTypes(alert);
                return (
                  <div key={alert.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className={cn("flex min-w-0 flex-col", !alert.enabled && "opacity-60")}>
                      <span className="truncate text-sm text-foreground">{alert.name}</span>
                      <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
                        <span className="truncate">
                          {ALERT_EVENT_TYPE_LABELS[alert.eventType as AlertEventType]}
                        </span>
                        {channelTypes.length > 0 && (
                          <>
                            <span aria-hidden>·</span>
                            <div className="flex shrink-0 items-center gap-1">
                              {channelTypes.map((type) => {
                                const ChannelIcon = getChannelIcon(type);
                                return (
                                  <ChannelIcon
                                    key={type}
                                    role="img"
                                    aria-label={ALERT_CHANNEL_TYPE_LABELS[type]}
                                    className="size-3.5"
                                  />
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {readOnly ? (
                      <Badge variant={alert.enabled ? "success" : "neutral"}>
                        {alert.enabled ? "Active" : "Disabled"}
                      </Badge>
                    ) : (
                      renderPermissionGate((isAllowed) => (
                        // Single element (not a fragment): the denied-state gate wraps this in a
                        // tooltip trigger via asChild, which needs one ref-accepting child.
                        <div className="flex shrink-0 items-center gap-2">
                          <Toggle
                            aria-label={`${alert.enabled ? "Disable" : "Enable"} ${alert.name}`}
                            variant={scopeVariant}
                            checked={alert.enabled}
                            disabled={
                              !isAllowed ||
                              (updateAlert.isPending && updateAlert.variables?.alertId === alert.id)
                            }
                            onCheckedChange={(enabled) => handleToggleEnabled(alert, enabled)}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="ghost-muted"
                                size="xs"
                                aria-label={`Options for ${alert.name}`}
                                isDisabled={!isAllowed}
                              >
                                <EllipsisIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openAlertForm(alert)}>
                                <PencilIcon />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="danger"
                                onClick={() => {
                                  setSelectedAlert(alert);
                                  setIsListOpen(false);
                                  handlePopUpOpen("deleteAlert");
                                }}
                              >
                                <TrashIcon />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
            {!readOnly &&
              canAddAlert &&
              renderPermissionGate((isAllowed) => (
                <div className="border-t border-border px-4 py-3">
                  <Button
                    variant={scopeVariant}
                    size="sm"
                    isDisabled={!isAllowed}
                    onClick={() => openAlertForm()}
                  >
                    <PlusIcon />
                    Add Alert
                  </Button>
                </div>
              ))}
          </PopoverContent>
        </Popover>
      ) : (
        renderPermissionGate((isAllowed) => (
          <Button variant="outline" isDisabled={!isAllowed} onClick={() => openAlertForm()}>
            <BellIcon />
            Alerts
          </Button>
        ))
      )}
      {!readOnly && (
        <>
          <AddAlertModal
            isOpen={popUp.alert.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("alert", isOpen)}
            projectId={projectId}
            resourceId={identityId}
            alert={selectedAlert}
            unavailableEventTypes={usedEventTypes}
          />
          <AlertDialog
            open={popUp.deleteAlert.isOpen}
            confirmationValue={selectedAlert?.name}
            onOpenChange={(open) => handlePopUpToggle("deleteAlert", open)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Alert?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the alert and stops its notifications.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogConfirmationField inputProps={{ placeholder: selectedAlert?.name }} />
              <Alert variant="danger" appearance="borderless">
                <AlertDescription>Removing this alert cannot be undone.</AlertDescription>
              </Alert>
              <AlertDialogFooter>
                <AlertDialogCancel isDisabled={deleteAlert.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="danger"
                  isPending={deleteAlert.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    handleDeleteAlert();
                  }}
                >
                  Remove Alert
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );
};
