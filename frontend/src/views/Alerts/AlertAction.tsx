import { ReactNode, useState } from "react";
import { BellIcon } from "lucide-react";

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
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch
} from "@app/components/v3";
import { usePopUp, useScopeVariant } from "@app/hooks";
import {
  ALERT_CHANNEL_TYPE_LABELS,
  ALERT_EVENT_TYPE_LABELS,
  AlertChannelType,
  AlertEventType,
  AlertResourceType,
  parseAlertBeforeDays,
  TAlert,
  useDeleteAlert,
  useListAlerts,
  useUpdateAlert
} from "@app/hooks/api/alerts";

import { AddAlertModal } from "./AddAlertModal";

type Props = {
  identityId: string;
  identityName: string;
  // Org-scoped when omitted.
  projectId?: string;
  scopeName?: string;
  // Renders the alert without any way to create, edit or remove it.
  readOnly?: boolean;
  // Wraps the mutating actions in the caller's permission gate (org- or project-scoped), which is the
  // only thing that differs between the org and project entry points.
  renderPermissionGate: (render: (isAllowed: boolean) => ReactNode) => ReactNode;
};

// "7 days before client secret expiry"; falls back to the event label when the
// stored condition is missing or malformed.
const formatConditionSummary = (alert: TAlert): string => {
  const days = parseAlertBeforeDays(alert.condition?.alertBefore);
  if (days === null) {
    return ALERT_EVENT_TYPE_LABELS[alert.eventType as AlertEventType] ?? alert.eventType;
  }
  return `${days} day${days === 1 ? "" : "s"} before client secret expiry`;
};

const formatChannelSummary = (alert: TAlert): string =>
  Object.values(AlertChannelType)
    .filter((type) =>
      alert.channels.some((channel) => channel.channelType === type && channel.enabled)
    )
    .map((type) => ALERT_CHANNEL_TYPE_LABELS[type])
    .join(", ");

export const AlertAction = ({
  identityId,
  identityName,
  projectId,
  scopeName,
  readOnly = false,
  renderPermissionGate
}: Props) => {
  const { data: alerts = [] } = useListAlerts({
    resourceType: AlertResourceType.IdentityAuthentication,
    resourceId: identityId,
    ...(projectId ? { projectId } : {})
  });

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["alert", "deleteAlert"] as const);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const scopeVariant = useScopeVariant();

  const updateAlert = useUpdateAlert();
  const deleteAlert = useDeleteAlert();

  const existingAlert = alerts[0] as TAlert | undefined;

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!existingAlert) return;

    try {
      await updateAlert.mutateAsync({ alertId: existingAlert.id, enabled });
      createNotification({ text: `Alert ${enabled ? "enabled" : "disabled"}`, type: "success" });
    } catch {
      // MutationCache reports request errors globally.
    }
  };

  const handleDeleteAlert = async () => {
    if (!existingAlert) return;

    try {
      await deleteAlert.mutateAsync({ alertId: existingAlert.id });
      createNotification({ text: "Successfully deleted alert", type: "success" });
      handlePopUpToggle("deleteAlert", false);
    } catch {
      // MutationCache reports request errors globally; keep the dialog open.
    }
  };

  if (!existingAlert) {
    if (readOnly) return null;

    return (
      <>
        {renderPermissionGate((isAllowed) => (
          <Button
            variant="outline"
            isDisabled={!isAllowed}
            onClick={() => handlePopUpOpen("alert")}
          >
            <BellIcon />
            Alert
          </Button>
        ))}
        <AddAlertModal
          isOpen={popUp.alert.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("alert", isOpen)}
          projectId={projectId}
          scopeName={scopeName}
          resourceId={identityId}
          resourceName={identityName}
        />
      </>
    );
  }

  const channelSummary = formatChannelSummary(existingAlert);

  return (
    <>
      <Popover open={isSummaryOpen} onOpenChange={setIsSummaryOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <BellIcon />
            Alert
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${existingAlert.enabled ? "bg-success" : "bg-neutral"}`}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 p-0">
          <div className="flex flex-col gap-1 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {existingAlert.name}
              </span>
              <Badge variant={existingAlert.enabled ? "success" : "neutral"}>
                {existingAlert.enabled ? "Active" : "Disabled"}
              </Badge>
            </div>
            <p className="text-sm text-muted">{formatConditionSummary(existingAlert)}</p>
            {channelSummary && <p className="text-sm text-muted">Notifies {channelSummary}</p>}
          </div>
          {!readOnly &&
            renderPermissionGate((isAllowed) => (
              // Single element (not a fragment): the denied-state gate wraps this in a
              // tooltip trigger via asChild, which needs one ref-accepting child.
              <div>
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <Label htmlFor="alert-quick-enable" className="cursor-pointer font-normal">
                    Enabled
                  </Label>
                  <Switch
                    id="alert-quick-enable"
                    variant={scopeVariant}
                    checked={existingAlert.enabled}
                    disabled={!isAllowed || updateAlert.isPending}
                    onCheckedChange={handleToggleEnabled}
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={!isAllowed}
                    onClick={() => {
                      setIsSummaryOpen(false);
                      handlePopUpOpen("alert");
                    }}
                  >
                    Edit Details
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger/10 hover:text-danger"
                    isDisabled={!isAllowed}
                    onClick={() => {
                      setIsSummaryOpen(false);
                      handlePopUpOpen("deleteAlert");
                    }}
                  >
                    Remove Alert
                  </Button>
                </div>
              </div>
            ))}
        </PopoverContent>
      </Popover>
      {!readOnly && (
        <>
          <AddAlertModal
            isOpen={popUp.alert.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("alert", isOpen)}
            projectId={projectId}
            scopeName={scopeName}
            resourceId={identityId}
            resourceName={identityName}
            alert={existingAlert}
          />
          <AlertDialog
            open={popUp.deleteAlert.isOpen}
            confirmationValue={existingAlert.name}
            onOpenChange={(open) => handlePopUpToggle("deleteAlert", open)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Alert?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the alert and stops its notifications.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogConfirmationField inputProps={{ placeholder: existingAlert.name }} />
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
