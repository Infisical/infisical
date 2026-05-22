import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  BanIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EraserIcon,
  InfoIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  Trash2Icon
} from "lucide-react";
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
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { useToggle } from "@app/hooks";
import { SecretSyncStatus, TSecretSync, useSecretSyncOption } from "@app/hooks/api/secretSyncs";
import { getSecretSyncPermissionSubject } from "@app/lib/fn/permission";

import { SecretSyncDestinationCol } from "./SecretSyncDestinationCol";

type Props = {
  secretSync: TSecretSync;
  onDelete: (secretSync: TSecretSync) => void;
  onTriggerSyncSecrets: (secretSync: TSecretSync) => void;
  onTriggerImportSecrets: (secretSync: TSecretSync) => void;
  onTriggerRemoveSecrets: (secretSync: TSecretSync) => void;
  onToggleEnable: (secretSync: TSecretSync) => void;
};

const SecretSyncDestinationSourceCell = ({
  folderPath,
  environmentName
}: {
  folderPath: string;
  environmentName: string;
}) => {
  return (
    <TableCell className="max-w-0 min-w-32!">
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <p className="truncate text-sm">{folderPath}</p>
            <p className="truncate text-xs leading-4 text-accent">{environmentName}</p>
          </div>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-2xl break-words">
          <p className="text-sm">{folderPath}</p>
          <p className="text-xs leading-3 text-accent">{environmentName}</p>
        </TooltipContent>
      </Tooltip>
    </TableCell>
  );
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

  const destinationDetails = SECRET_SYNC_MAP[destination];

  const permissionSubject = getSecretSyncPermissionSubject(secretSync);

  return (
    <TableRow
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
        "group h-12",
        syncStatus === SecretSyncStatus.Failed && "bg-red/5 hover:bg-red/10"
      )}
    >
      <TableCell>
        <img
          alt={`${destinationDetails.name} sync`}
          src={`/images/integrations/${destinationDetails.image}`}
          className="size-6 min-w-6"
        />
      </TableCell>
      <TableCell className="max-w-0 min-w-32!">
        <div>
          <div className="flex w-full items-center">
            <p className="truncate">{name}</p>
            {description && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="ml-1 size-3 text-accent" />
                </TooltipTrigger>
                <TooltipContent>{description}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="truncate text-xs leading-4 text-accent">{destinationDetails.name}</p>
        </div>
      </TableCell>
      {folder && environment ? (
        <SecretSyncDestinationSourceCell
          folderPath={folder.path}
          environmentName={environment.name}
        />
      ) : (
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="danger">
                <AlertTriangleIcon />
                <span>Source Folder Deleted</span>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              The source location for this sync has been deleted. Configure a new source or remove
              this sync.
            </TooltipContent>
          </Tooltip>
        </TableCell>
      )}
      <SecretSyncDestinationCol secretSync={secretSync} />
      <TableCell>
        <div className="flex items-center gap-1">
          {syncStatus && (
            <SecretSyncStatusBadge
              status={syncStatus}
              lastSyncedAt={lastSyncedAt}
              lastSyncMessage={lastSyncMessage}
            />
          )}
          {!isAutoSyncEnabled && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="neutral">
                  <BanIcon />
                  {!syncStatus && "Auto-Sync Disabled"}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                Auto-Sync is disabled. Changes to the source location will not be automatically
                synced to the destination.
              </TooltipContent>
            </Tooltip>
          )}
          <SecretSyncImportStatusBadge mini secretSync={secretSync} />
          <SecretSyncRemoveStatusBadge mini secretSync={secretSync} />
        </div>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger>
              <DropdownMenuTrigger asChild>
                <IconButton
                  variant="ghost"
                  size="xs"
                  aria-label="Options"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontalIcon />
                </IconButton>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Options</TooltipContent>
          </Tooltip>
          <DropdownMenuContent sideOffset={2} align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCopyId();
              }}
            >
              {isIdCopied ? <CheckIcon /> : <CopyIcon />}
              Copy Sync ID
            </DropdownMenuItem>
            <ProjectPermissionCan
              I={ProjectPermissionSecretSyncActions.SyncSecrets}
              a={permissionSubject}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  isDisabled={!isAllowed}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTriggerSyncSecrets(secretSync);
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <RefreshCwIcon />
                          Trigger Sync
                        </span>
                        <InfoIcon className="size-3.5 text-bunker-300" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={20}>
                      Manually trigger a sync for this {destinationName} destination.
                    </TooltipContent>
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
                    isDisabled={!isAllowed}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTriggerImportSecrets(secretSync);
                    }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <DownloadIcon />
                            Import Secrets
                          </span>
                          <InfoIcon className="size-3.5 text-bunker-300" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={20}>
                        Import secrets from this {destinationName} destination into Infisical.
                      </TooltipContent>
                    </Tooltip>
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            )}
            {syncOption?.canRemoveSecretsOnDeletion && (
              <ProjectPermissionCan
                I={ProjectPermissionSecretSyncActions.RemoveSecrets}
                a={permissionSubject}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTriggerRemoveSecrets(secretSync);
                    }}
                  >
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <EraserIcon />
                            Remove Secrets
                          </span>
                          <InfoIcon className="size-3.5 text-bunker-300" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={20}>
                        Remove secrets synced by Infisical from this {destinationName} destination.
                      </TooltipContent>
                    </Tooltip>
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            )}
            <ProjectPermissionCan I={ProjectPermissionSecretSyncActions.Edit} a={permissionSubject}>
              {(isAllowed: boolean) => (
                <DropdownMenuItem
                  isDisabled={!isAllowed}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleEnable(secretSync);
                  }}
                >
                  {isAutoSyncEnabled ? <ToggleLeftIcon /> : <ToggleRightIcon />}
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
                  variant="danger"
                  isDisabled={!isAllowed}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(secretSync);
                  }}
                >
                  <Trash2Icon />
                  Delete Sync
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
