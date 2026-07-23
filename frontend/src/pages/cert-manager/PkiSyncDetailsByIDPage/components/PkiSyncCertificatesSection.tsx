import { useState } from "react";
import { EllipsisIcon, HistoryIcon, PencilIcon, ScrollTextIcon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { CertificateManagementModal } from "@app/components/pki-syncs/CertificateManagementModal";
import {
  CertificateDisplayName,
  getCertificateDisplayName
} from "@app/components/utilities/certificateDisplayUtils";
import { DeleteActionModal } from "@app/components/v2";
import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  CopyButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  useClearDefaultCertificate,
  useListPkiSyncCertificates,
  useRemoveCertificatesFromPkiSync,
  useSetCertificateAsDefault
} from "@app/hooks/api";
import {
  CertificateSyncStatus,
  PkiSync,
  TPkiSync,
  usePkiSyncPermissions
} from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

const getSyncStatusVariant = (status?: CertificateSyncStatus | null) => {
  if (status === CertificateSyncStatus.Succeeded) return "success";
  if (status === CertificateSyncStatus.Failed) return "danger";
  if (status === CertificateSyncStatus.Running) return "neutral";
  return "info";
};

const getSyncStatusText = (status?: CertificateSyncStatus | null) => {
  if (status === CertificateSyncStatus.Succeeded) return "Synced";
  if (status === CertificateSyncStatus.Failed) return "Failed";
  if (status === CertificateSyncStatus.Running) return "Syncing";
  if (status === CertificateSyncStatus.Pending) return "Pending";
  return "Unknown";
};

const getCertificateStatusVariant = (isExpired: boolean, isRevoked: boolean) =>
  isRevoked || isExpired ? "danger" : "success";

const getCertificateStatusText = (isExpired: boolean, isRevoked: boolean) => {
  if (isRevoked) return "Revoked";
  if (isExpired) return "Expired";
  return "Active";
};

const truncateSerialNumber = (serial?: string | null) => {
  if (!serial || serial === "Unknown") return "Unknown";
  if (serial.length <= 8) return serial;
  return `${serial.substring(0, 4)}...${serial.substring(serial.length - 4)}`;
};

export const PkiSyncCertificatesSection = ({ pkiSync }: Props) => {
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [certificateToDelete, setCertificateToDelete] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const { data, refetch: refetchSyncCertificates } = useListPkiSyncCertificates(pkiSync.id, {
    offset: (currentPage - 1) * pageSize,
    limit: pageSize
  });
  const syncCertificates = data?.certificates || [];
  const totalCount = data?.totalCount || 0;
  const removeCertificatesFromSync = useRemoveCertificatesFromPkiSync();
  const setCertificateAsDefault = useSetCertificateAsDefault();
  const clearDefaultCertificate = useClearDefaultCertificate();

  const supportsDefaultCertificate = pkiSync.destination === PkiSync.AwsElasticLoadBalancer;

  const { canEdit } = usePkiSyncPermissions(pkiSync);

  const handleRemoveCertificate = async (certificateId: string) => {
    try {
      await removeCertificatesFromSync.mutateAsync({
        pkiSyncId: pkiSync.id,
        certificateIds: [certificateId]
      });

      await refetchSyncCertificates();

      createNotification({
        text: "Certificate removed from sync",
        type: "success"
      });

      setIsDeleteModalOpen(false);
      setCertificateToDelete(null);
    } catch {
      createNotification({
        text: "Failed to remove certificate from sync",
        type: "error"
      });
    }
  };

  const handleDeleteClick = (certificateId: string, displayName: string) => {
    setCertificateToDelete({ id: certificateId, displayName });
    setIsDeleteModalOpen(true);
  };

  const handleSetAsDefault = async (certificateId: string) => {
    try {
      await setCertificateAsDefault.mutateAsync({
        pkiSyncId: pkiSync.id,
        certificateId,
        destination: pkiSync.destination
      });

      await refetchSyncCertificates();

      createNotification({
        text: "Certificate set as default.",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to set certificate as default",
        type: "error"
      });
    }
  };

  const handleClearDefault = async () => {
    try {
      await clearDefaultCertificate.mutateAsync({
        pkiSyncId: pkiSync.id,
        destination: pkiSync.destination
      });

      await refetchSyncCertificates();

      createNotification({
        text: "Default certificate cleared.",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to clear default certificate",
        type: "error"
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Certificates</CardTitle>
          <CardAction>
            <IconButton
              variant="ghost"
              size="xs"
              aria-label="Manage certificates"
              isDisabled={!canEdit}
              onClick={() => setIsManageModalOpen(true)}
            >
              <PencilIcon />
            </IconButton>
          </CardAction>
        </CardHeader>
        <CardContent>
          {syncCertificates.length === 0 ? (
            <Empty className="border py-8">
              <EmptyMedia variant="icon">
                <ScrollTextIcon />
              </EmptyMedia>
              <EmptyTitle>No certificates are part of this certificate sync</EmptyTitle>
            </Empty>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SAN / CN</TableHead>
                    <TableHead>Certificate Status</TableHead>
                    <TableHead>Serial Number</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>Sync Status</TableHead>
                    <TableHead>Expires At</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncCertificates.map((syncCert) => {
                    const isExpired = syncCert.certificateNotAfter
                      ? new Date(syncCert.certificateNotAfter) < new Date()
                      : false;
                    const isRevoked = syncCert.certificateStatus === "revoked";

                    const hasAutoRenewal = Boolean(
                      syncCert.certificateRenewBeforeDays &&
                        syncCert.certificateRenewBeforeDays > 0 &&
                        !syncCert.certificateRenewalError &&
                        syncCert.certificateNotAfter
                    );

                    const daysUntilRenewal =
                      hasAutoRenewal && syncCert.certificateNotAfter
                        ? (() => {
                            const expiryDate = new Date(syncCert.certificateNotAfter);
                            const renewalDate = new Date(
                              expiryDate.getTime() -
                                syncCert.certificateRenewBeforeDays! * 24 * 60 * 60 * 1000
                            );
                            const now = new Date();
                            const diffInMs = renewalDate.getTime() - now.getTime();
                            return Math.max(0, Math.ceil(diffInMs / (24 * 60 * 60 * 1000)));
                          })()
                        : null;

                    const { originalDisplayName } = getCertificateDisplayName(
                      {
                        altNames: syncCert.certificateAltNames,
                        commonName: syncCert.certificateCommonName
                      },
                      34,
                      "Unknown"
                    );

                    const isDefaultCertificate = syncCert.syncMetadata?.isDefault === true;

                    return (
                      <TableRow key={syncCert.id}>
                        <TableCell isTruncatable>
                          <div className="flex items-center gap-2">
                            <CertificateDisplayName
                              cert={{
                                altNames: syncCert.certificateAltNames,
                                commonName: syncCert.certificateCommonName
                              }}
                              maxLength={34}
                              fallback="Unknown"
                            />
                            {supportsDefaultCertificate && isDefaultCertificate && (
                              <Badge variant="neutral">Default</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getCertificateStatusVariant(isExpired, isRevoked)}>
                            {getCertificateStatusText(isExpired, isRevoked)}
                          </Badge>
                        </TableCell>
                        <TableCell isTruncatable>
                          <div
                            className="truncate text-xs"
                            title={syncCert.certificateSerialNumber || "Unknown"}
                          >
                            {truncateSerialNumber(syncCert.certificateSerialNumber)}
                          </div>
                        </TableCell>
                        <TableCell isTruncatable>
                          {syncCert.externalIdentifier ? (
                            <div className="flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="truncate text-xs text-muted">
                                    {syncCert.externalIdentifier}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-none whitespace-nowrap">
                                  {syncCert.externalIdentifier}
                                </TooltipContent>
                              </Tooltip>
                              <CopyButton
                                value={syncCert.externalIdentifier}
                                ariaLabel="Copy external identifier"
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-muted">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {syncCert.lastSyncMessage &&
                          syncCert.syncStatus === CertificateSyncStatus.Failed ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-block">
                                  <Badge variant="danger">Failed</Badge>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{syncCert.lastSyncMessage}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant={getSyncStatusVariant(syncCert.syncStatus)}>
                              {getSyncStatusText(syncCert.syncStatus)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={isExpired ? "text-danger" : "text-muted"}>
                            {syncCert.certificateNotAfter
                              ? new Date(syncCert.certificateNotAfter).toLocaleDateString()
                              : "Unknown"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            {hasAutoRenewal && daysUntilRenewal !== null && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-block text-accent">
                                    <HistoryIcon className="size-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Auto-renews in {daysUntilRenewal}d</TooltipContent>
                              </Tooltip>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton
                                  size="xs"
                                  variant="ghost"
                                  aria-label="Certificate actions"
                                  isDisabled={!canEdit}
                                >
                                  <EllipsisIcon />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {supportsDefaultCertificate && !isDefaultCertificate && (
                                  <DropdownMenuItem
                                    onClick={() => handleSetAsDefault(syncCert.certificateId)}
                                  >
                                    Set as Default
                                  </DropdownMenuItem>
                                )}
                                {supportsDefaultCertificate && isDefaultCertificate && (
                                  <DropdownMenuItem onClick={handleClearDefault}>
                                    Unset Default
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  variant="danger"
                                  onClick={() =>
                                    handleDeleteClick(syncCert.certificateId, originalDisplayName)
                                  }
                                >
                                  <Trash2Icon />
                                  Remove from Sync
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {totalCount > pageSize && (
                <Pagination
                  className="mt-4"
                  count={totalCount}
                  page={currentPage}
                  perPage={pageSize}
                  onChangePage={(page: number) => setCurrentPage(page)}
                  onChangePerPage={() => {}}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <CertificateManagementModal
        pkiSync={pkiSync}
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        onCertificatesUpdated={() => {
          refetchSyncCertificates();
        }}
      />

      <DeleteActionModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          setIsDeleteModalOpen(false);
          setCertificateToDelete(null);
        }}
        title="Remove Certificate from Sync"
        subTitle={`Are you sure you want to remove "${certificateToDelete?.displayName}" from this PKI sync?`}
        deleteKey="confirm"
        onDeleteApproved={async () => {
          if (certificateToDelete) {
            await handleRemoveCertificate(certificateToDelete.id);
          }
        }}
        buttonText="Remove Certificate"
      />
    </>
  );
};
