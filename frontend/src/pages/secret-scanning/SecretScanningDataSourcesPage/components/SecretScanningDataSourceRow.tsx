import { useCallback } from "react";
import {
  faBan,
  faCheck,
  faCopy,
  faEdit,
  faEllipsisV,
  faExpand,
  faInfoCircle,
  faPlugCircleXmark,
  faSearch,
  faToggleOff,
  faToggleOn,
  faTrash,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { formatDistance } from "date-fns";
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
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub } from "@app/context";
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
    <Tr
      onClick={() =>
        navigate({
          to: ROUTE_PATHS.SecretScanning.DataSourceByIdPage.path,
          params: {
            dataSourceId: id,
            type,
            projectId
          }
        })
      }
      className={twMerge(
        "group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700",
        lastScanStatus === SecretScanningScanStatus.Failed && "bg-red/5 hover:bg-red/10"
      )}
      key={`data-source-${id}`}
    >
      <Td className="!min-w-[8rem] max-w-0">
        <div className="flex w-full items-center">
          <img
            alt={`${sourceDetails.name} Data Source`}
            src={`/images/integrations/${sourceDetails.image}`}
            className="w-5"
          />
          <p className="ml-2 truncate">{sourceDetails.name}</p>
        </div>
      </Td>
      <Td className="!min-w-[8rem] max-w-0">
        <div className="flex w-full items-center">
          <p className="truncate">{name}</p>
          {description && (
            <Tooltip content={description}>
              <FontAwesomeIcon icon={faInfoCircle} size="xs" className="ml-1 text-mineshaft-400" />
            </Tooltip>
          )}
        </div>
      </Td>
      <Td>
        {/* eslint-disable-next-line no-nested-ternary */}
        {lastScanStatus?.match(/queued|scanning/) ? (
          <Badge
            variant="primary"
            className="flex h-5 w-min animate-pulse items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300"
          >
            <FontAwesomeIcon icon={faSearch} />
            <span>Scanning For Leaks</span>
          </Badge>
        ) : // eslint-disable-next-line no-nested-ternary
        lastScannedAt ? (
          // eslint-disable-next-line no-nested-ternary
          unresolvedFindings ? (
            <Badge
              variant="primary"
              className="flex h-5 w-min cursor-pointer items-center gap-1.5 whitespace-nowrap"
              onClick={(e) => {
                e.stopPropagation();
                navigate({
                  to: "/projects/$projectId/secret-scanning/findings",
                  params: {
                    projectId
                  },
                  search: {
                    search: name,
                    status: SecretScanningFindingStatus.Unresolved
                  }
                });
              }}
            >
              <FontAwesomeIcon icon={faWarning} />
              <span>
                {unresolvedFindings} Secret{unresolvedFindings > 1 ? "s" : ""} Detected
              </span>
            </Badge>
          ) : lastScanStatus === SecretScanningScanStatus.Failed ? (
            <span className="text-mineshaft-400">No findings</span>
          ) : (
            <Badge
              variant="success"
              className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faCheck} />
              No Secrets Detected
            </Badge>
          )
        ) : (
          <span className="text-mineshaft-400">No findings</span>
        )}
      </Td>
      <Td>
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
            <span className="text-mineshaft-400">No scans</span>
          )}
          {!isAutoScanEnabled && !isDisconnected && (
            <Tooltip
              className="text-xs"
              content={`Auto-Scan is disabled. Scans will not be automatically triggered when a ${autoScanDescription.verb} occurs to ${autoScanDescription.pluralNoun} associated with this data source`}
            >
              <div className="ml-auto">
                <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
                  <FontAwesomeIcon icon={faBan} />
                  <span>Auto-Scan Disabled</span>
                </Badge>
              </div>
            </Tooltip>
          )}
          {isDisconnected && (
            <Tooltip
              className="text-xs"
              content="The external data source has been removed and can no longer be scanned. Delete this data source and re-initialize the connection."
            >
              <div className="ml-auto">
                <Badge
                  variant="danger"
                  className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
                >
                  <FontAwesomeIcon icon={faPlugCircleXmark} />
                  <span>Disconnected</span>
                </Badge>
              </div>
            </Tooltip>
          )}
        </div>
      </Td>
      <Td>
        <Tooltip className="max-w-sm text-center" content="Options">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="Options"
                colorSchema="secondary"
                className="w-6"
                variant="plain"
              >
                <FontAwesomeIcon icon={faEllipsisV} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={2} align="end">
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyId();
                }}
              >
                Copy Data Source ID
              </DropdownMenuItem>
              <ProjectPermissionCan
                I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
                a={ProjectPermissionSub.SecretScanningDataSources}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    icon={<FontAwesomeIcon icon={faExpand} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTriggerScan(dataSource);
                    }}
                    isDisabled={!isAllowed}
                  >
                    <Tooltip
                      position="left"
                      sideOffset={42}
                      content={`Manually trigger a scan for this ${sourceDetails.name} data source.`}
                    >
                      <div className="flex h-full w-full items-center justify-between gap-1">
                        <span>Trigger Scan</span>
                        <FontAwesomeIcon
                          className="text-bunker-300"
                          size="sm"
                          icon={faInfoCircle}
                        />
                      </div>
                    </Tooltip>
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
                    icon={<FontAwesomeIcon icon={isAutoScanEnabled ? faToggleOff : faToggleOn} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleEnableAutoScan(dataSource);
                    }}
                  >
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
                    icon={<FontAwesomeIcon icon={faEdit} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(dataSource);
                    }}
                  >
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
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faTrash} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(dataSource);
                    }}
                  >
                    Delete Data Source
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </Tooltip>
      </Td>
    </Tr>
  );
};
