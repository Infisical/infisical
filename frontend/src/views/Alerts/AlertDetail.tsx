import { ReactNode } from "react";
import {
  BanIcon,
  BellPlusIcon,
  CheckIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
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
import { usePopUp } from "@app/hooks";
import {
  ALERT_EVENT_TYPE_LABELS,
  AlertEventType,
  AlertResourceType,
  formatAlertBefore,
  TAlert,
  useDeleteAlert,
  useListAlerts
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

export const AlertDetail = ({
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

  const deleteAlert = useDeleteAlert();

  const existingAlert = alerts[0] as TAlert | undefined;

  const eventLabel = existingAlert
    ? (ALERT_EVENT_TYPE_LABELS[existingAlert.eventType as AlertEventType] ??
      existingAlert.eventType)
    : "";
  const summary = [eventLabel, formatAlertBefore(existingAlert?.condition?.alertBefore)]
    .filter(Boolean)
    .join(" · ");

  const handleDeleteAlert = async () => {
    if (!existingAlert) return;

    await deleteAlert.mutateAsync({ alertId: existingAlert.id });
    createNotification({ text: "Successfully deleted alert", type: "success" });
    handlePopUpToggle("deleteAlert", false);
  };

  const renderValue = () => {
    if (existingAlert) {
      return (
        <div className="flex w-full items-center gap-2">
          <Badge variant={existingAlert.enabled ? "success" : "neutral"}>
            {existingAlert.enabled ? <CheckIcon /> : <BanIcon />}
            {existingAlert.enabled ? "Enabled" : "Disabled"}
          </Badge>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">{summary}</span>
          {!readOnly &&
            renderPermissionGate((isAllowed) => (
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
                  <DropdownMenuItem variant="danger" onClick={() => handlePopUpOpen("deleteAlert")}>
                    <TrashIcon />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
        </div>
      );
    }

    if (readOnly) {
      return <span className="text-muted">—</span>;
    }

    return renderPermissionGate((isAllowed) => (
      <Button
        variant="outline"
        size="xs"
        isDisabled={!isAllowed}
        onClick={() => handlePopUpOpen("alert")}
      >
        <BellPlusIcon />
        Create Alert
      </Button>
    ));
  };

  return (
    <Detail>
      <DetailLabel>Alert</DetailLabel>
      <DetailValue>{renderValue()}</DetailValue>
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
          <DeleteActionModal
            isOpen={popUp.deleteAlert.isOpen}
            title={`Are you sure you want to delete the alert ${existingAlert?.name ?? ""}?`}
            onChange={(isOpen) => handlePopUpToggle("deleteAlert", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={handleDeleteAlert}
          />
        </>
      )}
    </Detail>
  );
};
