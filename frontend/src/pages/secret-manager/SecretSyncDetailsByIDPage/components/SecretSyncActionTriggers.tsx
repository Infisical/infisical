import { useCallback } from "react";
import {
  faBan,
  faCheck,
  faCopy,
  faDownload,
  faEllipsisV,
  faEraser,
  faInfoCircle,
  faRotate,
  faToggleOff,
  faToggleOn,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

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
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { usePopUp, useToggle } from "@app/hooks";
import {
  TSecretSync,
  useSecretSyncOption,
  useTriggerSecretSyncSyncSecrets,
  useUpdateSecretSync
} from "@app/hooks/api/secretSyncs";
import { IntegrationsListPageTabs } from "@app/types/integrations";

type Props = {
  secretSync: TSecretSync;
};

export const SecretSyncActionTriggers = ({ secretSync }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "importSecrets",
    "removeSecrets",
    "deleteSync"
  ] as const);

  const navigate = useNavigate();

  const triggerSyncSecrets = useTriggerSecretSyncSyncSecrets();
  const updateSync = useUpdateSecretSync();

  const { destination } = secretSync;

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

    try {
      await updateSync.mutateAsync({
        syncId: secretSync.id,
        destination: secretSync.destination,
        isAutoSyncEnabled
      });

      createNotification({
        text: `Successfully ${isAutoSyncEnabled ? "enabled" : "disabled"} auto-sync for ${destinationName} Sync`,
        type: "success"
      });
    } catch {
      createNotification({
        text: `Failed to ${isAutoSyncEnabled ? "enable" : "disable"} auto-sync for ${destinationName} Sync`,
        type: "error"
      });
    }
  };

  const handleTriggerSync = async () => {
    try {
      await triggerSyncSecrets.mutateAsync({
        syncId: secretSync.id,
        destination: secretSync.destination
      });

      createNotification({
        text: `Successfully triggered ${destinationName} Sync`,
        type: "success"
      });
    } catch {
      createNotification({
        text: `Failed to trigger ${destinationName} Sync`,
        type: "error"
      });
    }
  };

  return (
    <>
      <div className="ml-auto mt-4 flex flex-wrap items-center justify-end gap-2">
        <SecretSyncImportStatusBadge secretSync={secretSync} />
        <SecretSyncRemoveStatusBadge secretSync={secretSync} />
        {secretSync.isAutoSyncEnabled ? (
          <Badge
            variant="success"
            className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
          >
            <FontAwesomeIcon icon={faRotate} />
            <span>Auto-Sync Enabled</span>
          </Badge>
        ) : (
          <Tooltip
            className="text-xs"
            content="Auto-Sync is disabled. Changes to the source location will not be automatically synced to the destination."
          >
            <div>
              <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
                <FontAwesomeIcon icon={faBan} />
                <span>Auto-Sync Disabled</span>
              </Badge>
            </div>
          </Tooltip>
        )}
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionSecretSyncActions.SyncSecrets}
            a={ProjectPermissionSub.SecretSyncs}
          >
            {(isAllowed: boolean) => (
              <Button
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faRotate} />}
                onClick={handleTriggerSync}
                className="h-9 rounded-r-none bg-mineshaft-500"
                isDisabled={!isAllowed}
              >
                Trigger Sync
              </Button>
            )}
          </ProjectPermissionCan>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="add-folder-or-import"
                variant="outline_bg"
                className="h-9 w-10 rounded-l-none border-l-2 border-mineshaft border-l-mineshaft-700 bg-mineshaft-500"
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
              {syncOption?.canImportSecrets && (
                <ProjectPermissionCan
                  I={ProjectPermissionSecretSyncActions.ImportSecrets}
                  a={ProjectPermissionSub.SecretSyncs}
                >
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      icon={<FontAwesomeIcon icon={faDownload} />}
                      onClick={() => handlePopUpOpen("importSecrets")}
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
                a={ProjectPermissionSub.SecretSyncs}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    icon={<FontAwesomeIcon icon={faEraser} />}
                    onClick={() => handlePopUpOpen("removeSecrets")}
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
                a={ProjectPermissionSub.SecretSyncs}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={
                      <FontAwesomeIcon
                        icon={secretSync.isAutoSyncEnabled ? faToggleOff : faToggleOn}
                      />
                    }
                    onClick={handleToggleEnableSync}
                  >
                    {secretSync.isAutoSyncEnabled ? "Disable" : "Enable"} Auto-Sync
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionSecretSyncActions.Delete}
                a={ProjectPermissionSub.SecretSyncs}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faTrash} />}
                    onClick={() => handlePopUpOpen("deleteSync")}
                  >
                    Delete Sync
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
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
