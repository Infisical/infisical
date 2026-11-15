import { useMemo, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Meta, StatusText } from "@infisical/cipher/ui/text";
import { TooltipText } from "@infisical/cipher/ui/tooltip";

import { getPkiSyncCertificateCap } from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import { getCertificateDisplayName } from "@app/helpers/pkiSyncs";
import { CertificateSyncStatus, PkiSync } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSync, TPkiSyncCertificate } from "@app/hooks/api/pkiSyncs/types";

import { CopyButton, Dash } from "../../access/org/detail-parts";
import { formatDate } from "../../access/roles";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import {
  buildPkiSyncFilterSummary,
  filterSummaryItems
} from "../components/pki-syncs/certificates/filter-badges";
import { usePkiSyncOption, usePkiSyncPermissions } from "../components/pki-syncs/shared";

const PAGE_SIZE = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

type SyncStatusView = {
  tone: "ok" | "bad" | "neutral";
  icon: "check-c" | "alert" | "sync" | "clock" | "info";
  label: string;
};

const syncStatusView = (status?: CertificateSyncStatus | null): SyncStatusView => {
  if (status === CertificateSyncStatus.Succeeded)
    return { tone: "ok", icon: "check-c", label: "Synced" };
  if (status === CertificateSyncStatus.Failed)
    return { tone: "bad", icon: "alert", label: "Failed" };
  if (status === CertificateSyncStatus.Running)
    return { tone: "neutral", icon: "sync", label: "Syncing" };
  if (status === CertificateSyncStatus.Pending)
    return { tone: "neutral", icon: "clock", label: "Not synced" };
  return { tone: "neutral", icon: "info", label: "Unknown" };
};

const isExpired = (cert: TPkiSyncCertificate) =>
  cert.certificateNotAfter ? new Date(cert.certificateNotAfter) < new Date() : false;

const isRevoked = (cert: TPkiSyncCertificate) => cert.certificateStatus === "revoked";

const daysUntilRenewal = (cert: TPkiSyncCertificate) => {
  if (
    !cert.certificateRenewBeforeDays ||
    cert.certificateRenewBeforeDays <= 0 ||
    cert.certificateRenewalError ||
    !cert.certificateNotAfter
  )
    return null;
  const renewalAt =
    new Date(cert.certificateNotAfter).getTime() - cert.certificateRenewBeforeDays * DAY_MS;
  return Math.max(0, Math.ceil((renewalAt - Date.now()) / DAY_MS));
};

const displayNameOf = (cert: TPkiSyncCertificate) => {
  const { originalDisplayName } = getCertificateDisplayName({
    altNames: cert.certificateAltNames,
    commonName: cert.certificateCommonName
  });
  return originalDisplayName === "-" ? "Unknown" : originalDisplayName;
};

const isDefault = (cert: TPkiSyncCertificate) => cert.syncMetadata?.isDefault === true;

const columns = (supportsDefault: boolean): DataTableColumn<TPkiSyncCertificate>[] => [
  {
    id: "name",
    header: "SAN / CN",
    primary: true,
    grow: true,
    minWidth: 200,
    text: displayNameOf,
    secondary: (cert) =>
      cert.certificateSerialNumber ? (
        <MiddleTruncate mono keepEnd={4} text={cert.certificateSerialNumber} />
      ) : undefined,
    render: (cert) => (
      <Inline gap={8} align="center" wrap={false}>
        <MiddleTruncate text={displayNameOf(cert)} />
        {supportsDefault && isDefault(cert) && <Badge tone="soft">Default</Badge>}
      </Inline>
    )
  },
  {
    id: "certificateStatus",
    header: "Certificate status",
    width: 120,
    render: (cert) => {
      if (isRevoked(cert))
        return (
          <Badge tone="bad" dot>
            Revoked
          </Badge>
        );
      if (isExpired(cert))
        return (
          <Badge tone="bad" dot>
            Expired
          </Badge>
        );
      return (
        <Badge tone="ok" dot>
          Active
        </Badge>
      );
    }
  },
  {
    id: "externalId",
    header: "External ID",
    width: 168,
    render: (cert) =>
      cert.externalIdentifier ? (
        <Inline gap={4} align="center" wrap={false}>
          <MiddleTruncate mono text={cert.externalIdentifier} />
          <CopyButton value={cert.externalIdentifier} label="Copy external ID" />
        </Inline>
      ) : (
        <Dash />
      )
  },
  {
    id: "syncStatus",
    header: "Sync status",
    width: 128,
    render: (cert) => {
      const view = syncStatusView(cert.syncStatus);
      const status = (
        <StatusText
          tone={view.tone}
          size="sm"
          icon={view.icon}
          loading={cert.syncStatus === CertificateSyncStatus.Running || undefined}
        >
          {view.label}
        </StatusText>
      );
      if (cert.syncStatus === CertificateSyncStatus.Failed && cert.lastSyncMessage)
        return (
          <TooltipText asChild content={cert.lastSyncMessage}>
            {status}
          </TooltipText>
        );
      return status;
    }
  },
  {
    id: "expires",
    header: "Expires",
    width: 136,
    render: (cert) => {
      if (!cert.certificateNotAfter) return <Meta>Unknown</Meta>;
      const date = formatDate(cert.certificateNotAfter);
      const renewal = daysUntilRenewal(cert);
      if (isExpired(cert))
        return (
          <StatusText tone="bad" size="sm" icon="alert-c">
            {date}
          </StatusText>
        );
      if (renewal === null) return date;
      return (
        <TooltipText asChild content={`Auto-renews in ${renewal}d`}>
          <StatusText size="sm" icon="history">
            {date}
          </StatusText>
        </TooltipText>
      );
    }
  }
];

export const PkiSyncCertificatesCard = ({
  pkiSync,
  onEditCertificates
}: {
  pkiSync: TPkiSync;
  onEditCertificates: () => void;
}) => {
  const [page, setPage] = useState(1);
  const adapter = useV4Adapter("pkiSyncs");
  const { data, isPending, error } = adapter.useSyncCertificates(pkiSync.id, {
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE
  });
  const setDefault = adapter.useSetDefaultCertificate();
  const clearDefault = adapter.useClearDefaultCertificate();
  const certificates = data?.certificates ?? [];
  const totalCount = data?.totalCount ?? 0;

  const supportsDefaultCertificate = pkiSync.destination === PkiSync.AwsElasticLoadBalancer;

  const { canEdit: hasEditPermission } = usePkiSyncPermissions(pkiSync);
  const editBlock = (() => {
    if (!hasEditPermission) return "You don't have permission to edit this sync";
    if (!pkiSync.applicationId) return "This sync is not attached to an application";
    return undefined;
  })();

  const { data: profileData } = useV4Adapter("certificates").useCertificateProfiles({
    limit: 100,
    offset: 0,
    applicationId: pkiSync.applicationId ?? undefined
  });

  const { data: orderNameById } = adapter.useCertificateOrders({
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

  const makeDefault = async (cert: TPkiSyncCertificate) => {
    try {
      await setDefault.mutateAsync({
        pkiSyncId: pkiSync.id,
        certificateId: cert.certificateId,
        destination: pkiSync.destination
      });
      saved("Certificate set as default");
    } catch (err) {
      failed("Failed to set certificate as default", err);
    }
  };

  const unsetDefault = async () => {
    try {
      await clearDefault.mutateAsync({ pkiSyncId: pkiSync.id, destination: pkiSync.destination });
      saved("Default certificate cleared");
    } catch (err) {
      failed("Failed to clear default certificate", err);
    }
  };

  const isDefaultPending = setDefault.isPending || clearDefault.isPending;

  return (
    <Stack gap={24}>
      <Card
        variant="framed"
        title="Certificate filters"
        action={
          <Button variant="ghost" size="sm" disabledReason={editBlock} onClick={onEditCertificates}>
            Edit
          </Button>
        }
      >
        {filterFields ? (
          <DataList variant="props" density="compact" items={filterSummaryItems(filterFields)} />
        ) : (
          <EmptyState
            size="sm"
            media="bare"
            icon="search"
            title={pkiSync.applicationId ? "No filters set" : "Certificates can't be changed"}
            description={
              pkiSync.applicationId
                ? "Edit this sync to choose certificates."
                : "This sync is not attached to an application."
            }
          />
        )}
      </Card>
      <Card variant="framed" title="Certificates">
        <DataTable
          label="Synced certificates"
          rows={certificates}
          columns={columns(supportsDefaultCertificate)}
          loading={isPending && !error}
          loadingRows={3}
          getRowId={(cert) => cert.id}
          rowLabel={displayNameOf}
          rowActions={
            supportsDefaultCertificate
              ? {
                  menuLabel: "Certificate actions",
                  menuDisabledReason: () =>
                    editBlock ??
                    (isDefaultPending ? "Updating the default certificate" : undefined),
                  renderMenu: (cert) =>
                    isDefault(cert) ? (
                      <DropdownMenuItem onSelect={() => unsetDefault()}>
                        Unset default
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => makeDefault(cert)}>
                        Set as default
                      </DropdownMenuItem>
                    )
                }
              : undefined
          }
          empty={
            <EmptyState
              size="sm"
              media="bare"
              icon="cert"
              title={error ? "Couldn't load certificates" : "No certificates in this sync"}
            />
          }
          pagination={
            totalCount > PAGE_SIZE ? (
              <Pagination
                label="Certificate pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={PAGE_SIZE}
              />
            ) : undefined
          }
        />
      </Card>
    </Stack>
  );
};
