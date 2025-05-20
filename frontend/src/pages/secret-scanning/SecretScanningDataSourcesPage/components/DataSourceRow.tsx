import {
  faBan,
  faCheck,
  faCopy,
  faEllipsisV,
  faInfoCircle,
  faRotate,
  faToggleOff,
  faToggleOn,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
import { useToggle } from "@app/hooks";
import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningv2";

import {
  AUTO_SYNC_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";

type Props = {
  dataSource: TSecretScanningDataSource;
  onDelete: (dataSource: TSecretScanningDataSource) => void;
  onTriggerScan: (dataSource: TSecretScanningDataSource) => void;
  onToggleEnableAutoScan: (dataSource: TSecretScanningDataSource) => void;
};

export const DataSourceRow = ({
  dataSource,
  onDelete,
  onTriggerScan,
  onToggleEnableAutoScan
}: Props) => {
  const navigate = useNavigate();
  const { id, name, description, isAutoScanEnabled, projectId, type } = dataSource;

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

  const autoScanDescription = AUTO_SYNC_DESCRIPTION_HELPER[type];

  // const failureMessage = useMemo(() => {
  //   if (syncStatus === SecretSyncStatus.Failed) {
  //     if (lastSyncMessage)
  //       try {
  //         return JSON.stringify(JSON.parse(lastSyncMessage), null, 2);
  //       } catch {
  //         return lastSyncMessage;
  //       }

  //     return "An Unknown Error Occurred.";
  //   }
  //   return null;
  // }, [syncStatus, lastSyncMessage]);

  return (
    <Tr
      onClick={() =>
        navigate({
          to: ROUTE_PATHS.SecretManager.SecretSyncDetailsByIDPage.path,
          params: {
            syncId: id,
            type,
            projectId
          }
        })
      }
      className={twMerge(
        "group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
        // syncStatus === SecretSyncStatus.Failed && "bg-red/5 hover:bg-red/10" // TODO
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
      <Td></Td>
      {/* <SecretSyncDestinationCol dataSource={dataSource} /> */}
      <Td>
        <div className="flex w-full items-center gap-1">
          {/* {syncStatus && (
            <Tooltip
              position="left"
              className="max-w-sm"
              content={
                [SecretSyncStatus.Succeeded, SecretSyncStatus.Failed].includes(syncStatus) ? (
                  <div className="flex flex-col gap-2 whitespace-normal py-1">
                    {lastSyncedAt && (
                      <div>
                        <div
                          className={`mb-2 flex self-start ${syncStatus === SecretSyncStatus.Failed ? "text-yellow" : "text-green"}`}
                        >
                          <FontAwesomeIcon
                            icon={faCalendarCheck}
                            className="ml-1 pr-1.5 pt-0.5 text-sm"
                          />
                          <div className="text-xs">Last Synced</div>
                        </div>
                        <div className="rounded bg-mineshaft-600 p-2 text-xs">
                          {format(new Date(lastSyncedAt), "yyyy-MM-dd, hh:mm aaa")}
                        </div>
                      </div>
                    )}
                    {failureMessage && (
                      <div>
                        <div className="mb-2 flex self-start text-red">
                          <FontAwesomeIcon icon={faXmark} className="ml-1 pr-1.5 pt-0.5 text-sm" />
                          <div className="text-xs">Failure Reason</div>
                        </div>
                        <div className="break-words rounded bg-mineshaft-600 p-2 text-xs">
                          {failureMessage}
                        </div>
                      </div>
                    )}
                  </div>
                ) : undefined
              }
            >
              <div>
                <SecretSyncStatusBadge status={syncStatus} />
              </div>
            </Tooltip>
          )} */}
          {!isAutoScanEnabled && (
            <Tooltip
              className="text-xs"
              content={`Auto-Scan is disabled. Scans will not be automatically triggered when a ${autoScanDescription.verb} occurs to ${autoScanDescription.noun} associated with this data source`}
            >
              <div className="ml-auto">
                <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
                  <FontAwesomeIcon icon={faBan} />
                  {true && "Auto-Scan Disabled"}
                  {/* TODO: base on status */}
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
                    icon={<FontAwesomeIcon icon={faRotate} />}
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
                        <span> Trigger Scan</span>
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
