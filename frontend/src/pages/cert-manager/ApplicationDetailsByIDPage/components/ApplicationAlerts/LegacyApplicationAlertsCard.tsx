import { useState } from "react";
import { EyeIcon, InfoIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DeleteConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
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
import {
  PkiAlertEventTypeV2,
  TPkiAlertV2,
  useDeletePkiAlertV2,
  useGetPkiAlertsV2
} from "@app/hooks/api/pkiAlertsV2";
import { ViewPkiAlertV2Modal } from "@app/views/PkiAlertsV2Page/components/ViewPkiAlertV2Modal";
import { formatEventType } from "@app/views/PkiAlertsV2Page/utils/pki-alert-formatters";

import { formatAlertBefore } from "./types";

type LegacyAlertRowProps = {
  alert: TPkiAlertV2;
  onView: () => void;
  onDelete: () => void;
  canDelete: boolean;
};

const LegacyAlertRow = ({ alert, onView, onDelete, canDelete }: LegacyAlertRowProps) => (
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
      {formatEventType(alert.eventType)}
    </TableCell>
    <TableCell className="whitespace-nowrap">
      <Badge variant={alert.enabled ? "success" : "neutral"}>
        {alert.enabled ? "Enabled" : "Disabled"}
      </Badge>
    </TableCell>
    <TableCell className="whitespace-nowrap text-accent">
      {alert.eventType === PkiAlertEventTypeV2.EXPIRATION ? (
        formatAlertBefore(alert.alertBefore)
      ) : (
        <span className="text-surface-selected">—</span>
      )}
    </TableCell>
    <TableCell className="whitespace-nowrap">
      {alert.lastRun ? (
        <Badge variant={alert.lastRun.status === "success" ? "success" : "danger"}>
          {alert.lastRun.status === "success" ? "Success" : "Failed"}
        </Badge>
      ) : (
        <span className="text-surface-selected">—</span>
      )}
    </TableCell>
    <TableCell className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="ghost" size="xs" aria-label="Legacy alert actions">
            <MoreHorizontalIcon />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-44" align="end" sideOffset={2}>
          <DropdownMenuItem onClick={onView}>
            <EyeIcon />
            View details
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

type Props = {
  applicationId: string;
  canDelete: boolean;
};

export const LegacyApplicationAlertsCard = ({ applicationId, canDelete }: Props) => {
  const { data } = useGetPkiAlertsV2({ applicationId, limit: 100 });
  const legacyAlerts = data?.alerts ?? [];
  const [viewAlertId, setViewAlertId] = useState<string>();
  const [deleteAlert, setDeleteAlert] = useState<{ alertId: string; name: string }>();
  const { mutateAsync: deletePkiAlert } = useDeletePkiAlertV2();

  if (legacyAlerts.length === 0) return null;

  const handleDeleteAlert = async () => {
    if (!deleteAlert) return;
    await deletePkiAlert({ alertId: deleteAlert.alertId, applicationId });
    setDeleteAlert(undefined);
    createNotification({ type: "success", text: `Alert "${deleteAlert.name}" deleted` });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Legacy Alerting
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="neutral">Legacy</Badge>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                Legacy alerts are deprecated. They still send notifications but can no longer be
                created or edited. Recreate them under Alerting above, then delete them here.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <CardDescription>Alerts created with the previous alerting system.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Name</TableHead>
                <TableHead className="whitespace-nowrap">Event Type</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="whitespace-nowrap">Alert Before</TableHead>
                <TableHead className="whitespace-nowrap">Last Run</TableHead>
                <TableHead className="w-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {legacyAlerts.map((alert) => (
                <LegacyAlertRow
                  key={alert.id}
                  alert={alert}
                  onView={() => setViewAlertId(alert.id)}
                  onDelete={() => setDeleteAlert({ alertId: alert.id, name: alert.name })}
                  canDelete={canDelete}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ViewPkiAlertV2Modal
        isOpen={Boolean(viewAlertId)}
        onOpenChange={(isOpen) => !isOpen && setViewAlertId(undefined)}
        alertId={viewAlertId}
      />
      <DeleteConfirmDialog
        isOpen={Boolean(deleteAlert)}
        confirmKey="delete"
        title={`Delete Legacy Alert "${deleteAlert?.name ?? ""}"?`}
        description="It stops sending notifications, and legacy alerts can't be recreated. Create a new alert to keep getting them."
        onOpenChange={(isOpen) => !isOpen && setDeleteAlert(undefined)}
        onConfirm={handleDeleteAlert}
      />
    </>
  );
};
