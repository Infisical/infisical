import type { ReactNode } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@infisical/cipher/ui/hover-card";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import type { DataListItem } from "@infisical/cipher/ui/list";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { SmallText } from "@infisical/cipher/ui/text";

import {
  FILTER_KINDS,
  hasAnyFilter,
  isFilterPresent,
  type TFilterKind
} from "@app/components/pki-syncs/forms/pki-sync-filter-fns";
import type { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

const AnyFilter = () => <SmallText muted>Any</SmallText>;

const NoFilter = () => <SmallText muted>None</SmallText>;

const OverflowCard = ({ count, children }: { count: number; children: ReactNode }) => (
  <HoverCard openDelay={100}>
    <HoverCardTrigger asChild>
      <Badge tone="soft">{`+${count}`}</Badge>
    </HoverCardTrigger>
    <HoverCardContent align="start">{children}</HoverCardContent>
  </HoverCard>
);

export const PkiSyncFilterCountLabel = ({ count, names }: { count: number; names: string[] }) => {
  if (names.length === 0) return <Badge tone="soft">{count}</Badge>;
  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <Badge tone="soft">{count}</Badge>
      </HoverCardTrigger>
      <HoverCardContent align="start">
        <Stack gap={4}>
          {[...new Set(names)].map((name) => (
            <MiddleTruncate key={name} mono text={name} />
          ))}
        </Stack>
      </HoverCardContent>
    </HoverCard>
  );
};

export const PkiSyncFilterValueBadges = ({ values }: { values: string[] }) => {
  const [first, ...rest] = values;
  if (!first) return null;
  return (
    <Inline gap={4} align="center">
      <Badge tone="soft">{first}</Badge>
      {rest.length > 0 && (
        <OverflowCard count={rest.length}>
          <Inline gap={4}>
            {rest.map((value) => (
              <Badge key={value} tone="soft">
                {value}
              </Badge>
            ))}
          </Inline>
        </OverflowCard>
      )}
    </Inline>
  );
};

export type TPkiSyncFilterSummaryField = { label: string; value: ReactNode };

export const buildPkiSyncFilterSummary = ({
  filters,
  profileNameById,
  orderNameById,
  visibleKinds = FILTER_KINDS
}: {
  filters: TPkiSyncFilters | null | undefined;
  profileNameById: Map<string, string>;
  orderNameById: Map<string, string>;
  visibleKinds?: readonly TFilterKind[];
}): TPkiSyncFilterSummaryField[] | null => {
  if (!hasAnyFilter(filters)) return null;

  const metadataPairs = (filters?.metadata ?? [])
    .filter((pair) => pair.key)
    .map((pair) => (pair.value === undefined ? pair.key : `${pair.key}=${pair.value}`));

  const emptyOrAny = (kind: TFilterKind) =>
    isFilterPresent(filters, kind) ? <NoFilter /> : <AnyFilter />;

  const summary: (TPkiSyncFilterSummaryField & { kind: TFilterKind })[] = [
    {
      kind: "profileIds",
      label: "Profiles",
      value: filters?.profileIds?.length ? (
        <PkiSyncFilterValueBadges
          values={filters.profileIds.map((id) => profileNameById.get(id) ?? id)}
        />
      ) : (
        emptyOrAny("profileIds")
      )
    },
    {
      kind: "certificateOrderIds",
      label: "Certificate orders",
      value: filters?.certificateOrderIds?.length ? (
        <PkiSyncFilterCountLabel
          count={filters.certificateOrderIds.length}
          names={filters.certificateOrderIds.map(
            (id) => orderNameById.get(id) ?? `Order ${id.slice(0, 8)}`
          )}
        />
      ) : (
        emptyOrAny("certificateOrderIds")
      )
    },
    {
      kind: "metadata",
      label: "Metadata",
      value: metadataPairs.length ? (
        <PkiSyncFilterCountLabel count={metadataPairs.length} names={metadataPairs} />
      ) : (
        emptyOrAny("metadata")
      )
    }
  ];

  const visible = new Set(visibleKinds);
  return summary
    .filter(({ kind }) => visible.has(kind))
    .map(({ label, value }) => ({ label, value }));
};

export const filterSummaryItems = (fields: TPkiSyncFilterSummaryField[]): DataListItem[] =>
  fields.map(({ label, value }) => [label, value]);
