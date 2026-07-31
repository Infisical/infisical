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
  Trash2Icon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  DeletePkiSyncModal,
  PkiSyncImportCertificatesModal,
  PkiSyncRemoveCertificatesModal
} from "@app/components/pki-syncs";
import {
  Button,
  ButtonGroup,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Label,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { usePopUp, useToggle } from "@app/hooks";
import {
  TPkiSync,
  usePkiSyncOption,
  usePkiSyncPermissions,
  useTriggerPkiSyncSyncCertificates,
  useUpdatePkiSync
} from "@app/hooks/api/pkiSyncs";
import { IntegrationsListPageTabs } from "@app/types/integrations";

type Props = {
  pkiSync: TPkiSync;
  onEdit: () => void;
};

export const PkiSyncActionTriggers = ({ pkiSync, onEdit }: Props) => {
  const { destination, projectId, id } = pkiSync;

  const navigate = useNavigate();
  const {
    canEdit: canEditSync,
    canDelete: canDeleteSync,
    canTriggerSync,
    canImportCertificates,
    canRemoveCertificates
  } = usePkiSyncPermissions(pkiSync);
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "importCertificates",
    "removeCertificates",
    "deleteSync"
  ] as const);

  const [isIdCopied, setIsIdCopied] = useToggle(false);

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

  const handleAutoSyncChange = useCallback(
    async (isAutoSyncEnabled: boolean) => {
      if (isAutoSyncEnabled === pkiSync.isAutoSyncEnabled) return;

      try {
        await updatePkiSyncMutation.mutateAsync({
          syncId: id,
          projectId,
          destination,
          isAutoSyncEnabled
        });
        createNotification({
          text: `Auto-sync ${isAutoSyncEnabled ? "enabled" : "disabled"} successfully`,
          type: "success"
        });
      } catch {
        createNotification({
          text: "Failed to update auto-sync setting",
          type: "error"
        });
      }
    },
    [updatePkiSyncMutation, id, projectId, destination, pkiSync.isAutoSyncEnabled]
  );

  return (
    <>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto">
        <div className="flex items-center gap-2 sm:mr-2">
          <Switch
            id="pki-auto-sync"
            variant="success"
            checked={pkiSync.isAutoSyncEnabled}
            onCheckedChange={handleAutoSyncChange}
            disabled={!canEditSync || updatePkiSyncMutation.isPending}
          />
          <Label htmlFor="pki-auto-sync" className="whitespace-nowrap">
            Auto-Sync
          </Label>
        </div>
        <ButtonGroup className="w-full sm:w-fit">
          <Button
            variant="outline"
            className="min-w-0 flex-1 sm:flex-none"
            isDisabled={!canTriggerSync || triggerSyncMutation.isPending}
            isPending={triggerSyncMutation.isPending}
            onClick={handleTriggerSync}
          >
            <RefreshCwIcon />
            Sync now
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="PKI sync options" variant="outline" className="shrink-0">
                <EllipsisIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit} isDisabled={!canEditSync}>
                <PencilIcon />
                Edit Sync
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyId();
                }}
              >
                {isIdCopied ? <CheckIcon /> : <CopyIcon />}
                Copy Sync ID
              </DropdownMenuItem>
              {syncOption?.canImportCertificates && (
                <DropdownMenuItem
                  onClick={() => handlePopUpOpen("importCertificates")}
                  isDisabled={!canImportCertificates}
                >
                  <DownloadIcon />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex h-full w-full items-center justify-between gap-2">
                        <span>Import Certificates</span>
                        <InfoIcon className="size-3.5 text-muted" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={14}>
                      Import certificates from this {destinationName} destination into Infisical.
                    </TooltipContent>
                  </Tooltip>
                </DropdownMenuItem>
              )}
              {syncOption?.canRemoveCertificates && (
                <DropdownMenuItem
                  onClick={() => handlePopUpOpen("removeCertificates")}
                  isDisabled={!canRemoveCertificates}
                >
                  <EraserIcon />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex h-full w-full items-center justify-between gap-2">
                        <span>Remove Certificates</span>
                        <InfoIcon className="size-3.5 text-muted" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="left" sideOffset={14}>
                      Remove certificates synced by Infisical from this {destinationName}{" "}
                      destination.
                    </TooltipContent>
                  </Tooltip>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                isDisabled={!canDeleteSync}
                onClick={() => handlePopUpOpen("deleteSync")}
                variant="danger"
              >
                <Trash2Icon />
                Delete Sync
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ButtonGroup>
      </div>

      {syncOption?.canImportCertificates && (
        <PkiSyncImportCertificatesModal
          onOpenChange={(isOpen) => handlePopUpToggle("importCertificates", isOpen)}
          isOpen={popUp.importCertificates.isOpen}
          pkiSync={pkiSync}
        />
      )}
      {syncOption?.canRemoveCertificates && (
        <PkiSyncRemoveCertificatesModal
          onOpenChange={(isOpen) => handlePopUpToggle("removeCertificates", isOpen)}
          isOpen={popUp.removeCertificates.isOpen}
          pkiSync={pkiSync}
        />
      )}
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
