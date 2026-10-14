import { formatDistanceToNowStrict } from "date-fns";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  CopyIcon,
  MoreHorizontalIcon,
  ScanSearchIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  isSecretScanningResourceIncluded,
  RESOURCE_DESCRIPTION_HELPER
} from "@app/helpers/secretScanningV2";
import {
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  TSecretScanningResourceWithDetails,
  useTriggerSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

type Props = {
  resource: TSecretScanningResourceWithDetails;
  dataSource: TSecretScanningDataSource;
  onViewFindings: (resourceId: string) => void;
};

export const SecretScanningResourceRow = ({ resource, dataSource, onViewFindings }: Props) => {
  const { id, name, lastScannedAt, lastScanStatus, unresolvedFindings, lastScanStatusMessage } =
    resource;

  const isIncluded = isSecretScanningResourceIncluded(dataSource, name);
  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  const triggerDataSourceScan = useTriggerSecretScanningDataSource();

  const handleTriggerScan = async () => {
    await triggerDataSourceScan.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId,
      resourceId: id
    });

    createNotification({
      text: `Scan triggered for "${name}"`,
      type: "success"
    });
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(id);
    createNotification({ text: "Resource ID copied to clipboard", type: "info" });
  };

  const renderStatus = () => {
    if (!isIncluded) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="neutral">
              <BanIcon />
              Excluded
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            This {resourceDetails.singularNoun} is excluded in the data source configuration and
            won&apos;t be scanned.
          </TooltipContent>
        </Tooltip>
      );
    }

    if (lastScanStatus && lastScanStatus !== SecretScanningScanStatus.Completed) {
      return (
        <SecretScanningScanStatusBadge
          status={lastScanStatus}
          statusMessage={lastScanStatusMessage}
          scannedAt={lastScannedAt}
        />
      );
    }

    if (!lastScannedAt) return <span className="text-muted">Not scanned</span>;

    if (unresolvedFindings) {
      return (
        <Badge variant="warning">
          <AlertTriangleIcon />
          {unresolvedFindings} {unresolvedFindings === 1 ? "Finding" : "Findings"}
        </Badge>
      );
    }

    return (
      <Badge variant="success">
        <CheckIcon />
        No Secrets Detected
      </Badge>
    );
  };

  return (
    <TableRow onClick={() => onViewFindings(id)}>
      <TableCell isTruncatable>
        <p className="truncate">{name}</p>
      </TableCell>
      <TableCell>{renderStatus()}</TableCell>
      <TableCell>
        {lastScannedAt ? (
          formatDistanceToNowStrict(new Date(lastScannedAt), { addSuffix: true })
        ) : (
          <span className="text-muted">Never</span>
        )}
      </TableCell>
      <TableCell variant="action" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label={`${resourceDetails.singularTitle} options`}
              variant="ghost"
              size="sm"
            >
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyId}>
              <CopyIcon />
              Copy {resourceDetails.singularTitle} ID
            </DropdownMenuItem>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  isDisabled={!isAllowed || !isIncluded || dataSource.isDisconnected}
                  onClick={handleTriggerScan}
                >
                  <ScanSearchIcon />
                  Trigger Scan
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
