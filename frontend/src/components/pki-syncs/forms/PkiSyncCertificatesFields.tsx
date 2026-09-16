import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { FilterIcon, RefreshCwIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyMedia,
  IconButton,
  Pagination,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  PkiSync,
  usePkiSyncCertificateOrders,
  usePkiSyncOption,
  usePkiSyncPreviewCertificates
} from "@app/hooks/api/pkiSyncs";
import { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { CertificateManagementModal } from "../CertificateManagementModal";
import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import {
  buildOrderNameMap,
  getPkiSyncCertificateCap,
  hasAnyFilter,
  hasUnfinishedFilter,
  isCertificateOrderTheOnlyFilter
} from "./pki-sync-filter-fns";
import { PkiSyncCertificateAddMenu } from "./PkiSyncCertificateAddMenu";
import { PkiSyncFilterFields } from "./PkiSyncFilterFields";
import {
  PkiSyncMatchedCertificatesTable,
  TMatchedCertificateRow
} from "./PkiSyncMatchedCertificatesTable";

const MATCHED_PAGE_SIZE = 20;

type Props = {
  applicationId?: string;
  pkiSyncId?: string;
};

export const PkiSyncCertificatesFields = ({ applicationId, pkiSyncId }: Props) => {
  const { watch, setValue } = useFormContext<TPkiSyncForm>();
  const { currentProject } = useProject();

  const filters = watch("filters") as TPkiSyncFilters | null | undefined;
  const filtersKey = JSON.stringify(filters ?? null);

  const { syncOption } = usePkiSyncOption(watch("destination") as PkiSync);
  const certificateCap = getPkiSyncCertificateCap({
    destinationMaxCertificates: syncOption?.maxCertificates,
    syncOptions: watch("syncOptions") as Record<string, unknown> | undefined,
    destinationConfig: watch("destinationConfig") as Record<string, unknown> | undefined
  });

  const growableFilterKinds = [
    filters?.profileIds === undefined ? null : "certificate profile",
    filters?.metadata === undefined ? null : "metadata"
  ].filter((kind): kind is string => Boolean(kind));

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [previewFilters, setPreviewFilters] = useState<TPkiSyncFilters | null>(filters ?? null);
  const [page, setPage] = useState(1);
  const previewKey = JSON.stringify(previewFilters ?? null);

  const isStale = filtersKey !== previewKey;
  const isUnfinished = hasUnfinishedFilter(filters);

  const {
    data: preview,
    refetch: refetchPreview,
    isFetching: isPreviewing
  } = usePkiSyncPreviewCertificates({
    projectId: currentProject?.id || "",
    applicationId,
    pkiSyncId,
    filters: previewFilters,
    offset: (page - 1) * MATCHED_PAGE_SIZE,
    limit: MATCHED_PAGE_SIZE,
    enabled: Boolean(applicationId) && hasAnyFilter(previewFilters)
  });

  const reloadPreview = () => {
    setPage(1);
    if (isStale) setPreviewFilters(filters ?? null);
    else refetchPreview().catch(() => {});
  };

  const [pickedOrderNames, setPickedOrderNames] = useState<[string, string][]>([]);

  const { data: resolvedOrderNames } = usePkiSyncCertificateOrders({
    applicationId,
    pkiSyncId,
    certificateOrderIds: filters?.certificateOrderIds ?? []
  });

  const orderNameById = useMemo(
    () =>
      new Map([
        ...(resolvedOrderNames ?? new Map<string, string>()),
        ...buildOrderNameMap(preview?.certificates),
        ...pickedOrderNames
      ]),
    [resolvedOrderNames, preview, pickedOrderNames]
  );

  const matchedRows: TMatchedCertificateRow[] = preview?.certificates ?? [];
  const matchedCount = preview?.totalCount ?? 0;

  const setOrderIds = (certificateOrderIds: string[]) => {
    if (certificateOrderIds.length === 0) {
      const remaining = { ...(filters ?? {}) };
      delete remaining.certificateOrderIds;
      setValue("filters", Object.keys(remaining).length ? remaining : null, { shouldDirty: true });
      return;
    }

    setValue("filters", { ...(filters ?? {}), certificateOrderIds }, { shouldDirty: true });
  };

  const certificatePicker = (
    <CertificateManagementModal
      isOpen={isPickerOpen}
      onClose={() => setIsPickerOpen(false)}
      destination={watch("destination")}
      applicationId={applicationId}
      maxSelectable={certificateCap}
      selectedOrderIds={filters?.certificateOrderIds ?? []}
      onOrderSelectionChange={(certificateOrderIds, orderNames) => {
        setPickedOrderNames((prev) => [...prev, ...orderNames]);
        setOrderIds(certificateOrderIds);
      }}
      title={
        certificateCap === 1 ? "Select a Certificate to Sync" : "Select Certificate Orders to Sync"
      }
      subtitle="Selecting a certificate selects its order, so the sync follows every renewal of it."
      saveButtonText="Update Selection"
    />
  );

  if (!applicationId) {
    return (
      <Empty className="flex-none border py-8">
        <EmptyMedia variant="icon">
          <FilterIcon />
        </EmptyMedia>
        <EmptyDescription>
          This sync is not attached to an application, so its certificates cannot be changed. Create
          a sync inside an application to select certificates by filter.
        </EmptyDescription>
      </Empty>
    );
  }

  if (
    certificateCap === 1 &&
    (!hasAnyFilter(filters) || isCertificateOrderTheOnlyFilter(filters))
  ) {
    const selectedOrderId = filters?.certificateOrderIds?.[0];

    return (
      <div className="flex flex-col">
        <p className="text-sm font-medium text-foreground">Certificate</p>
        <p className="mt-0.5 text-xs text-muted">
          This destination holds one certificate. The order you pick stays synced through every
          renewal of it.
        </p>
        <div className="mt-3 flex items-center gap-3">
          {selectedOrderId ? (
            <>
              <Badge
                variant="outline"
                isTruncatable
                className="h-9 min-w-0 flex-1 pl-3 font-mono text-foreground"
              >
                <span className="truncate">
                  {orderNameById.get(selectedOrderId) ?? selectedOrderId}
                </span>
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => setIsPickerOpen(true)}
              >
                Change
              </Button>
              <IconButton
                type="button"
                size="xs"
                variant="ghost"
                className="hover:text-danger"
                aria-label="Remove certificate"
                onClick={() => setValue("filters", null, { shouldDirty: true })}
              >
                <TrashIcon className="size-4" />
              </IconButton>
            </>
          ) : (
            <>
              <p className="flex-1 text-sm text-muted">No certificate selected.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => setIsPickerOpen(true)}
              >
                Select Certificate
              </Button>
            </>
          )}
        </div>
        {certificatePicker}
      </div>
    );
  }

  const reloadButton = (
    <Button
      type="button"
      size="xs"
      variant={isStale ? "warning" : "outline"}
      isDisabled={isPreviewing || isUnfinished}
      onClick={reloadPreview}
    >
      <RefreshCwIcon className="size-3" />
      Reload Preview
      {isStale && <TriangleAlertIcon className="size-3" />}
    </Button>
  );

  return (
    <div className="flex flex-col">
      <div>
        <p className="text-sm font-medium text-foreground">Filters</p>
        <p className="mt-0.5 text-xs text-muted">
          {certificateCap === undefined
            ? "A certificate is synced only when it matches every filter below."
            : `This destination holds up to ${certificateCap} certificates, so it only accepts a certificate order filter.`}
        </p>
      </div>

      {certificateCap !== undefined && growableFilterKinds.length > 0 && (
        <Alert variant="warning" className="mt-3">
          <AlertTitle>
            {growableFilterKinds.length === 1
              ? `Remove the ${growableFilterKinds[0]} filter`
              : "Remove the filters below"}
          </AlertTitle>
          <AlertDescription>
            {`This destination holds up to ${certificateCap} certificates, so it only accepts a certificate order filter.`}
          </AlertDescription>
        </Alert>
      )}

      {hasAnyFilter(filters) ? (
        <PkiSyncFilterFields
          applicationId={applicationId}
          orderNameById={orderNameById}
          onOpenPicker={() => setIsPickerOpen(true)}
        />
      ) : (
        <Empty className="mt-3 flex-none border py-8">
          <EmptyMedia variant="icon">
            <FilterIcon />
          </EmptyMedia>
          <EmptyDescription>
            Add a filter to choose which certificates this sync holds.
          </EmptyDescription>
        </Empty>
      )}

      <div className="mt-3">
        <PkiSyncCertificateAddMenu
          applicationId={applicationId}
          onOpenPicker={() => setIsPickerOpen(true)}
        />
      </div>

      {hasAnyFilter(filters) && (
        <>
          <div className="mt-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Matched Certificates</p>
              <p className="mt-0.5 text-xs text-muted">
                {preview
                  ? `${matchedCount} certificate${matchedCount === 1 ? " matches" : "s match"} these filters.`
                  : "Loading the certificates these filters match."}
              </p>
            </div>
            {isStale ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>{reloadButton}</span>
                </TooltipTrigger>
                <TooltipContent>
                  {isUnfinished
                    ? "A filter is unfinished. Complete it, then reload the preview."
                    : "Filters changed. Reload the preview to see what they match now."}
                </TooltipContent>
              </Tooltip>
            ) : (
              reloadButton
            )}
          </div>

          <div className="mt-3">
            <PkiSyncMatchedCertificatesTable
              rows={matchedRows}
              isLoading={isPreviewing}
              emptyTitle="No certificates match"
              emptyDescription="Nothing in this application matches these filters yet."
            />
            {matchedCount > MATCHED_PAGE_SIZE && (
              <Pagination
                className="mt-2"
                count={matchedCount}
                page={page}
                perPage={MATCHED_PAGE_SIZE}
                onChangePage={setPage}
                onChangePerPage={() => {}}
                perPageList={[MATCHED_PAGE_SIZE]}
              />
            )}
          </div>
        </>
      )}

      {certificatePicker}
    </div>
  );
};
