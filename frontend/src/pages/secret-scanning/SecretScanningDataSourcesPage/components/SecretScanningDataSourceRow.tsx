import { useCallback } from "react";
import { faCheck, faPlugCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { formatDistance } from "date-fns";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  InfoIcon,
  PencilIcon,
  ScanIcon,
  ScanTextIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  TrashIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

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
import { useToggle } from "@app/hooks";
import {
  SecretScanningFindingStatus,
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
  const {
    id,
    name,
    description,
    isAutoScanEnabled,
    projectId,
    type,
    unresolvedFindings,
    lastScannedAt,
    lastScanStatus,
    lastScanStatusMessage,
    isDisconnected
  } = dataSource;
  const { currentOrg } = useOrganization();
  const sourceDetails = SECRET_SCANNING_DATA_SOURCE_MAP[type];

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(id);

    createNotification({
      text: "Data Source ID copied to clipboard",
      type: "info"
    });

    const timer = setTimeout(() => setIsIdCopied.off(), 2000);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timer);
  }, [isIdCopied]);

  const autoScanDescription = RESOURCE_DESCRIPTION_HELPER[type];

  return (
    <TableRow
      onClick={() =>
        navigate({
          to: ROUTE_PATHS.SecretScanning.DataSourceByIdPage.path,
          params: {
            orgId: currentOrg.id,
            dataSourceId: id,
            type,
            projectId
          }
        })
      }
      className={twMerge(
        "group",
        lastScanStatus === SecretScanningScanStatus.Failed && "bg-danger/5 hover:bg-danger/10"
      )}
      key={`data-source-${id}`}
    >
      <TableCell isTruncatable className="min-w-32">
        <div className="flex w-full items-center">
          <ProviderIcon
            alt={`${sourceDetails.name} Data Source`}
            icon={sourceDetails.image}
            className="w-5"
          />
          <p className="ml-2 truncate">{sourceDetails.name}</p>
        </div>
      </TableCell>
      <TableCell isTruncatable className="min-w-32">
        <div className="flex w-full items-center">
          <p className="truncate">{name}</p>
          {description && (
            <Tooltip hoverable delayDuration={50}>
              <TooltipTrigger asChild>
                <InfoIcon className="ml-1 size-3 shrink-0 text-muted" />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">{description}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell>
        {/* eslint-disable-next-line no-nested-ternary */}
        {lastScanStatus?.match(/queued|scanning/) ? (
          <Badge variant="neutral">
            <ScanTextIcon />
            Scanning For Leaks
          </Badge>
        ) : // eslint-disable-next-line no-nested-ternary
        lastScannedAt ? (
          // eslint-disable-next-line no-nested-ternary
          unresolvedFindings ? (
            <Badge variant="warning" asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate({
                    to: "/organizations/$orgId/projects/secret-scanning/$projectId/findings",
                    params: {
                      orgId: currentOrg.id,
                      projectId
                    },
                    search: {
                      search: name,
                      status: SecretScanningFindingStatus.Unresolved
                    }
                  });
                }}
              >
                <AlertTriangleIcon />
                {unresolvedFindings} Secret{unresolvedFindings > 1 ? "s" : ""} Detected
              </button>
            </Badge>
          ) : lastScanStatus === SecretScanningScanStatus.Failed ? (
            <span className="text-muted">No findings</span>
          ) : (
            <Badge variant="success">
              <FontAwesomeIcon icon={faCheck} />
              No Secrets Detected
            </Badge>
          )
        ) : (
          <span className="text-muted">No findings</span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex w-full items-center gap-1">
          {/* eslint-disable-next-line no-nested-ternary */}
          {lastScanStatus?.match(/queued|scanning|failed/) ? (
            <SecretScanningScanStatusBadge
              status={lastScanStatus}
              statusMessage={lastScanStatusMessage}
              scannedAt={lastScannedAt}
            />
          ) : lastScannedAt ? (
            <span>{formatDistance(new Date(lastScannedAt), new Date(), { addSuffix: true })}</span>
          ) : (
            <span className="text-muted">No scans</span>
          )}
          {!isAutoScanEnabled && !isDisconnected && (
            <Tooltip hoverable delayDuration={50}>
              <TooltipTrigger asChild>
                <Badge className="ml-auto" variant="neutral">
                  <BanIcon />
                  Auto-Scan Disabled
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                Auto-Scan is disabled. Scans will not be automatically triggered when a{" "}
                {autoScanDescription.verb} occurs to {autoScanDescription.pluralNoun} associated
                with this data source
              </TooltipContent>
            </Tooltip>
          )}
          {isDisconnected && (
            <Tooltip hoverable delayDuration={50}>
              <TooltipTrigger asChild>
                <div className="ml-auto">
                  <Badge
                    variant="danger"
                    className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
                  >
                    <FontAwesomeIcon icon={faPlugCircleXmark} />
                    <span>Disconnected</span>
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                The external data source has been removed and can no longer be scanned. Delete this
                data source and re-initialize the connection.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell variant="action">
        <DropdownMenu>
          <Tooltip hoverable delayDuration={50}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Options" variant="ghost" size="xs">
                  <EllipsisVerticalIcon />
                </IconButton>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Options</TooltipContent>
          </Tooltip>
          <DropdownMenuContent sideOffset={2} align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopyId();
              }}
            >
              {isIdCopied ? <CheckIcon /> : <CopyIcon />}
              Copy Data Source ID
            </DropdownMenuItem>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <Tooltip hoverable delayDuration={50}>
                  <TooltipTrigger asChild>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerScan(dataSource);
                      }}
                      isDisabled={!isAllowed}
                    >
                      <ScanIcon />
                      Trigger Scan
                      <InfoIcon className="ml-auto text-muted" />
                    </DropdownMenuItem>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    Manually trigger a scan for this {sourceDetails.name} data source.
                  </TooltipContent>
                </Tooltip>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.Edit}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  isDisabled={!isAllowed}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleEnableAutoScan(dataSource);
                  }}
                >
                  {isAutoScanEnabled ? <ToggleLeftIcon /> : <ToggleRightIcon />}
                  {isAutoScanEnabled ? "Disable" : "Enable"} Auto-Scan
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.Edit}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  isDisabled={!isAllowed}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(dataSource);
                  }}
                >
                  <PencilIcon />
                  Edit Data Source
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.Delete}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  variant="danger"
                  isDisabled={!isAllowed}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(dataSource);
                  }}
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
