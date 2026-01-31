import { useCallback, useMemo } from "react";
import { subject } from "@casl/ability";
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
import { AlertTriangleIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  SecretSyncImportStatusBadge,
  SecretSyncRemoveStatusBadge,
  SecretSyncStatusBadge
} from "@app/components/secret-syncs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Td,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { useToggle } from "@app/hooks";
import { SecretSyncStatus, TSecretSync, useSecretSyncOption } from "@app/hooks/api/secretSyncs";

import { SecretSyncDestinationCol } from "./SecretSyncDestinationCol";
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
    folder,
    lastSyncMessage,
    destination,
    lastSyncedAt,
    environment,
    name,
    description,
    syncStatus,
    isAutoSyncEnabled,
    projectId
  } = secretSync;

  const { currentOrg } = useOrganization();
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

  const permissionSubject =
    environment && folder
      ? subject(ProjectPermissionSub.SecretSyncs, {
          environment: environment.slug,
          secretPath: folder.path,
          ...(secretSync.connectionId && { connectionId: secretSync.connectionId })
        })
      : ProjectPermissionSub.SecretSyncs;

  return (
    <Tr
      onClick={() =>
        navigate({
          to: ROUTE_PATHS.SecretManager.SecretSyncDetailsByIDPage.path,
          params: {
            syncId: id,
            destination,
            projectId,
            orgId: currentOrg.id
          }
        })
      }
      className={twMerge(
        "group h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700",
        syncStatus === SecretSyncStatus.Failed && "bg-red/5 hover:bg-red/10"
      )}
      key={`sync-${id}`}
    >
      <Td>
        <img
          alt={`${destinationDetails.name} sync`}
          src={`/images/integrations/${destinationDetails.image}`}
          className="min-w-7"
        />
      </Td>
      <Td className="max-w-0 min-w-32!">
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
      {folder && environment ? (
        <SecretSyncTableCell primaryText={folder.path} secondaryText={environment.name} />
      ) : (
        <Td>
          <Tooltip content="The source location for this sync has been deleted. Configure a new source or remove this sync.">
            <Badge variant="danger">
              <AlertTriangleIcon />
              <span>Source Folder Deleted</span>
            </Badge>
          </Tooltip>
        </Td>
      )}
      <SecretSyncDestinationCol secretSync={secretSync} />
      <Td>
        <div className="flex items-center gap-1">
          {syncStatus && (
            <Tooltip
              position="left"
              className="max-w-sm"
              content={
                [SecretSyncStatus.Succeeded, SecretSyncStatus.Failed].includes(syncStatus) ? (
                  <div className="flex flex-col gap-2 py-1 whitespace-normal">
                    {lastSyncedAt && (
                      <div>
                        <div
                          className={`mb-2 flex self-start ${syncStatus === SecretSyncStatus.Failed ? "text-yellow" : "text-green"}`}
                        >
                          <FontAwesomeIcon
                            icon={faCalendarCheck}
                            className="ml-1 pt-0.5 pr-1.5 text-sm"
                          />
                          <div className="text-xs">Last Synced</div>
                        </div>
                        <div className="rounded-sm bg-mineshaft-600 p-2 text-xs">
                          {format(new Date(lastSyncedAt), "yyyy-MM-dd, hh:mm aaa")}
                        </div>
                      </div>
                    )}
                    {failureMessage && (
                      <div>
                        <div className="mb-2 flex self-start text-red">
                          <FontAwesomeIcon icon={faXmark} className="ml-1 pt-0.5 pr-1.5 text-sm" />
                          <div className="text-xs">Failure Reason</div>
                        </div>
                        <div className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">
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
          )}
          {!isAutoSyncEnabled && (
            <Tooltip
              className="text-xs"
              content="Auto-Sync is disabled. Changes to the source location will not be automatically synced to the destination."
            >
              <div>
                <Badge variant="neutral">
                  <FontAwesomeIcon icon={faBan} />
                  {!syncStatus && "Auto-Sync Disabled"}
                </Badge>
              </div>
            </Tooltip>
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
            <DropdownMenuContent sideOffset={2} align="end">
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={isIdCopied ? faCheck : faCopy} />}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyId();
                }}
              >
                Copy Sync ID
              </DropdownMenuItem>
              <ProjectPermissionCan
                I={ProjectPermissionSecretSyncActions.SyncSecrets}
                a={permissionSubject}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    icon={<FontAwesomeIcon icon={faRotate} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTriggerSyncSecrets(secretSync);
                    }}
                    isDisabled={!isAllowed}
                  >
                    <Tooltip
                      position="left"
                      sideOffset={42}
                      content={`Manually trigger a sync for this ${destinationName} destination.`}
                    >
                      <div className="flex h-full w-full items-center justify-between gap-1">
                        <span> Trigger Sync</span>
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
              {syncOption?.canImportSecrets && (
                <ProjectPermissionCan
                  I={ProjectPermissionSecretSyncActions.ImportSecrets}
                  a={permissionSubject}
                >
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      icon={<FontAwesomeIcon icon={faDownload} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTriggerImportSecrets(secretSync);
                      }}
                      isDisabled={!isAllowed}
                    >
                      <Tooltip
                        position="left"
                        sideOffset={42}
                        content={`Import secrets from this ${destinationName} destination into Infisical.`}
                      >
                        <div className="flex h-full w-full items-center justify-between gap-1">
                          <span>Import Secrets</span>
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
              )}
              <ProjectPermissionCan
                I={ProjectPermissionSecretSyncActions.RemoveSecrets}
                a={permissionSubject}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    icon={<FontAwesomeIcon icon={faEraser} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTriggerRemoveSecrets(secretSync);
                    }}
                    isDisabled={!isAllowed}
                  >
                    <Tooltip
                      position="left"
                      sideOffset={42}
                      content={`Remove secrets synced by Infisical from this ${destinationName} destination.`}
                    >
                      <div className="flex h-full w-full items-center justify-between gap-1">
                        <span>Remove Secrets</span>
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
                I={ProjectPermissionSecretSyncActions.Edit}
                a={permissionSubject}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={isAutoSyncEnabled ? faToggleOff : faToggleOn} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleEnable(secretSync);
                    }}
                  >
                    {isAutoSyncEnabled ? "Disable" : "Enable"} Auto-Sync
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionSecretSyncActions.Delete}
                a={permissionSubject}
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
