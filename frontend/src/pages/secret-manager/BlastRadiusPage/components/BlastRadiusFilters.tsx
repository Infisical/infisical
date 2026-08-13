import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@app/components/v3";
import {
  PrincipalAccessFilter,
  PrincipalUsageFilter,
  SyncStatusFilter
} from "@app/hooks/api/blastRadius";

export type TBlastRadiusFilterState = {
  access: PrincipalAccessFilter;
  usage: PrincipalUsageFilter;
  syncStatus: SyncStatusFilter;
};

type Props = {
  filters: TBlastRadiusFilterState;
  onChange: (filters: TBlastRadiusFilterState) => void;
};

const ACCESS_LABEL: Record<PrincipalAccessFilter, string> = {
  [PrincipalAccessFilter.All]: "All",
  [PrincipalAccessFilter.ReadValue]: "Can read value",
  [PrincipalAccessFilter.DescribeOnly]: "Describe only",
  [PrincipalAccessFilter.Write]: "Can write"
};

const USAGE_LABEL: Record<PrincipalUsageFilter, string> = {
  [PrincipalUsageFilter.All]: "All",
  [PrincipalUsageFilter.NoReads]: "No reads",
  [PrincipalUsageFilter.Observed]: "Observed"
};

const SYNC_LABEL: Record<SyncStatusFilter, string> = {
  [SyncStatusFilter.All]: "All",
  [SyncStatusFilter.Unhealthy]: "Needs attention"
};

const FilterSelect = <T extends string>({
  prefix,
  value,
  options,
  onValueChange
}: {
  prefix: string;
  value: T;
  options: Record<T, string>;
  onValueChange: (value: T) => void;
}) => (
  <Select value={value} onValueChange={(next) => onValueChange(next as T)}>
    <SelectTrigger size="sm" className="w-auto gap-1.5 text-xs">
      <span className="text-muted">{prefix}:</span>
      <SelectValue />
    </SelectTrigger>
    <SelectContent position="popper">
      {(Object.keys(options) as T[]).map((option) => (
        <SelectItem key={option} value={option}>
          {options[option]}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/**
 * Principal filters are sent to the server so they apply to the whole set before the page is cut;
 * paging through a filtered graph then walks the filtered set. The destination filter is client-side
 * because destinations are never paged.
 */
export const BlastRadiusFilters = ({ filters, onChange }: Props) => (
  <div className="flex flex-wrap items-center gap-2">
    <FilterSelect
      prefix="Access"
      value={filters.access}
      options={ACCESS_LABEL}
      onValueChange={(access) => onChange({ ...filters, access })}
    />
    <FilterSelect
      prefix="Usage"
      value={filters.usage}
      options={USAGE_LABEL}
      onValueChange={(usage) => onChange({ ...filters, usage })}
    />
    <FilterSelect
      prefix="Sync"
      value={filters.syncStatus}
      options={SYNC_LABEL}
      onValueChange={(syncStatus) => onChange({ ...filters, syncStatus })}
    />
  </div>
);
