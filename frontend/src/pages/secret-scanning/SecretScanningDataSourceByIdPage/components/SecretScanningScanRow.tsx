import { format, formatDistanceStrict, formatDistanceToNowStrict } from "date-fns";
import {
  CheckIcon,
  CopyIcon,
  GitBranchIcon,
  HistoryIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  RotateCwIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { SecretScanningScanStatusBadge } from "@app/components/secret-scanning";
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
import {
  SecretScanningDataSource,
  SecretScanningScanStatus,
  SecretScanningScanType,
  TSecretScanningScanWithDetails
} from "@app/hooks/api/secretScanningV2";

type Props = {
  scan: TSecretScanningScanWithDetails;
  type: SecretScanningDataSource;
};

const getScanTypeDetails = (isHistorical: boolean, type: SecretScanningDataSource) => {
  if (isHistorical) {
    return { Icon: HistoryIcon, description: "Historical scan: the full history was scanned" };
  }

  if (type === SecretScanningDataSource.ClaudeCode) {
    return {
      Icon: MessageSquareIcon,
      description: "Realtime scan: a submitted prompt was scanned"
    };
  }

  return { Icon: GitBranchIcon, description: "Realtime scan: new commits were scanned" };
};

export const SecretScanningScanRow = ({ scan, type: dataSourceType }: Props) => {
  const {
    id,
    resourceName,
    createdAt,
    startedAt,
    completedAt,
    status,
    statusMessage,
    unresolvedFindings,
    resolvedFindings,
    type
  } = scan;
  const totalFindings = resolvedFindings + unresolvedFindings;
  const isHistorical = type === SecretScanningScanType.Historical;
  const scanTypeDetails = getScanTypeDetails(isHistorical, dataSourceType);

  const handleCopyId = () => {
    navigator.clipboard.writeText(id);
    createNotification({ text: "Scan ID copied to clipboard", type: "info" });
  };

  const renderStatus = () => {
    switch (status) {
      case SecretScanningScanStatus.Queued:
        return <Badge variant="neutral">Queued</Badge>;
      case SecretScanningScanStatus.Scanning:
        return (
          <Badge variant="info">
            <RotateCwIcon className="animate-spin" />
            Running
          </Badge>
        );
      case SecretScanningScanStatus.Failed:
        return (
          <SecretScanningScanStatusBadge
            status={status}
            statusMessage={statusMessage}
            scannedAt={completedAt ?? createdAt}
          />
        );
      default:
        return (
          <Badge variant="success">
            <CheckIcon />
            Completed
          </Badge>
        );
    }
  };

  return (
    <TableRow>
      <TableCell isTruncatable>
        <div className="flex min-w-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="neutral" isSquare>
                <scanTypeDetails.Icon />
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{scanTypeDetails.description}</TooltipContent>
          </Tooltip>
          <p className="truncate">{resourceName}</p>
        </div>
      </TableCell>
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>{formatDistanceToNowStrict(new Date(createdAt), { addSuffix: true })}</span>
          </TooltipTrigger>
          <TooltipContent>{format(new Date(createdAt), "MMM d, yyyy h:mm a")}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell>
        {startedAt && completedAt ? (
          formatDistanceStrict(new Date(completedAt), new Date(startedAt))
        ) : (
          <span className="text-muted">-</span>
        )}
      </TableCell>
      <TableCell>
        {status === SecretScanningScanStatus.Completed ? (
          <span className={unresolvedFindings ? "text-danger" : undefined}>{totalFindings}</span>
        ) : (
          <span className="text-muted">-</span>
        )}
      </TableCell>
      <TableCell>{renderStatus()}</TableCell>
      <TableCell variant="action">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Scan options" variant="ghost" size="sm">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyId}>
              <CopyIcon />
              Copy Scan ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
