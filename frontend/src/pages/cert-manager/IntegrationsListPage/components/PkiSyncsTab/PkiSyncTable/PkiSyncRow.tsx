import { useCallback, useMemo } from "react";
import {
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
import { BanIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  PkiSyncImportStatusBadge,
  PkiSyncRemoveStatusBadge,
  PkiSyncStatusBadge
} from "@app/components/pki-syncs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip
} from "@app/components/v2";
import { Badge, IconButton, TableCell, TableRow } from "@app/components/v3";
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

    const timer = setTimeout(() => setIsIdCopied.off(), 2000);

    // eslint-disable-next-line consistent-return
    return () => clearTimeout(timer);
  }, [isIdCopied]);

  const failureMessage = useMemo(() => {
    if (syncStatus === PkiSyncStatus.Failed) {
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
        "group h-14 transition-colors duration-100 hover:bg-mineshaft-700 [&>td]:py-2",
        syncStatus === PkiSyncStatus.Failed && "bg-red/5 hover:bg-red/10",
        canReadSync ? "cursor-pointer" : "cursor-not-allowed"
      )}
      key={`sync-${id}`}
    >
      <TableCell>
        <img
          alt={`${destinationDetails.name} sync`}
          src={`/images/integrations/${destinationDetails.image}`}
          className="min-w-7"
        />
      </TableCell>
      <TableCell className="max-w-0 min-w-32!">
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
            {!applicationId && (
              <span className="ml-2 rounded bg-mineshaft-600 px-2 py-0.5 text-[10px] tracking-wide text-mineshaft-200 uppercase">
                Legacy
              </span>
            )}
          </div>
          <p className="truncate text-xs leading-4 text-bunker-300">{destinationDetails.name}</p>
        </div>
      </TableCell>
      <PkiSyncDestinationCol pkiSync={pkiSync} />
      <TableCell>
        <div className="flex items-center gap-1">
          {syncStatus ? (
            <Tooltip
              position="left"
              className="max-w-sm"
              content={
                [PkiSyncStatus.Succeeded, PkiSyncStatus.Failed].includes(syncStatus) ? (
                  <div className="flex flex-col gap-2 py-1 whitespace-normal">
                    {lastSyncedAt && (
                      <div>
                        <div
                          className={`mb-2 flex self-start ${syncStatus === PkiSyncStatus.Failed ? "text-yellow" : "text-green"}`}
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
                <PkiSyncStatusBadge status={syncStatus} />
              </div>
            </Tooltip>
          ) : (
            <Tooltip
              className="text-xs"
              content="This sync has not run yet — no certificates have been pushed to the destination."
            >
              <Badge variant="neutral">Not Synced</Badge>
            </Tooltip>
          )}
          {!isAutoSyncEnabled && (
            <Tooltip
              className="text-xs"
              content="Auto-Sync is disabled. Certificate changes in this application will not be automatically synced to the destination."
            >
              <Badge variant="neutral">
                <BanIcon />
                Auto-Sync Disabled
              </Badge>
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
            <DropdownMenuItem
              icon={<FontAwesomeIcon icon={faRotate} />}
              onClick={(e) => {
                e.stopPropagation();
                onTriggerSyncCertificates(pkiSync);
              }}
              isDisabled={!canTriggerSync}
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
            {syncOption?.canImportCertificates && (
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={faDownload} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerImportCertificates(pkiSync);
                }}
                isDisabled={!canImportCertificates}
              >
                <Tooltip
                  position="left"
                  sideOffset={42}
                  content={`Import certificates from this ${destinationName} destination into Infisical.`}
                >
                  <div className="flex h-full w-full items-center justify-between gap-1">
                    <span>Import Certificates</span>
                    <FontAwesomeIcon className="text-bunker-300" size="sm" icon={faInfoCircle} />
                  </div>
                </Tooltip>
              </DropdownMenuItem>
            )}
            {syncOption?.canRemoveCertificates && (
              <DropdownMenuItem
                icon={<FontAwesomeIcon icon={faEraser} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerRemoveCertificates(pkiSync);
                }}
                isDisabled={!canRemoveCertificates}
              >
                <Tooltip
                  position="left"
                  sideOffset={42}
                  content={`Remove certificates synced by Infisical from this ${destinationName} destination.`}
                >
                  <div className="flex h-full w-full items-center justify-between gap-1">
                    <span>Remove Certificates</span>
                    <FontAwesomeIcon className="text-bunker-300" size="sm" icon={faInfoCircle} />
                  </div>
                </Tooltip>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              isDisabled={!canEditSync}
              icon={<FontAwesomeIcon icon={isAutoSyncEnabled ? faToggleOff : faToggleOn} />}
              onClick={(e) => {
                e.stopPropagation();
                onToggleEnable(pkiSync);
              }}
            >
              {isAutoSyncEnabled ? "Disable" : "Enable"} Auto-Sync
            </DropdownMenuItem>
            <DropdownMenuItem
              isDisabled={!canDeleteSync}
              icon={<FontAwesomeIcon icon={faTrash} />}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(pkiSync);
              }}
            >
              Delete Sync
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
};
