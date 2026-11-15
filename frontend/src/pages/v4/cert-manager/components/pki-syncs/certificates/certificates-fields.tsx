import { useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Inline, InlineGrow, Stack } from "@infisical/cipher/ui/layout";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { Heading, SmallText, StatusText } from "@infisical/cipher/ui/text";

import {
  buildOrderNameMap,
  hasAnyFilter,
  hasUnfinishedFilter,
  isCertificateOrderTheOnlyFilter
} from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import type { PkiSync } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { useV4Adapter } from "../../../../data/adapters";
import { usePkiSyncForm, useWatchedValue } from "../fields";
import { usePkiSyncScope } from "../shared";
import { PkiSyncCertificateAddMenu } from "./add-menu";
import { CertificateManagementDialog } from "./certificate-management-dialog";
import { PkiSyncFilterFields } from "./filter-fields";
import { MATCHED_PAGE_SIZE, PkiSyncMatchedCertificatesTable } from "./matched-certificates-table";
import { useFormCertificateCap } from "./use-certificate-cap";

const capNote = (cap: number) =>
  `This destination holds up to ${cap} certificates, so it only accepts a certificate order filter.`;

export const PkiSyncCertificatesFields = ({
  applicationId,
  pkiSyncId
}: {
  applicationId?: string;
  pkiSyncId?: string;
}) => {
  const { setValue } = usePkiSyncForm();
  const { projectId } = usePkiSyncScope();
  const adapter = useV4Adapter("pkiSyncs");
  const filters = useWatchedValue<TPkiSyncFilters | null | undefined>("filters");
  const destination = useWatchedValue<PkiSync>("destination");
  const filtersKey = JSON.stringify(filters ?? null);
  const certificateCap = useFormCertificateCap();

  const growableFilterKinds = [
    filters?.profileIds === undefined ? null : "certificate profile",
    filters?.metadata === undefined ? null : "metadata"
  ].filter((kind): kind is string => Boolean(kind));

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [previewFilters, setPreviewFilters] = useState<TPkiSyncFilters | null>(filters ?? null);
  const [page, setPage] = useState(1);
  const [pickedOrderNames, setPickedOrderNames] = useState<[string, string][]>([]);

  const isStale = filtersKey !== JSON.stringify(previewFilters ?? null);
  const isUnfinished = hasUnfinishedFilter(filters);
  const previewEnabled = Boolean(applicationId) && hasAnyFilter(previewFilters);

  const preview = adapter.usePreviewCertificates({
    projectId,
    applicationId,
    pkiSyncId,
    filters: previewFilters,
    offset: (page - 1) * MATCHED_PAGE_SIZE,
    limit: MATCHED_PAGE_SIZE,
    enabled: previewEnabled
  });
  const isPreviewing = preview.isFetching;

  const reloadPreview = () => {
    setPage(1);
    if (isStale) setPreviewFilters(filters ?? null);
    else preview.refetch().catch(() => {});
  };

  const { data: resolvedOrderNames } = adapter.useCertificateOrders({
    applicationId,
    pkiSyncId,
    certificateOrderIds: filters?.certificateOrderIds ?? []
  });

  const orderNameById = useMemo(
    () =>
      new Map([
        ...(resolvedOrderNames ?? new Map<string, string>()),
        ...buildOrderNameMap(preview.data?.certificates),
        ...pickedOrderNames
      ]),
    [resolvedOrderNames, preview.data, pickedOrderNames]
  );

  const matchedCount = preview.data?.totalCount ?? 0;

  const setOrderIds = (certificateOrderIds: string[]) => {
    if (certificateOrderIds.length === 0) {
      const remaining = { ...(filters ?? {}) };
      delete remaining.certificateOrderIds;
      setValue("filters", Object.keys(remaining).length ? remaining : null, { shouldDirty: true });
      return;
    }
    setValue("filters", { ...(filters ?? {}), certificateOrderIds }, { shouldDirty: true });
  };

  const openPicker = () => setIsPickerOpen(true);

  const picker = isPickerOpen && (
    <CertificateManagementDialog
      onClose={() => setIsPickerOpen(false)}
      destination={destination}
      applicationId={applicationId}
      maxSelectable={certificateCap}
      selectedOrderIds={filters?.certificateOrderIds ?? []}
      onOrderSelectionChange={(certificateOrderIds, orderNames) => {
        setPickedOrderNames((prev) => [...prev, ...orderNames]);
        setOrderIds(certificateOrderIds);
      }}
      title={
        certificateCap === 1
          ? "Select a certificate order to sync"
          : "Select certificate orders to sync"
      }
      description="Selecting a certificate selects its order, so the sync follows every renewal of it."
      saveLabel="Update selection"
    />
  );

  if (!applicationId)
    return (
      <EmptyState
        size="sm"
        icon="cert"
        title="Certificates can't be changed"
        description="This sync is not attached to an application. Create a sync inside an application to select certificates by filter."
      />
    );

  if (
    certificateCap === 1 &&
    (!hasAnyFilter(filters) || isCertificateOrderTheOnlyFilter(filters))
  ) {
    const selectedOrderId = filters?.certificateOrderIds?.[0];
    return (
      <>
        <Field
          group
          label="Certificate order"
          description="This destination holds one certificate order, which stays synced through every renewal."
        >
          <Inline gap={8} align="center" wrap={false}>
            <InlineGrow>
              {selectedOrderId ? (
                <MiddleTruncate
                  mono
                  text={orderNameById.get(selectedOrderId) ?? selectedOrderId}
                  title={selectedOrderId}
                />
              ) : (
                <SmallText muted>No certificate order selected.</SmallText>
              )}
            </InlineGrow>
            {selectedOrderId ? (
              <>
                <Button type="button" variant="outline" onClick={openPicker}>
                  Change
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  icon="trash"
                  iconOnly
                  onClick={() => setValue("filters", null, { shouldDirty: true })}
                >
                  Remove certificate order
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={openPicker}>
                Select certificate order
              </Button>
            )}
          </Inline>
        </Field>
        {picker}
      </>
    );
  }

  return (
    <Stack gap={24}>
      <Stack gap={12}>
        <Stack gap={4}>
          <Heading level={3} size="subsection">
            Filters
          </Heading>
          <SmallText muted>
            {certificateCap === undefined
              ? "A certificate is synced only when it matches every filter below."
              : capNote(certificateCap)}
          </SmallText>
        </Stack>
        {certificateCap !== undefined && growableFilterKinds.length > 0 && (
          <Alert
            tone="warn"
            title={
              growableFilterKinds.length === 1
                ? `Remove the ${growableFilterKinds[0]} filter`
                : "Remove the filters below"
            }
          >
            {capNote(certificateCap)}
          </Alert>
        )}
        {hasAnyFilter(filters) ? (
          <PkiSyncFilterFields
            applicationId={applicationId}
            orderNameById={orderNameById}
            onOpenPicker={openPicker}
          />
        ) : (
          <EmptyState
            size="sm"
            icon="search"
            title="No filters"
            description="Add a filter to choose which certificates this sync holds."
          />
        )}
        <Inline>
          <PkiSyncCertificateAddMenu applicationId={applicationId} onOpenPicker={openPicker} />
        </Inline>
      </Stack>

      {hasAnyFilter(filters) && (
        <Stack gap={12}>
          <Inline gap={8} align="center" justify="between">
            <Heading level={3} size="subsection">
              Matched certificates
            </Heading>
            <Inline gap={8} align="center">
              {isStale && (
                <StatusText tone="warn" size="sm" icon="alert">
                  Filters changed
                </StatusText>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon="sync"
                loading={isPreviewing}
                disabledReason={
                  isUnfinished
                    ? "A filter is unfinished. Complete it, then reload the preview."
                    : undefined
                }
                onClick={reloadPreview}
              >
                Reload preview
              </Button>
            </Inline>
          </Inline>
          <PkiSyncMatchedCertificatesTable
            rows={preview.data?.certificates ?? []}
            loading={isPreviewing}
            totalCount={matchedCount}
            page={page}
            onPageChange={setPage}
            emptyTitle="No certificates match"
            emptyDescription="Nothing in this application matches these filters yet."
            status={
              preview.data
                ? `${matchedCount} certificate${matchedCount === 1 ? " matches" : "s match"} these filters`
                : undefined
            }
          />
        </Stack>
      )}

      {picker}
    </Stack>
  );
};
