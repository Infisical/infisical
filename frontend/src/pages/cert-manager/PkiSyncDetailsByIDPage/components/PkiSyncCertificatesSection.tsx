import { useMemo, useState } from "react";
import {
  CheckCircle2Icon,
  CircleHelpIcon,
  EllipsisIcon,
  HistoryIcon,
  PencilIcon,
  RotateCwIcon,
  ScrollTextIcon,
  TriangleAlertIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { getPkiSyncCertificateCap } from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import { buildPkiSyncFilterSummary } from "@app/components/pki-syncs/PkiSyncFilterBadges";
import { getCertificateDisplayName } from "@app/components/utilities/certificateDisplayUtils";
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
  usePkiSyncCertificateOrders,
  useSetCertificateAsDefault
} from "@app/hooks/api";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import {
  CertificateSyncStatus,
  PkiSync,
  TPkiSync,
  usePkiSyncOption,
  usePkiSyncPermissions
} from "@app/hooks/api/pkiSyncs";

type Props = {
  onEditCertificates: () => void;
  pkiSync: TPkiSync;
};

const getSyncStatusVariant = (status?: CertificateSyncStatus | null) => {
  if (status === CertificateSyncStatus.Succeeded) return "success";
  if (status === CertificateSyncStatus.Failed) return "danger";
  if (status === CertificateSyncStatus.Running) return "neutral";
  return "info";
};

const getSyncStatusIcon = (status?: CertificateSyncStatus | null) => {
  if (status === CertificateSyncStatus.Succeeded) return <CheckCircle2Icon />;
  if (status === CertificateSyncStatus.Failed) return <TriangleAlertIcon />;
  if (status === CertificateSyncStatus.Running || status === CertificateSyncStatus.Pending)
    return <RotateCwIcon />;
  return <CircleHelpIcon />;
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

export const PkiSyncCertificatesSection = ({ pkiSync, onEditCertificates }: Props) => {
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const { data, refetch: refetchSyncCertificates } = useListPkiSyncCertificates(pkiSync.id, {
    offset: (currentPage - 1) * pageSize,
    limit: pageSize
  });
  const syncCertificates = data?.certificates || [];
  const totalCount = data?.totalCount || 0;
  const setCertificateAsDefault = useSetCertificateAsDefault();
  const clearDefaultCertificate = useClearDefaultCertificate();

  const supportsDefaultCertificate = pkiSync.destination === PkiSync.AwsElasticLoadBalancer;

  const { canEdit: hasEditPermission } = usePkiSyncPermissions(pkiSync);
  const canEdit = hasEditPermission && Boolean(pkiSync.applicationId);

  const { data: profileData } = useListCertificateProfiles({
    limit: 100,
    offset: 0,
    applicationId: pkiSync.applicationId ?? undefined
  });

  const { data: orderNameById } = usePkiSyncCertificateOrders({
    pkiSyncId: pkiSync.id,
    certificateOrderIds: pkiSync.filters?.certificateOrderIds ?? []
  });

  const { syncOption } = usePkiSyncOption(pkiSync.destination);
  const acceptsOnlyCertificateOrders =
    getPkiSyncCertificateCap({
      destinationMaxCertificates: syncOption?.maxCertificates,
      syncOptions: pkiSync.syncOptions as Record<string, unknown> | undefined,
      destinationConfig: pkiSync.destinationConfig as Record<string, unknown> | undefined
    }) !== undefined;

  const filterFields = useMemo(
    () =>
      buildPkiSyncFilterSummary({
        filters: pkiSync.filters,
        profileNameById: new Map(
          (profileData?.certificateProfiles ?? []).map(({ id, slug }) => [id, slug])
        ),
        orderNameById: orderNameById ?? new Map<string, string>(),
        visibleKinds: acceptsOnlyCertificateOrders ? ["certificateOrderIds"] : undefined
      }),
    [pkiSync.filters, profileData, orderNameById, acceptsOnlyCertificateOrders]
  );

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
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Certificates</CardTitle>
        <CardAction>
          <IconButton
            variant="ghost"
            size="xs"
            aria-label="Manage certificates and filters"
            isDisabled={!canEdit}
            onClick={onEditCertificates}
          >
            <PencilIcon />
          </IconButton>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs font-medium tracking-wide text-muted uppercase">Filters</p>
        {filterFields ? (
          <div
            className="mb-4 grid gap-x-8"
            style={{ gridTemplateColumns: `repeat(${filterFields.length}, minmax(0, 1fr))` }}
          >
            {filterFields.map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <p className="mb-1 text-xs font-medium text-muted">{label}</p>
                {value}
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-4 text-sm text-muted">
            {pkiSync.applicationId
              ? "No filters set. Edit this sync to choose certificates."
              : "This sync is not attached to an Application, so its certificates cannot be changed."}
          </p>
        )}
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
                  <TableHead className="w-full">SAN / CN</TableHead>
                  <TableHead>Certificate Status</TableHead>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>External ID</TableHead>
                  <TableHead>Sync Status</TableHead>
                  <TableHead>Expires At</TableHead>
                  {supportsDefaultCertificate && <TableHead />}
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
                    undefined,
                    "Unknown"
                  );

                  const isDefaultCertificate = syncCert.syncMetadata?.isDefault === true;

                  return (
                    <TableRow key={syncCert.id}>
                      <TableCell isTruncatable>
                        <div className="flex items-center gap-2">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="truncate">{originalDisplayName}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-lg break-words">
                              {originalDisplayName}
                            </TooltipContent>
                          </Tooltip>
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
                          className="truncate"
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
                                <span className="truncate">{syncCert.externalIdentifier}</span>
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
                          <span className="text-muted">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {syncCert.lastSyncMessage &&
                        syncCert.syncStatus === CertificateSyncStatus.Failed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-block">
                                <Badge variant="danger">
                                  <TriangleAlertIcon />
                                  Failed
                                </Badge>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{syncCert.lastSyncMessage}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <Badge variant={getSyncStatusVariant(syncCert.syncStatus)}>
                            {getSyncStatusIcon(syncCert.syncStatus)}
                            {getSyncStatusText(syncCert.syncStatus)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={isExpired ? "text-danger" : undefined}>
                            {syncCert.certificateNotAfter
                              ? new Date(syncCert.certificateNotAfter).toLocaleDateString()
                              : "Unknown"}
                          </span>
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
                        </div>
                      </TableCell>
                      {supportsDefaultCertificate && (
                        <TableCell>
                          <div className="flex items-center justify-end">
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
                                {isDefaultCertificate ? (
                                  <DropdownMenuItem onClick={handleClearDefault}>
                                    Unset Default
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => handleSetAsDefault(syncCert.certificateId)}
                                  >
                                    Set as Default
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      )}
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
  );
};
