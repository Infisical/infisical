import { useMemo, useState } from "react";
import { useFormContext } from "react-hook-form";
import { FilterIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Empty,
  EmptyDescription,
  EmptyMedia,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { PkiSync, usePkiSyncOption, usePkiSyncPreviewCertificates } from "@app/hooks/api/pkiSyncs";
import { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { CertificateManagementModal } from "../CertificateManagementModal";
import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import {
  buildOrderNameMap,
  getPkiSyncCertificateCap,
  hasAnyFilter,
  hasUnfinishedFilter
} from "./pki-sync-filter-fns";
import { PkiSyncCertificateAddMenu } from "./PkiSyncCertificateAddMenu";
import { PkiSyncFilterFields } from "./PkiSyncFilterFields";
import {
  PkiSyncMatchedCertificatesTable,
  TMatchedCertificateRow
} from "./PkiSyncMatchedCertificatesTable";

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
    enabled: Boolean(applicationId) && hasAnyFilter(previewFilters)
  });

  const reloadPreview = () => {
    if (isStale) setPreviewFilters(filters ?? null);
    else refetchPreview().catch(() => {});
  };

  const [pickedOrderNames, setPickedOrderNames] = useState<[string, string][]>([]);

  const orderNameById = useMemo(
    () => new Map([...buildOrderNameMap(preview?.certificates), ...pickedOrderNames]),
    [preview, pickedOrderNames]
  );

  const matchedRows: TMatchedCertificateRow[] = preview?.certificates ?? [];

  const matchedDescription = () => {
    if (!preview) return "Loading the certificates these filters match.";
    if (preview.hasMoreMatches) {
      return `More than ${matchedRows.length} certificates match. Narrow the filters before saving.`;
    }
    return `Showing ${matchedRows.length} certificate${matchedRows.length === 1 ? "" : "s"} matched by these filters.`;
  };

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

  if (!applicationId) {
    return (
      <Empty className="flex-none border py-8">
        <EmptyMedia variant="icon">
          <FilterIcon />
        </EmptyMedia>
        <EmptyDescription>
          This sync is not attached to an Application, so its certificates cannot be changed. Create
          a sync inside an Application to select certificates by filter.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Filters</p>
          <p className="mt-0.5 text-xs text-muted">
            {certificateCap === undefined
              ? "A certificate is synced only when it matches every filter below."
              : `Holds at most ${certificateCap} certificate${
                  certificateCap === 1 ? "" : "s"
                }, so it only accepts a certificate order filter.`}
          </p>
        </div>
        <PkiSyncCertificateAddMenu
          applicationId={applicationId}
          onOpenPicker={() => setIsPickerOpen(true)}
        />
      </div>

      {certificateCap !== undefined && growableFilterKinds.length > 0 && (
        <Alert variant="warning" className="mt-3">
          <AlertTitle>
            {growableFilterKinds.length === 1
              ? `Remove the ${growableFilterKinds[0]} filter`
              : "Remove the filters below"}
          </AlertTitle>
          <AlertDescription>
            {`This sync holds at most ${certificateCap} certificate${
              certificateCap === 1 ? "" : "s"
            }, so it only accepts a certificate order filter.`}
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
            No filters, so this sync holds nothing. Add one to select certificates.
          </EmptyDescription>
        </Empty>
      )}

      {hasAnyFilter(filters) && (
        <>
          <div className="mt-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Matched Certificates</p>
              <p className="mt-0.5 text-xs text-muted">{matchedDescription()}</p>
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

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <PkiSyncMatchedCertificatesTable
              rows={matchedRows}
              isLoading={isPreviewing}
              emptyTitle="No certificates match"
              emptyDescription="Nothing in this Application matches these filters yet."
            />
          </div>
        </>
      )}

      <CertificateManagementModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        destination={watch("destination")}
        applicationId={applicationId}
        maxSelectable={certificateCap}
        selectedOrderIds={filters?.certificateOrderIds ?? []}
        onOrderSelectionChange={(certificateOrderIds, orderNames) => {
          setPickedOrderNames((prev) => [...prev, ...orderNames]);
          setValue("filters", { ...(filters ?? {}), certificateOrderIds }, { shouldDirty: true });
        }}
        title="Select Certificate Orders for Sync"
        subtitle="Selecting a certificate selects its order, which follows every renewal."
        saveButtonText="Update Selection"
      />
    </div>
  );
};
