import { ReactNode, useCallback, useState } from "react";

import { Badge, HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v3";
import { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import {
  FILTER_KINDS,
  hasAnyFilter,
  isFilterPresent,
  TFilterKind
} from "./forms/pki-sync-filter-fns";

type TFilterCountLabelProps = { count: number; names: string[] };

const FilterBadgeOverflow = ({ badges }: { badges: ReactNode[] }) => {
  const [first, ...rest] = badges;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {first}
      {rest.length > 0 && (
        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>
            <Badge variant="neutral" className="cursor-pointer hover:bg-neutral/35">
              +{rest.length}
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent className="flex w-auto max-w-xs flex-wrap gap-1.5">
            {rest}
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
};

const PkiSyncAnyFilterLabel = <span className="text-sm text-muted/50 italic">Any</span>;

const PkiSyncNoFilterLabel = <span className="text-sm text-muted/50 italic">None</span>;

export const PkiSyncFilterCountLabel = ({ count, names }: TFilterCountLabelProps) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const rootRef = useCallback((node: HTMLSpanElement | null) => {
    if (node) setPortalContainer(node.closest<HTMLElement>('[role="dialog"]'));
  }, []);

  if (names.length === 0) return <Badge variant="neutral">{count}</Badge>;

  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <Badge ref={rootRef} variant="neutral" className="cursor-pointer hover:bg-neutral/35">
          {count}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent
        container={portalContainer ?? undefined}
        className="flex max-h-64 w-64 flex-col gap-1 overflow-y-auto"
      >
        {names.map((name, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={`${name}-${index}`} className="shrink-0 truncate font-mono text-xs">
            {name}
          </span>
        ))}
      </HoverCardContent>
    </HoverCard>
  );
};

const PkiSyncFilterValueBadges = ({ values }: { values: string[] }) => {
  if (values.length === 0) return null;

  return (
    <FilterBadgeOverflow
      badges={values.map((value) => (
        <Badge key={value} variant="neutral" isTruncatable className="max-w-[12rem]">
          <span>{value}</span>
        </Badge>
      ))}
    />
  );
};

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
}): { label: string; value: ReactNode }[] | null => {
  if (!hasAnyFilter(filters)) return null;

  const metadataPairs = (filters?.metadata ?? [])
    .filter((pair) => pair.key)
    .map((pair) => (pair.value === undefined ? pair.key : `${pair.key}=${pair.value}`));

  const emptyOrAny = (kind: TFilterKind) =>
    isFilterPresent(filters, kind) ? PkiSyncNoFilterLabel : PkiSyncAnyFilterLabel;

  const namesFor = (ids: string[] | undefined, lookup: Map<string, string>) =>
    (ids ?? []).map((id) => lookup.get(id) ?? `Order ${id.slice(0, 8)}`);

  const summary: { kind: TFilterKind; label: string; value: ReactNode }[] = [
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
      label: "Certificate Orders",
      value: filters?.certificateOrderIds?.length ? (
        <PkiSyncFilterCountLabel
          count={filters.certificateOrderIds.length}
          names={namesFor(filters.certificateOrderIds, orderNameById)}
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

  return summary
    .filter(({ kind }) => visibleKinds.includes(kind))
    .map(({ label, value }) => ({ label, value }));
};
