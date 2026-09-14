import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { FilterIcon } from "lucide-react";

import { buildPkiSyncFilterSummary } from "@app/components/pki-syncs/PkiSyncFilterBadges";
import { Badge, CodeBlock, Empty, EmptyDescription, EmptyMedia } from "@app/components/v3";
import { useProject } from "@app/context";
import {
  BOOLEAN_SYNC_OPTION_FIELDS,
  KEY_VALUE_SYNC_OPTION_FIELDS,
  PKI_SYNC_MAP,
  VALUE_SYNC_OPTION_FIELDS
} from "@app/helpers/pkiSyncs";
import { useListCertificateProfiles } from "@app/hooks/api/certificateProfiles";
import { usePkiSyncPreviewCertificates } from "@app/hooks/api/pkiSyncs";
import { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { buildOrderNameMap, hasAnyFilter } from "./pki-sync-filter-fns";
import { PkiSyncMatchedCertificatesTable } from "./PkiSyncMatchedCertificatesTable";

const ReviewFieldLabel = ({ label, children }: { label: string; children?: ReactNode }) => (
  <div className="row-span-2 grid min-w-0 grid-rows-subgrid pb-2">
    <p className="mb-1 text-xs font-medium text-muted">{label}</p>
    {children ? (
      <div className="text-sm break-words text-foreground">{children}</div>
    ) : (
      <div className="text-sm text-muted/50 italic">None</div>
    )}
  </div>
);

type Props = {
  applicationId?: string;
};

export const PkiSyncReviewFields = ({ applicationId }: Props = {}) => {
  const { watch } = useFormContext<TPkiSyncForm>();
  const { currentProject } = useProject();

  const { data: profileData } = useListCertificateProfiles({
    limit: 100,
    offset: 0,
    applicationId
  });

  const {
    name,
    description,
    connection,
    filters,
    syncOptions,
    destination,
    destinationConfig,
    isAutoSyncEnabled
  } = watch();

  const destinationName = PKI_SYNC_MAP[destination].name;

  const { data: preview, isPending: isPreviewPending } = usePkiSyncPreviewCertificates({
    projectId: currentProject?.id || "",
    applicationId,
    filters: (filters ?? null) as TPkiSyncFilters | null,
    enabled: Boolean(applicationId) && hasAnyFilter(filters)
  });

  const orderNameById = buildOrderNameMap(preview?.certificates);

  const matchedRows = hasAnyFilter(filters) ? (preview?.certificates ?? []) : [];
  const filterFields = buildPkiSyncFilterSummary({
    filters: (filters ?? null) as TPkiSyncFilters | null,
    profileNameById: new Map(
      (profileData?.certificateProfiles ?? []).map(({ id, slug }) => [id, slug])
    ),
    orderNameById
  });
  const postSyncCommand =
    syncOptions && "postSyncCommand" in syncOptions ? syncOptions.postSyncCommand : undefined;
  const healthCheckCommand =
    syncOptions && "healthCheckCommand" in syncOptions ? syncOptions.healthCheckCommand : undefined;

  return (
    <div className="mb-4 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-border">
          <span className="text-sm text-muted">Certificates</span>
        </div>
        <div className="w-full">
          <p className="mb-2 text-sm font-medium text-foreground">Filters</p>
          {filterFields ? (
            <div className="mb-4 grid grid-cols-3 gap-x-8">
              {filterFields.map(({ label, value }) => (
                <ReviewFieldLabel key={label} label={label}>
                  {value}
                </ReviewFieldLabel>
              ))}
            </div>
          ) : (
            <Empty className="mb-4 border py-8">
              <EmptyMedia variant="icon">
                <FilterIcon />
              </EmptyMedia>
              <EmptyDescription>No filters, so this sync holds nothing.</EmptyDescription>
            </Empty>
          )}
          {hasAnyFilter(filters) && (
            <>
              <p className="mb-2 text-sm font-medium text-foreground">Matched Certificates</p>
              <p className="mb-2 text-xs text-muted">
                {preview?.hasMoreMatches
                  ? `More than ${matchedRows.length} certificates match. Narrow the filters before saving.`
                  : `${matchedRows.length} certificate${matchedRows.length === 1 ? "" : "s"} will be synced.`}
              </p>
              <PkiSyncMatchedCertificatesTable
                rows={matchedRows}
                isLoading={isPreviewPending}
                emptyTitle="No certificates match"
                emptyDescription="Nothing in this Application matches these filters yet."
              />
            </>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-border">
          <span className="text-sm text-muted">Destination</span>
        </div>
        <div className="grid grid-cols-3 gap-x-8">
          <ReviewFieldLabel label="Connection">{connection?.name}</ReviewFieldLabel>
          <ReviewFieldLabel label="Service">{destinationName}</ReviewFieldLabel>
          {destinationConfig && "vaultBaseUrl" in destinationConfig && (
            <ReviewFieldLabel label="Vault URL">{destinationConfig.vaultBaseUrl}</ReviewFieldLabel>
          )}
          {destinationConfig && "host" in destinationConfig && destinationConfig.host && (
            <ReviewFieldLabel label="Target Host">
              {destinationConfig.host}
              {"port" in destinationConfig && destinationConfig.port
                ? `:${destinationConfig.port}`
                : ""}
            </ReviewFieldLabel>
          )}
          {destinationConfig &&
            "sslEnabled" in destinationConfig &&
            destinationConfig.sslEnabled && (
              <ReviewFieldLabel label="WinRM Transport">HTTPS</ReviewFieldLabel>
            )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-border">
          <span className="text-sm text-muted">Sync Options</span>
        </div>
        <div className="grid grid-cols-3 gap-x-8">
          <ReviewFieldLabel label="Auto-Sync">
            <Badge variant={isAutoSyncEnabled ? "success" : "danger"}>
              {isAutoSyncEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </ReviewFieldLabel>
          {BOOLEAN_SYNC_OPTION_FIELDS.map(({ key, label }) => {
            const optionValue = (syncOptions as Record<string, unknown> | undefined)?.[key];
            if (typeof optionValue !== "boolean") return null;
            return (
              <ReviewFieldLabel key={key} label={label}>
                <Badge variant={optionValue ? "success" : "danger"}>
                  {optionValue ? "Enabled" : "Disabled"}
                </Badge>
              </ReviewFieldLabel>
            );
          })}
          {KEY_VALUE_SYNC_OPTION_FIELDS.map(({ key, label }) => {
            const optionValue = (syncOptions as Record<string, unknown> | undefined)?.[key];
            if (!Array.isArray(optionValue) || !optionValue.length) return null;
            const pairs = optionValue as { key: string; value?: string }[];
            return (
              <ReviewFieldLabel key={key} label={label}>
                <div className="flex flex-wrap gap-1">
                  {pairs.map((pair) => (
                    <Badge key={pair.key} variant="neutral" isTruncatable>
                      <span>{pair.value ? `${pair.key}: ${pair.value}` : pair.key}</span>
                    </Badge>
                  ))}
                </div>
              </ReviewFieldLabel>
            );
          })}
          {VALUE_SYNC_OPTION_FIELDS.map(({ key, label }) => {
            const optionValue = (syncOptions as Record<string, unknown> | undefined)?.[key];
            if (optionValue === undefined || optionValue === null || optionValue === "")
              return null;
            return (
              <ReviewFieldLabel key={key} label={label}>
                <Badge variant="neutral">{String(optionValue)}</Badge>
              </ReviewFieldLabel>
            );
          })}
        </div>
      </div>
      {healthCheckCommand && (
        <div className="flex flex-col gap-3">
          <div className="w-full border-b border-border">
            <span className="text-sm text-muted">Health Check</span>
          </div>
          <CodeBlock value={healthCheckCommand} className="max-h-48 whitespace-pre-wrap" />
        </div>
      )}
      {postSyncCommand && (
        <div className="flex flex-col gap-3">
          <div className="w-full border-b border-border">
            <span className="text-sm text-muted">Post-Sync Command</span>
          </div>
          <CodeBlock value={postSyncCommand} className="max-h-48 whitespace-pre-wrap" />
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-border">
          <span className="text-sm text-muted">Details</span>
        </div>
        <div className="grid grid-cols-3 gap-x-8">
          <ReviewFieldLabel label="Name">{name}</ReviewFieldLabel>
          <ReviewFieldLabel label="Description">{description}</ReviewFieldLabel>
        </div>
      </div>
    </div>
  );
};
