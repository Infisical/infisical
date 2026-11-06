import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { EyeIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";

import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { PkiAlertEventTypeV2, TPkiAlertV2 } from "@app/hooks/api/pkiAlertsV2";

import { formatAlertBefore, formatEventType } from "../utils/pki-alert-formatters";

interface Props {
  alert: TPkiAlertV2;
  onView: () => void;
  onDelete: () => void;
}

export const PkiAlertV2Row = ({ alert, onView, onDelete }: Props) => {
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="font-medium text-foreground-cool">{alert.name}</div>
          {alert.description && (
            <Tooltip hoverable delayDuration={50}>
              <TooltipTrigger asChild>
                <FontAwesomeIcon icon={faCircleInfo} className="text-muted" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">{alert.description}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell>
        <span className="text-label-cool">{formatEventType(alert.eventType)}</span>
      </TableCell>
      <TableCell>
        <Badge variant={alert.enabled ? "success" : "neutral"}>
          {alert.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </TableCell>
      <TableCell className="text-label-cool">
        {alert.eventType === PkiAlertEventTypeV2.EXPIRATION ? (
          formatAlertBefore(alert.alertBefore)
        ) : (
          <span className="text-surface-selected">—</span>
        )}
      </TableCell>
      <TableCell>
        {alert.lastRun ? (
          <Tooltip hoverable delayDuration={50}>
            <TooltipTrigger asChild>
              <Badge variant={alert.lastRun.status === "success" ? "success" : "danger"}>
                {alert.lastRun.status === "success" ? "Success" : "Failed"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <div className="max-w-sm">
                <div className="text-xs text-label">
                  {new Date(alert.lastRun.timestamp)
                    .toISOString()
                    .replace("T", " ")
                    .replace("Z", " UTC")}
                </div>
                {alert.lastRun.error && (
                  <div className="mt-1 max-h-32 thin-scrollbar overflow-y-auto text-xs break-words text-danger">
                    {alert.lastRun.error}
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-surface-selected">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton size="xs" variant="ghost" aria-label="Alert actions">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onView}>
              <EyeIcon />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} variant="danger">
              <Trash2Icon />
              Delete alert
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
