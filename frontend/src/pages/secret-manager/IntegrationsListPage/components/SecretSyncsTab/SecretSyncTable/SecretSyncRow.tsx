import { useCallback, useMemo } from "react";
import {
  faBan,
  faCalendarCheck,
  faCheck,
  faCopy,
  faDownload,
  faEllipsisV,
  faEraser,
  faInfoCircle,
  faRotate,
  faToggleOff,
  faToggleOn,
  faTrash,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  SecretSyncImportStatusBadge,
  SecretSyncRemoveStatusBadge,
  SecretSyncStatusBadge
} from "@app/components/secret-syncs";
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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { useToggle } from "@app/hooks";
import { SecretSyncStatus, TSecretSync, useSecretSyncOption } from "@app/hooks/api/secretSyncs";
import { SecretSyncDestinationCol } from "@app/pages/secret-manager/IntegrationsListPage/components/SecretSyncsTab/SecretSyncTable/SecretSyncDestinationCol/SecretSyncDestinationCol";

import { SecretSyncTableCell } from "./SecretSyncTableCell";

type Props = {
  secretSync: TSecretSync;
  onDelete: (secretSync: TSecretSync) => void;
  onTriggerSyncSecrets: (secretSync: TSecretSync) => void;
  onTriggerImportSecrets: (secretSync: TSecretSync) => void;
  onTriggerRemoveSecrets: (secretSync: TSecretSync) => void;
  onToggleEnable: (secretSync: TSecretSync) => void;
};

export const SecretSyncRow = ({
  secretSync,
  onDelete,
  onTriggerSyncSecrets,
  onTriggerImportSecrets,
  onTriggerRemoveSecrets,
  onToggleEnable
}: Props) => {
  const navigate = useNavigate();
  const {
    id,
    folder: { path: secretPath },
    lastSyncMessage,
    destination,
    lastSyncedAt,
    environment,
    name,
    description,
    syncStatus,
    isEnabled,
    projectId
  } = secretSync;

  const { syncOption } = useSecretSyncOption(destination);

  const destinationName = SECRET_SYNC_MAP[destination].name;

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(id);

    createNotification({
      text: "Secret Sync ID copied to clipboard",
      type: "info"
    });

    const timer = setTimeout(() => setIsIdCopied.off(), 2000);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timer);
  }, [isIdCopied]);

  const failureMessage = useMemo(() => {
    if (syncStatus === SecretSyncStatus.Failed) {
      if (lastSyncMessage)
        try {
          return JSON.stringify(JSON.parse(lastSyncMessage), null, 2);
        } catch {
          return lastSyncMessage;
        }

      return "An Unknown Error Occurred.";
    }
    return null;
  }, [syncStatus, lastSyncMessage]);

  const destinationDetails = SECRET_SYNC_MAP[destination];

  return (
    <Tr
      onClick={() =>
        navigate({
          to: ROUTE_PATHS.SecretManager.SecretSyncDetailsByIDPage.path,
          params: {
            syncId: id,
            destination,
            projectId
          }
        })
      }
      className={twMerge(
        "group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700",
        syncStatus === SecretSyncStatus.Failed && "bg-red/5 hover:bg-red/10",
        !isEnabled && "bg-mineshaft-400/15 opacity-50"
      )}
      key={`sync-${id}`}
    >
      <Td>
        <img
          alt={`${destinationDetails.name} sync`}
          src={`/images/integrations/${destinationDetails.image}`}
          className="min-w-[1.75rem]"
        />
      </Td>
      <Td className="!min-w-[8rem] max-w-0">
        <div>
          <div className="flex w-full items-center">
            <p className="truncate">{name}</p>
            {description && (
              <Tooltip content={description}>
                <FontAwesomeIcon
                  icon={faInfoCircle}
                  size="xs"
                  className="ml-1 text-mineshaft-400"
                />
              </Tooltip>
            )}
          </div>
          <p className="truncate text-xs leading-4 text-bunker-300">{destinationDetails.name}</p>
        </div>
      </Td>
      <SecretSyncTableCell primaryText={secretPath} secondaryText={environment.name} />
      <SecretSyncDestinationCol secretSync={secretSync} />
      <Td>
        <div className="flex items-center gap-1">
          {isEnabled ? (
            syncStatus && (
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
                            <FontAwesomeIcon
                              icon={faXmark}
                              className="ml-1 pr-1.5 pt-0.5 text-sm"
                            />
                            <div className="text-xs">Failure Reason</div>
                          </div>
                          <div className="rounded bg-mineshaft-600 p-2 text-xs">
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
            )
          ) : (
            <Badge className="flex w-min items-center gap-1.5 bg-mineshaft-400/50 text-bunker-300">
              <FontAwesomeIcon icon={faBan} />
              <span>Disabled</span>
            </Badge>
          )}
          <SecretSyncImportStatusBadge mini secretSync={secretSync} />
          <SecretSyncRemoveStatusBadge mini secretSync={secretSync} />
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
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyId();
                }}
              >
                Copy Sync ID
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={faRotate} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerSyncSecrets(secretSync);
                }}
              >
                <Tooltip
                  position="left"
                  sideOffset={42}
                  content={`Manually trigger a sync for this ${destinationName} destination.`}
                >
                  <div className="flex h-full w-full items-center justify-between gap-1">
                    <span> Trigger Sync</span>
                    <FontAwesomeIcon className="text-bunker-300" size="sm" icon={faInfoCircle} />
                  </div>
                </Tooltip>
              </DropdownMenuItem>
              {syncOption?.canImportSecrets && (
                <DropdownMenuItem
                  icon={<FontAwesomeIcon icon={faDownload} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTriggerImportSecrets(secretSync);
                  }}
                >
                  <Tooltip
                    position="left"
                    sideOffset={42}
                    content={`Import secrets from this ${destinationName} destination into Infisical.`}
                  >
                    <div className="flex h-full w-full items-center justify-between gap-1">
                      <span>Import Secrets</span>
                      <FontAwesomeIcon className="text-bunker-300" size="sm" icon={faInfoCircle} />
                    </div>
                  </Tooltip>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={faEraser} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerRemoveSecrets(secretSync);
                }}
              >
                <Tooltip
                  position="left"
                  sideOffset={42}
                  content={`Remove secrets synced by Infisical from this ${destinationName} destination.`}
                >
                  <div className="flex h-full w-full items-center justify-between gap-1">
                    <span>Remove Secrets</span>
                    <FontAwesomeIcon className="text-bunker-300" size="sm" icon={faInfoCircle} />
                  </div>
                </Tooltip>
              </DropdownMenuItem>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.SecretSyncs}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={isEnabled ? faToggleOff : faToggleOn} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleEnable(secretSync);
                    }}
                  >
                    {isEnabled ? "Disable" : "Enable"} Sync
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={ProjectPermissionSub.SecretSyncs}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faTrash} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(secretSync);
                    }}
                  >
                    Delete Sync
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
