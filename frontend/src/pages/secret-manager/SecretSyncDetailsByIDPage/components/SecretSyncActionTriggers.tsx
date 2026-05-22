import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  EraserIcon,
  InfoIcon,
  PencilIcon,
  RefreshCwIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DeleteSecretSyncModal,
  SecretSyncImportSecretsModal,
  SecretSyncImportStatusBadge,
  SecretSyncRemoveSecretsModal,
  SecretSyncRemoveStatusBadge
} from "@app/components/secret-syncs";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { usePopUp, useToggle } from "@app/hooks";
import {
  TSecretSync,
  useSecretSyncOption,
  useTriggerSecretSyncSyncSecrets,
  useUpdateSecretSync
} from "@app/hooks/api/secretSyncs";
import { getSecretSyncPermissionSubject } from "@app/lib/fn/permission";
import { IntegrationsListPageTabs } from "@app/types/integrations";

type Props = {
  secretSync: TSecretSync;
  onEdit: () => void;
};

export const SecretSyncActionTriggers = ({ secretSync, onEdit }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "importSecrets",
    "removeSecrets",
    "deleteSync"
  ] as const);

  const navigate = useNavigate();

  const triggerSyncSecrets = useTriggerSecretSyncSyncSecrets();
  const updateSync = useUpdateSecretSync();

  const { destination } = secretSync;
  const { currentOrg } = useOrganization();

  const destinationName = SECRET_SYNC_MAP[destination].name;
  const { syncOption } = useSecretSyncOption(destination);

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(secretSync.id);

    createNotification({
      text: "Secret Sync ID copied to clipboard",
      type: "info"
    });

    const timer = setTimeout(() => setIsIdCopied.off(), 2000);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timer);
  }, [isIdCopied]);

  const handleToggleEnableSync = async () => {
    const isAutoSyncEnabled = !secretSync.isAutoSyncEnabled;

    await updateSync.mutateAsync({
      syncId: secretSync.id,
      destination: secretSync.destination,
      isAutoSyncEnabled,
      projectId: secretSync.projectId
    });

    createNotification({
      text: `Successfully ${isAutoSyncEnabled ? "enabled" : "disabled"} auto-sync for ${destinationName} Sync`,
      type: "success"
    });
  };

  const handleTriggerSync = async () => {
    await triggerSyncSecrets.mutateAsync({
      syncId: secretSync.id,
      destination: secretSync.destination,
      projectId: secretSync.projectId
    });

    createNotification({
      text: `Successfully triggered ${destinationName} Sync`,
      type: "success"
    });
  };

  const permissionSubject = getSecretSyncPermissionSubject(secretSync);

  return (
    <>
      <div className="mt-4 ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
        <SecretSyncImportStatusBadge secretSync={secretSync} />
        <SecretSyncRemoveStatusBadge secretSync={secretSync} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Options
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <ProjectPermissionCan I={ProjectPermissionSecretSyncActions.Edit} a={permissionSubject}>
              {(isAllowed: boolean) => (
                <DropdownMenuItem onClick={onEdit} isDisabled={!isAllowed}>
                  <PencilIcon />
                  Edit Sync
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionSecretSyncActions.SyncSecrets}
              a={permissionSubject}
            >
              {(isAllowed: boolean) => (
                <DropdownMenuItem onClick={handleTriggerSync} isDisabled={!isAllowed}>
                  <RefreshCwIcon />
                  Trigger Sync
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopyId();
              }}
            >
              {isIdCopied ? <CheckIcon /> : <CopyIcon />}
              Copy Sync ID
            </DropdownMenuItem>
            {syncOption?.canImportSecrets && (
              <ProjectPermissionCan
                I={ProjectPermissionSecretSyncActions.ImportSecrets}
                a={permissionSubject}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    onClick={() => handlePopUpOpen("importSecrets")}
                    isDisabled={!isAllowed}
                  >
                    <DownloadIcon />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex h-full w-full items-center justify-between gap-1">
                          <span>Import Secrets</span>
                          <InfoIcon className="text-muted" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={42}>
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
                    onClick={() => handlePopUpOpen("removeSecrets")}
                    isDisabled={!isAllowed}
                  >
                    <EraserIcon />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex h-full w-full items-center justify-between gap-1">
                          <span>Remove Secrets</span>
                          <InfoIcon className="text-muted" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={42}>
                        Remove secrets synced by Infisical from this {destinationName} destination.
                      </TooltipContent>
                    </Tooltip>
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            )}
            <ProjectPermissionCan I={ProjectPermissionSecretSyncActions.Edit} a={permissionSubject}>
              {(isAllowed: boolean) => (
                <DropdownMenuItem isDisabled={!isAllowed} onClick={handleToggleEnableSync}>
                  {secretSync.isAutoSyncEnabled ? <ToggleLeftIcon /> : <ToggleRightIcon />}
                  {secretSync.isAutoSyncEnabled ? "Disable" : "Enable"} Auto-Sync
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
                  onClick={() => handlePopUpOpen("deleteSync")}
                  variant="danger"
                >
                  <Trash2Icon />
                  Delete Sync
                </DropdownMenuItem>
              )}
            </ProjectPermissionCan>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SecretSyncImportSecretsModal
        onOpenChange={(isOpen) => handlePopUpToggle("importSecrets", isOpen)}
        isOpen={popUp.importSecrets.isOpen}
        secretSync={secretSync}
      />
      <SecretSyncRemoveSecretsModal
        onOpenChange={(isOpen) => handlePopUpToggle("removeSecrets", isOpen)}
        isOpen={popUp.removeSecrets.isOpen}
        secretSync={secretSync}
      />
      <DeleteSecretSyncModal
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSync", isOpen)}
        isOpen={popUp.deleteSync.isOpen}
        secretSync={secretSync}
        onComplete={() =>
          navigate({
            to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
            params: {
              orgId: currentOrg.id,
              projectId: secretSync.projectId
            },
            search: {
              selectedTab: IntegrationsListPageTabs.SecretSyncs
            }
          })
        }
      />
    </>
  );
};
