import { useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  CircleStopIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmDialog,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TAlert, useDeleteAlert, useListAlerts, useUpdateAlert } from "@app/hooks/api/alerts";

import { PkiDocsUrls } from "../../../pki-docs-urls";
import { CertificateAlertSheet } from "./CertificateAlertSheet";
import {
  CERTIFICATE_ALERT_EVENT_LABELS,
  CERTIFICATE_ALERT_RESOURCE_TYPE,
  CertificateAlertEvent
} from "./types";

const LAST_RUN_BADGES: Record<
  string,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  success: { label: "Success", variant: "success" },
  partial: { label: "Partial", variant: "warning" },
  failed: { label: "Failed", variant: "danger" }
};

type AlertRowProps = {
  alert: TAlert;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
};

const AlertRow = ({ alert, onEdit, onDelete, canEdit, canDelete }: AlertRowProps) => {
  const { mutate: updateAlert } = useUpdateAlert();

  const handleToggleAlert = () =>
    updateAlert(
      { alertId: alert.id, enabled: !alert.enabled },
      {
        onSuccess: () =>
          createNotification({
            text: `Alert ${!alert.enabled ? "enabled" : "disabled"} successfully`,
            type: "success"
          })
      }
    );

  return (
    <TableRow>
      <TableCell isTruncatable>
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{alert.name}</span>
          {alert.description ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="size-3.5 shrink-0 text-accent" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                {alert.description}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-accent">
        {CERTIFICATE_ALERT_EVENT_LABELS[alert.eventType as CertificateAlertEvent] ??
          alert.eventType}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <Badge variant={alert.enabled ? "success" : "neutral"}>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-accent">
        {alert.condition?.alertBefore ? (
          alert.condition.alertBefore
        ) : (
          <span className="text-surface-selected">—</span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {alert.lastRun ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant={LAST_RUN_BADGES[alert.lastRun.status]?.variant ?? "danger"}>
                {LAST_RUN_BADGES[alert.lastRun.status]?.label ?? "Failed"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              <div className="text-xs text-label">
                {new Date(alert.lastRun.timestamp)
                  .toISOString()
                  .replace("T", " ")
                  .replace("Z", " UTC")}
              </div>
              {alert.lastRun.error ? (
                <div className="mt-1 max-h-32 thin-scrollbar overflow-y-auto text-xs break-words text-danger">
                  {alert.lastRun.error}
                </div>
              ) : null}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-surface-selected">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="Alert actions">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-44" align="end" sideOffset={2}>
            <DropdownMenuItem isDisabled={!canEdit} onClick={onEdit}>
              <PencilIcon />
              Edit alert
            </DropdownMenuItem>
            <DropdownMenuItem isDisabled={!canEdit} onClick={handleToggleAlert}>
              {alert.enabled ? <CircleStopIcon /> : <PlayIcon />}
              {alert.enabled ? "Disable" : "Enable"} alert
            </DropdownMenuItem>
            <DropdownMenuItem variant="danger" isDisabled={!canDelete} onClick={onDelete}>
              <Trash2Icon />
              Delete alert
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};

type Props = {
  projectId: string;
  applicationId: string;
  applicationName: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export const ApplicationAlertsCard = ({
  projectId,
  applicationId,
  applicationName,
  canCreate,
  canEdit,
  canDelete
}: Props) => {
  const { data: alerts = [], isLoading: isAlertsLoading } = useListAlerts({
    resourceType: CERTIFICATE_ALERT_RESOURCE_TYPE,
    projectId,
    resourceId: applicationId
  });
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; alertId?: string }>({
    isOpen: false
  });
  const [deleteAlertModal, setDeleteAlertModal] = useState<{
    isOpen: boolean;
    alertId?: string;
    name?: string;
  }>({ isOpen: false });
  const { mutateAsync: deleteAlert } = useDeleteAlert();

  const handleDeleteAlert = async () => {
    if (!deleteAlertModal.alertId) return;
    await deleteAlert({ alertId: deleteAlertModal.alertId });
    setDeleteAlertModal({ isOpen: false });
    createNotification({ type: "success", text: "Alert deleted" });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Alerting
            <DocumentationLinkBadge href={PkiDocsUrls.applications.alerting.overview} />
          </CardTitle>
          <CardDescription>Get notified about certificate events.</CardDescription>
          <CardAction>
            <Tooltip>
              <TooltipTrigger asChild>
                {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable wrapper required so the tooltip surfaces on keyboard focus despite the inner button being disabled */}
                <span tabIndex={0}>
                  <Button
                    variant="outline"
                    onClick={() => setAlertModal({ isOpen: true })}
                    isDisabled={!canCreate}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                    Create Alert
                  </Button>
                </span>
              </TooltipTrigger>
              {!canCreate && (
                <TooltipContent side="left">
                  You don&apos;t have permission to create alerts
                </TooltipContent>
              )}
            </Tooltip>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!isAlertsLoading && alerts.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No alerts configured</EmptyTitle>
                <EmptyDescription>
                  Create one to get notified about certificate events for this application.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Name</TableHead>
                  <TableHead className="whitespace-nowrap">Alert Type</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Alert Before</TableHead>
                  <TableHead className="whitespace-nowrap">Last Run</TableHead>
                  <TableHead className="w-5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAlertsLoading &&
                  Array.from({ length: 3 }, (_, idx) => (
                    <TableRow key={`alert-skeleton-${idx + 1}`}>
                      {Array.from({ length: 6 }, (__, cellIdx) => (
                        <TableCell key={`alert-skeleton-cell-${cellIdx + 1}`}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!isAlertsLoading &&
                  alerts.map((a) => (
                    <AlertRow
                      key={a.id}
                      alert={a}
                      onEdit={() => setAlertModal({ isOpen: true, alertId: a.id })}
                      onDelete={() =>
                        setDeleteAlertModal({ isOpen: true, alertId: a.id, name: a.name })
                      }
                      canEdit={canEdit}
                      canDelete={canDelete}
                    />
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <CertificateAlertSheet
        isOpen={alertModal.isOpen}
        onOpenChange={(isOpen) => setAlertModal({ isOpen, alertId: undefined })}
        projectId={projectId}
        applicationId={applicationId}
        applicationName={applicationName}
        alert={alerts.find((a) => a.id === alertModal.alertId)}
      />
      <DeleteConfirmDialog
        isOpen={deleteAlertModal.isOpen}
        confirmKey="delete"
        title={`Delete Alert "${deleteAlertModal.name ?? ""}"?`}
        onOpenChange={(isOpen) =>
          setDeleteAlertModal({ isOpen, alertId: undefined, name: undefined })
        }
        onConfirm={handleDeleteAlert}
      />
    </>
  );
};
