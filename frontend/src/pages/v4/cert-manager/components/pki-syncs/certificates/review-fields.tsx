import { type ReactNode, useState } from "react";
import { useWatch } from "react-hook-form";
import { Badge } from "@infisical/cipher/ui/badge";
import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";
import { Heading, SmallText } from "@infisical/cipher/ui/text";

import {
  buildOrderNameMap,
  getPkiSyncCertificateCap,
  hasAnyFilter
} from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import {
  BOOLEAN_SYNC_OPTION_FIELDS,
  getPaloAltoNetworksProfileLabel,
  getSyncOptionDisplayValue,
  getUnusedExportOptionKeys,
  isPaloAltoNetworksPkiSync,
  KEY_VALUE_SYNC_OPTION_FIELDS,
  VALUE_SYNC_OPTION_FIELDS
} from "@app/helpers/pkiSyncs";
import type { PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs/enums";
import type {
  TPaloAltoNetworksSslTlsProfilePkiSync,
  TPkiSyncFilters
} from "@app/hooks/api/pkiSyncs/types";

import { useV4Adapter } from "../../../../data/adapters";
import { usePkiSyncForm } from "../fields";
import { destinationNameOf, usePkiSyncOption, usePkiSyncScope } from "../shared";
import { buildPkiSyncFilterSummary, filterSummaryItems } from "./filter-badges";
import { MATCHED_PAGE_SIZE, PkiSyncMatchedCertificatesTable } from "./matched-certificates-table";

type TPaloAltoNetworksReviewConfig = Partial<
  TPaloAltoNetworksSslTlsProfilePkiSync["destinationConfig"]
>;

const enabledBadge = (enabled: boolean) => (
  <Badge tone={enabled ? "ok" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
);

const isPresent = (value: ReactNode) => value !== undefined && value !== null && value !== "";

const ReviewSection = ({ label, children }: { label: string; children: ReactNode }) => (
  <Stack gap={12}>
    <Heading level={3} size="subsection">
      {label}
    </Heading>
    {children}
  </Stack>
);

const ReviewList = ({ items }: { items: (readonly [string, ReactNode])[] }) => (
  <DataList
    variant="meta"
    items={items.map(([term, value]): DataListItem => [
      term,
      isPresent(value) ? (
        value
      ) : (
        <SmallText key={term} muted>
          None
        </SmallText>
      )
    ])}
  />
);

const paloAltoItems = (config: TPaloAltoNetworksReviewConfig): [string, ReactNode][] => [
  ["Device type", config.template ? "Panorama" : "Firewall"],
  ...(config.template
    ? ([
        ["Template", config.template],
        ["Push to devices", enabledBadge(config.pushToDevices !== false)]
      ] as [string, ReactNode][])
    : []),
  ...(config.sslTlsServiceProfileName
    ? ([
        [
          "SSL/TLS service profile",
          getPaloAltoNetworksProfileLabel({
            name: config.sslTlsServiceProfileName,
            vsys: config.sslTlsServiceProfileVsys
          })
        ]
      ] as [string, ReactNode][])
    : [])
];

export const PkiSyncReviewFields = ({ applicationId }: { applicationId?: string } = {}) => {
  const { control } = usePkiSyncForm();
  const { projectId } = usePkiSyncScope();
  const {
    name,
    description,
    connection,
    filters,
    syncOptions,
    destination,
    destinationConfig,
    isAutoSyncEnabled
  } = useWatch({ control });
  const options = syncOptions as Record<string, unknown> | undefined;
  const config = destinationConfig as Record<string, unknown> | undefined;
  const typedFilters = (filters ?? null) as TPkiSyncFilters | null;

  const { data: profileData } = useV4Adapter("certificates").useCertificateProfiles({
    limit: 100,
    offset: 0,
    applicationId
  });

  const { syncOption } = usePkiSyncOption(destination!);
  const acceptsOnlyCertificateOrders =
    getPkiSyncCertificateCap({
      destinationMaxCertificates: syncOption?.maxCertificates,
      syncOptions: options,
      destinationConfig: config
    }) !== undefined;

  const [page, setPage] = useState(1);
  const anyFilter = hasAnyFilter(typedFilters);

  const preview = useV4Adapter("pkiSyncs").usePreviewCertificates({
    projectId,
    applicationId,
    filters: typedFilters,
    offset: (page - 1) * MATCHED_PAGE_SIZE,
    limit: MATCHED_PAGE_SIZE,
    enabled: Boolean(applicationId) && anyFilter
  });

  const matchedRows = anyFilter ? (preview.data?.certificates ?? []) : [];
  const matchedCount = anyFilter ? (preview.data?.totalCount ?? 0) : 0;
  const filterFields = buildPkiSyncFilterSummary({
    filters: typedFilters,
    profileNameById: new Map(
      (profileData?.certificateProfiles ?? []).map(({ id, slug }) => [id, slug])
    ),
    orderNameById: buildOrderNameMap(preview.data?.certificates),
    visibleKinds: acceptsOnlyCertificateOrders ? ["certificateOrderIds"] : undefined
  });

  const postSyncCommand = options?.postSyncCommand as string | null | undefined;
  const healthCheckCommand = options?.healthCheckCommand as string | null | undefined;
  const inapplicableOptionKeys = getUnusedExportOptionKeys(
    options?.exportFormat as PkiSyncExportFormat | undefined
  );

  const host = config?.host as string | undefined;
  const destinationItems: [string, ReactNode][] = [
    ["Connection", connection?.name],
    ["Service", destination ? destinationNameOf(destination) : undefined],
    ...(config && "vaultBaseUrl" in config
      ? ([["Vault URL", config.vaultBaseUrl as string]] as [string, ReactNode][])
      : []),
    ...(host
      ? ([["Target host", `${host}${config?.port ? `:${String(config.port)}` : ""}`]] as [
          string,
          ReactNode
        ][])
      : []),
    ...(config?.sslEnabled ? ([["WinRM transport", "HTTPS"]] as [string, ReactNode][]) : []),
    ...(isPaloAltoNetworksPkiSync(destination) && config
      ? paloAltoItems(config as TPaloAltoNetworksReviewConfig)
      : [])
  ];

  const optionItems: [string, ReactNode][] = [
    ["Auto-sync", enabledBadge(Boolean(isAutoSyncEnabled))],
    ...BOOLEAN_SYNC_OPTION_FIELDS.flatMap(({ key, label }): [string, ReactNode][] => {
      const value = options?.[key];
      if (typeof value !== "boolean" || inapplicableOptionKeys.has(key)) return [];
      return [[label, enabledBadge(value)]];
    }),
    ...KEY_VALUE_SYNC_OPTION_FIELDS.flatMap(({ key, label }): [string, ReactNode][] => {
      const value = options?.[key];
      if (!Array.isArray(value) || !value.length) return [];
      return [
        [
          label,
          <Inline key={key} gap={4}>
            {(value as { key: string; value?: string }[]).map((pair) => (
              <Badge key={pair.key} tone="soft">
                {pair.value ? `${pair.key}: ${pair.value}` : pair.key}
              </Badge>
            ))}
          </Inline>
        ]
      ];
    }),
    ...VALUE_SYNC_OPTION_FIELDS.flatMap(({ key, label }): [string, ReactNode][] => {
      if (inapplicableOptionKeys.has(key) || !destination) return [];
      const displayValue = getSyncOptionDisplayValue(destination, key, options?.[key]);
      if (displayValue === null) return [];
      return [
        [
          label,
          <Badge key={key} tone="soft">
            {displayValue}
          </Badge>
        ]
      ];
    })
  ];

  return (
    <Stack gap={24}>
      <ReviewSection label="Certificates">
        {filterFields ? (
          <DataList variant="meta" items={filterSummaryItems(filterFields)} />
        ) : (
          <EmptyState
            size="sm"
            icon="search"
            title="No filters set"
            description="Nothing will be synced."
          />
        )}
        {anyFilter && (
          <PkiSyncMatchedCertificatesTable
            rows={matchedRows}
            loading={preview.isPending}
            totalCount={matchedCount}
            page={page}
            onPageChange={setPage}
            emptyTitle="No certificates match"
            emptyDescription="Nothing in this application matches these filters yet."
            status={`${matchedCount} certificate${matchedCount === 1 ? "" : "s"} will be synced`}
          />
        )}
      </ReviewSection>
      <ReviewSection label="Destination">
        <ReviewList items={destinationItems} />
      </ReviewSection>
      <ReviewSection label="Sync options">
        <ReviewList items={optionItems} />
      </ReviewSection>
      {healthCheckCommand && (
        <ReviewSection label="Health check">
          <CodeBlock code={healthCheckCommand} label="Health check command" wrap maxLines={8} />
        </ReviewSection>
      )}
      {postSyncCommand && (
        <ReviewSection label="Post-sync command">
          <CodeBlock code={postSyncCommand} label="Post-sync command" wrap maxLines={8} />
        </ReviewSection>
      )}
      <ReviewSection label="Details">
        <ReviewList
          items={[
            ["Name", name],
            ["Description", description]
          ]}
        />
      </ReviewSection>
    </Stack>
  );
};
