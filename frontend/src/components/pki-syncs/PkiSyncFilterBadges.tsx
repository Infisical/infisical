import { ReactNode, useCallback, useState } from "react";

import { Badge, HoverCard, HoverCardContent, HoverCardTrigger } from "@app/components/v3";
import { TPkiSyncFilters } from "@app/hooks/api/pkiSyncs/types";

import { hasAnyFilter, isFilterPresent, TFilterKind } from "./forms/pki-sync-filter-fns";

type TFilterCountLabelProps = { count: number; names: string[] };

const FilterBadgeOverflow = ({ badges }: { badges: ReactNode[] }) => {
  const [first, ...rest] = badges;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {first}
      {rest.length > 0 && (
        <HoverCard openDelay={100}>
          <HoverCardTrigger asChild>
            <Badge variant="neutral" className="cursor-default">
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

export const PkiSyncAnyFilterLabel = <span className="text-sm text-muted/50 italic">Any</span>;

export const PkiSyncNoFilterLabel = <span className="text-sm text-muted/50 italic">None</span>;

export const PkiSyncFilterCountLabel = ({ count, names }: TFilterCountLabelProps) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const rootRef = useCallback((node: HTMLSpanElement | null) => {
    if (node) setPortalContainer(node.closest<HTMLElement>('[role="dialog"]'));
  }, []);

  if (names.length === 0) return <span className="text-sm text-foreground">{count}</span>;

  return (
    <HoverCard openDelay={100}>
      <HoverCardTrigger asChild>
        <span ref={rootRef} className="text-sm text-foreground">
          {count}
        </span>
      </HoverCardTrigger>
      <HoverCardContent
        container={portalContainer ?? undefined}
        className="flex max-h-64 w-64 flex-col gap-1 overflow-y-auto"
      >
        {names.map((name) => (
          <span key={name} className="shrink-0 truncate font-mono text-xs">
            {name}
          </span>
        ))}
      </HoverCardContent>
    </HoverCard>
  );
};

export const PkiSyncFilterValueBadges = ({ values }: { values: string[] }) => {
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
  orderNameById
}: {
  filters: TPkiSyncFilters | null | undefined;
  profileNameById: Map<string, string>;
  orderNameById: Map<string, string>;
}): { label: string; value: ReactNode }[] | null => {
  if (!hasAnyFilter(filters)) return null;

  const metadataPairs = (filters?.metadata ?? [])
    .filter((pair) => pair.key)
    .map((pair) => (pair.value === undefined ? pair.key : `${pair.key}=${pair.value}`));

  const emptyOrAny = (kind: TFilterKind) =>
    isFilterPresent(filters, kind) ? PkiSyncNoFilterLabel : PkiSyncAnyFilterLabel;

  const namesFor = (ids: string[] | undefined, lookup: Map<string, string>) =>
    (ids ?? []).map((id) => lookup.get(id)).filter((name): name is string => Boolean(name));

  return [
    {
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
      label: "Metadata",
      value: metadataPairs.length ? (
        <PkiSyncFilterCountLabel count={metadataPairs.length} names={metadataPairs} />
      ) : (
        emptyOrAny("metadata")
      )
    }
  ];
};
