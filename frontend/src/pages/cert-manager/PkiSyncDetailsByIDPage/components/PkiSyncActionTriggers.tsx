import { useCallback } from "react";
import { subject } from "@casl/ability";
import {
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
import { BanIcon, RefreshCwIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DeletePkiSyncModal,
  PkiSyncImportCertificatesModal,
  PkiSyncImportStatusBadge,
  PkiSyncRemoveCertificatesModal,
  PkiSyncRemoveStatusBadge
} from "@app/components/pki-syncs";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { usePopUp, useToggle } from "@app/hooks";
import {
  TPkiSync,
  usePkiSyncOption,
  useTriggerPkiSyncSyncCertificates,
  useUpdatePkiSync
} from "@app/hooks/api/pkiSyncs";
import { IntegrationsListPageTabs } from "@app/types/integrations";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncActionTriggers = ({ pkiSync }: Props) => {
  const { destination, subscriberId, projectId, id } = pkiSync;

  const navigate = useNavigate();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "importCertificates",
    "removeCertificates",
    "deleteSync"
  ] as const);

  const [isIdCopied, setIsIdCopied] = useToggle(false);

  // API mutations
  const triggerSyncMutation = useTriggerPkiSyncSyncCertificates();
  const updatePkiSyncMutation = useUpdatePkiSync();

  const { syncOption } = usePkiSyncOption(destination);
  const { currentOrg } = useOrganization();

  const destinationName = PKI_SYNC_MAP[destination].name;

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(pkiSync.id);

    createNotification({
      text: "PKI Sync ID copied to clipboard",
      type: "info"
    });

    const timer = setTimeout(() => setIsIdCopied.off(), 2000);
    return () => clearTimeout(timer);
  }, [pkiSync.id, setIsIdCopied]);

  const handleTriggerSync = useCallback(async () => {
    await triggerSyncMutation.mutateAsync({
      syncId: id,
      destination,
      projectId
    });
    createNotification({
      text: "PKI sync job queued successfully",
      type: "success"
    });
  }, [triggerSyncMutation, id, destination, projectId]);

  const handleToggleAutoSync = useCallback(async () => {
    await updatePkiSyncMutation.mutateAsync({
      syncId: id,
      projectId,
      destination,
      isAutoSyncEnabled: !pkiSync.isAutoSyncEnabled
    });
    createNotification({
      text: `Auto-sync ${pkiSync.isAutoSyncEnabled ? "disabled" : "enabled"} successfully`,
      type: "success"
    });
  }, [updatePkiSyncMutation, id, projectId, pkiSync.isAutoSyncEnabled]);

  const permissionSubject = subject(ProjectPermissionSub.PkiSyncs, {
    subscriberId: subscriberId || "",
    subscriberName: destinationName,
    name: pkiSync.name
  });

  return (
    <>
      <div className="mt-4 ml-auto flex flex-wrap items-center justify-end gap-2">
        {syncOption?.canImportCertificates && <PkiSyncImportStatusBadge pkiSync={pkiSync} />}
        <PkiSyncRemoveStatusBadge pkiSync={pkiSync} />
        {pkiSync.isAutoSyncEnabled ? (
          <Badge variant="info">
            <RefreshCwIcon />
            Auto-Sync Enabled
          </Badge>
        ) : (
          <Tooltip
            className="text-xs"
            content="Auto-Sync is disabled. Certificate changes in the PKI subscriber will not be automatically synced to the destination."
          >
            <Badge variant="neutral">
              <BanIcon />
              Auto-Sync Disabled
            </Badge>
          </Tooltip>
        )}
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionPkiSyncActions.SyncCertificates}
            a={permissionSubject}
          >
            {(isAllowed: boolean) => (
              <Button
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faRotate} />}
                className="h-9 rounded-r-none bg-mineshaft-500"
                isDisabled={!isAllowed || triggerSyncMutation.isPending}
                isLoading={triggerSyncMutation.isPending}
                onClick={handleTriggerSync}
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

              {syncOption?.canImportCertificates && (
                <ProjectPermissionCan
                  I={ProjectPermissionPkiSyncActions.ImportCertificates}
                  a={permissionSubject}
                >
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      icon={<FontAwesomeIcon icon={faDownload} />}
                      onClick={() => handlePopUpOpen("importCertificates")}
                      isDisabled={!isAllowed}
                    >
                      <Tooltip
                        position="left"
                        sideOffset={42}
                        content={`Import certificates from this ${destinationName} destination into Infisical.`}
                      >
                        <div className="flex h-full w-full items-center justify-between gap-1">
                          <span>Import Certificates</span>
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
                I={ProjectPermissionPkiSyncActions.RemoveCertificates}
                a={permissionSubject}
              >
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    icon={<FontAwesomeIcon icon={faEraser} />}
                    onClick={() => handlePopUpOpen("removeCertificates")}
                    isDisabled={!isAllowed}
                  >
                    <Tooltip
                      position="left"
                      sideOffset={42}
                      content={`Remove certificates synced by Infisical from this ${destinationName} destination.`}
                    >
                      <div className="flex h-full w-full items-center justify-between gap-1">
                        <span>Remove Certificates</span>
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

              <ProjectPermissionCan I={ProjectPermissionPkiSyncActions.Edit} a={permissionSubject}>
                {(isAllowed: boolean) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed || updatePkiSyncMutation.isPending}
                    icon={
                      <FontAwesomeIcon
                        icon={pkiSync.isAutoSyncEnabled ? faToggleOff : faToggleOn}
                      />
                    }
                    onClick={handleToggleAutoSync}
                  >
                    {pkiSync.isAutoSyncEnabled ? "Disable" : "Enable"} Auto-Sync
                  </DropdownMenuItem>
                )}
              </ProjectPermissionCan>

              <ProjectPermissionCan
                I={ProjectPermissionPkiSyncActions.Delete}
                a={permissionSubject}
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

      {syncOption?.canImportCertificates && (
        <PkiSyncImportCertificatesModal
          onOpenChange={(isOpen) => handlePopUpToggle("importCertificates", isOpen)}
          isOpen={popUp.importCertificates.isOpen}
          pkiSync={pkiSync}
        />
      )}
      <PkiSyncRemoveCertificatesModal
        onOpenChange={(isOpen) => handlePopUpToggle("removeCertificates", isOpen)}
        isOpen={popUp.removeCertificates.isOpen}
        pkiSync={pkiSync}
      />
      <DeletePkiSyncModal
        onOpenChange={(isOpen) => handlePopUpToggle("deleteSync", isOpen)}
        isOpen={popUp.deleteSync.isOpen}
        pkiSync={pkiSync}
        onComplete={() =>
          navigate({
            to: ROUTE_PATHS.CertManager.IntegrationsListPage.path,
            params: {
              projectId,
              orgId: currentOrg.id
            },
            search: {
              selectedTab: IntegrationsListPageTabs.PkiSyncs
            }
          })
        }
      />
    </>
  );
};
