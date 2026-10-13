import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import {
  CircleCheckIcon,
  CopyIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  ScanSearchIcon,
  TrashIcon,
  UnplugIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { SecretScanningScanStatusBadge } from "@app/components/secret-scanning";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  ProviderIcon,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import {
  SecretScanningScanStatus,
  TSecretScanningDataSourceWithDetails
} from "@app/hooks/api/secretScanningV2";

type Props = {
  dataSource: TSecretScanningDataSourceWithDetails;
  onDelete: (dataSource: TSecretScanningDataSourceWithDetails) => void;
  onTriggerScan: (dataSource: TSecretScanningDataSourceWithDetails) => void;
  onToggleEnableAutoScan: (dataSource: TSecretScanningDataSourceWithDetails) => void;
  onEdit: (dataSource: TSecretScanningDataSourceWithDetails) => void;
};

export const SecretScanningDataSourceRow = ({
  dataSource,
  onDelete,
  onEdit,
  onTriggerScan,
  onToggleEnableAutoScan
}: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const {
    id,
    name,
    description,
    isAutoScanEnabled,
    type,
    unresolvedFindings,
    resourceCount,
    lastScannedAt,
    lastScanStatus,
    lastScanStatusMessage,
    isDisconnected
  } = dataSource;
  const sourceDetails = SECRET_SCANNING_DATA_SOURCE_MAP[type];
  const resourceDescription = RESOURCE_DESCRIPTION_HELPER[type];

  const handleCopyId = () => {
    navigator.clipboard.writeText(id);
    createNotification({ text: "Data source ID copied to clipboard", type: "info" });
  };

  const renderLastScan = () => {
    if (lastScanStatus && lastScanStatus !== SecretScanningScanStatus.Completed) {
      return (
        <SecretScanningScanStatusBadge
          status={lastScanStatus}
          statusMessage={lastScanStatusMessage}
          scannedAt={lastScannedAt}
        />
      );
    }

    if (!lastScannedAt) return <span className="text-muted">Never</span>;

    return formatDistanceToNowStrict(new Date(lastScannedAt), { addSuffix: true });
  };

  const renderStatus = () => {
    if (isDisconnected) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="danger">
              <UnplugIcon />
              Disconnected
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            The external data source has been removed and can no longer be scanned. Delete this data
            source and reconnect it.
          </TooltipContent>
        </Tooltip>
      );
    }

    if (!isAutoScanEnabled) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="neutral">
              <PauseIcon />
              Paused
            </Badge>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            Auto-scan is disabled. Scans are not triggered when a {resourceDescription.verb} occurs
            to {resourceDescription.pluralNoun} in this data source.
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Badge variant="success">
        <CircleCheckIcon />
        Active
      </Badge>
    );
  };

  return (
    <TableRow
      onClick={() =>
        navigate({
          to: ROUTE_PATHS.SecretScanning.DataSourceByIdPage.path,
          params: { orgId: currentOrg.id, dataSourceId: id, type }
        })
      }
    >
      <TableCell>
        <div className="flex items-center gap-1.5">
          <ProviderIcon
            alt={`${sourceDetails.name} data source`}
            icon={sourceDetails.image}
            className="size-4"
          />
          {sourceDetails.name}
        </div>
      </TableCell>
      <TableCell isTruncatable>
        <p className="truncate">{name}</p>
        {description && <p className="truncate text-xs text-muted">{description}</p>}
      </TableCell>
      <TableCell>
        {resourceCount}{" "}
        {resourceCount === 1 ? resourceDescription.singularTitle : resourceDescription.pluralTitle}
      </TableCell>
      <TableCell>
        {lastScannedAt ? (unresolvedFindings ?? 0) : <span className="text-muted">-</span>}
      </TableCell>
      <TableCell>{renderLastScan()}</TableCell>
      <TableCell>{renderStatus()}</TableCell>
      <TableCell variant="action" onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Data source options" variant="ghost" size="sm">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopyId}>
              <CopyIcon />
              Copy Data Source ID
            </DropdownMenuItem>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  isDisabled={!isAllowed || isDisconnected}
                  onClick={() => onTriggerScan(dataSource)}
                >
                  <ScanSearchIcon />
                  Trigger Scan
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.Edit}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <>
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    onClick={() => onToggleEnableAutoScan(dataSource)}
                  >
                    {isAutoScanEnabled ? <PauseIcon /> : <PlayIcon />}
                    {isAutoScanEnabled ? "Disable" : "Enable"} Auto-Scan
                  </DropdownMenuItem>
                  <DropdownMenuItem isDisabled={!isAllowed} onClick={() => onEdit(dataSource)}>
                    <PencilIcon />
                    Edit Data Source
                  </DropdownMenuItem>
                </>
              )}
            </ProjectPermissionCan>
            <DropdownMenuSeparator />
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.Delete}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  isDisabled={!isAllowed}
                  variant="danger"
                  onClick={() => onDelete(dataSource)}
                >
                  <TrashIcon />
                  Delete Data Source
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
