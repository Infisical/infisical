import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BanIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EraserIcon,
  InfoIcon,
  MoreHorizontalIcon,
  RotateCwIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  Trash2Icon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  PkiSyncImportStatusBadge,
  PkiSyncRemoveStatusBadge,
  PkiSyncStatusBadge
} from "@app/components/pki-syncs";
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
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { useToggle } from "@app/hooks";
import {
  PkiSyncStatus,
  TPkiSync,
  usePkiSyncOption,
  usePkiSyncPermissions
} from "@app/hooks/api/pkiSyncs";

import { PkiSyncDestinationCol } from "./PkiSyncDestinationCol";

type Props = {
  pkiSync: TPkiSync;
  onDelete: (pkiSync: TPkiSync) => void;
  onTriggerSyncCertificates: (pkiSync: TPkiSync) => void;
  onTriggerImportCertificates: (pkiSync: TPkiSync) => void;
  onTriggerRemoveCertificates: (pkiSync: TPkiSync) => void;
  onToggleEnable: (pkiSync: TPkiSync) => void;
  applicationName?: string;
};

export const PkiSyncRow = ({
  pkiSync,
  onDelete,
  onTriggerSyncCertificates,
  onTriggerImportCertificates,
  onTriggerRemoveCertificates,
  onToggleEnable,
  applicationName
}: Props) => {
  const navigate = useNavigate();
  const {
    id,
    lastSyncMessage,
    destination,
    lastSyncedAt,
    name,
    description,
    syncStatus,
    isAutoSyncEnabled,
    projectId,
    applicationId
  } = pkiSync;

  const { syncOption } = usePkiSyncOption(destination);

  const { currentOrg } = useOrganization();
  const [isIdCopied, setIsIdCopied] = useToggle(false);

  const {
    canRead: canReadSync,
    canEdit: canEditSync,
    canDelete: canDeleteSync,
    canTriggerSync,
    canImportCertificates,
    canRemoveCertificates
  } = usePkiSyncPermissions(pkiSync);

  const handleCopyId = useCallback(() => {
    setIsIdCopied.on();
    navigator.clipboard.writeText(id);

    createNotification({
      text: "PKI Sync ID copied to clipboard",
      type: "info"
    });

    setTimeout(() => setIsIdCopied.off(), 2000);
  }, [id, setIsIdCopied]);

  const destinationDetails = PKI_SYNC_MAP[destination];
  const destinationName = destinationDetails.name;

  return (
    <TableRow
      onClick={() => {
        if (!canReadSync) {
          return;
        }
        navigate({
          to: ROUTE_PATHS.CertManager.PkiSyncDetailsByIDPage.path,
          params: {
            syncId: id,
            projectId,
            orgId: currentOrg.id
          },
          search: applicationName ? { applicationName } : undefined
        });
      }}
      className={twMerge(
        "group h-14 transition-colors duration-100 [&>td]:py-2",
        syncStatus === PkiSyncStatus.Failed && "bg-danger/5 hover:bg-danger/10",
        canReadSync ? "cursor-pointer" : "cursor-not-allowed"
      )}
      key={`sync-${id}`}
    >
      <TableCell>
        <img
          alt={`${destinationDetails.name} sync`}
          src={`/images/integrations/${destinationDetails.image}`}
          className="w-5 min-w-5"
        />
      </TableCell>
      <TableCell className="max-w-0 min-w-32!">
        <div>
          <div className="flex w-full items-center">
            <p className="truncate">{name}</p>
            {description && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="ml-1 size-3.5 text-muted" />
                </TooltipTrigger>
                <TooltipContent>{description}</TooltipContent>
              </Tooltip>
            )}
            {!applicationId && (
              <span className="ml-2 rounded bg-foreground/10 px-2 py-0.5 text-[10px] tracking-wide text-foreground uppercase">
                Legacy
              </span>
            )}
          </div>
          <p className="truncate text-xs leading-4 text-label">{destinationDetails.name}</p>
        </div>
      </TableCell>
      <PkiSyncDestinationCol pkiSync={pkiSync} />
      <TableCell>
        <div className="flex items-center gap-1">
          {syncStatus ? (
            <PkiSyncStatusBadge
              status={syncStatus}
              lastSyncedAt={lastSyncedAt}
              lastSyncMessage={lastSyncMessage}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="neutral">Not Synced</Badge>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                This sync has not run yet. No certificates have been pushed to the destination.
              </TooltipContent>
            </Tooltip>
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
                Auto-Sync is disabled. Certificate changes in this application will not be
                automatically synced to the destination.
              </TooltipContent>
            </Tooltip>
          )}
          {syncOption?.canImportCertificates && <PkiSyncImportStatusBadge mini pkiSync={pkiSync} />}
          <PkiSyncRemoveStatusBadge mini pkiSync={pkiSync} />
        </div>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="ghost" size="xs" aria-label="Options">
              <MoreHorizontalIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent sideOffset={2} align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleCopyId();
              }}
            >
              {isIdCopied ? <CheckIcon /> : <CopyIcon />}
              Copy Sync ID
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onTriggerSyncCertificates(pkiSync);
              }}
              isDisabled={!canTriggerSync}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <RotateCwIcon />
                      Trigger Sync
                    </span>
                    <InfoIcon className="size-3.5 text-label" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" sideOffset={20}>
                  {`Manually trigger a sync for this ${destinationName} destination.`}
                </TooltipContent>
              </Tooltip>
            </DropdownMenuItem>
            {syncOption?.canImportCertificates && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerImportCertificates(pkiSync);
                }}
                isDisabled={!canImportCertificates}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <DownloadIcon />
                        Import Certificates
                      </span>
                      <InfoIcon className="size-3.5 text-label" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="left"
                    sideOffset={20}
                  >{`Import certificates from this ${destinationName} destination into Infisical.`}</TooltipContent>
                </Tooltip>
              </DropdownMenuItem>
            )}
            {syncOption?.canRemoveCertificates && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerRemoveCertificates(pkiSync);
                }}
                isDisabled={!canRemoveCertificates}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <EraserIcon />
                        Remove Certificates
                      </span>
                      <InfoIcon className="size-3.5 text-label" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="left"
                    sideOffset={20}
                  >{`Remove certificates synced by Infisical from this ${destinationName} destination.`}</TooltipContent>
                </Tooltip>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              isDisabled={!canEditSync}
              onClick={(e) => {
                e.stopPropagation();
                onToggleEnable(pkiSync);
              }}
            >
              {isAutoSyncEnabled ? <ToggleLeftIcon /> : <ToggleRightIcon />}
              {isAutoSyncEnabled ? "Disable" : "Enable"} Auto-Sync
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="danger"
              isDisabled={!canDeleteSync}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(pkiSync);
              }}
            >
              <Trash2Icon />
              Delete Sync
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
