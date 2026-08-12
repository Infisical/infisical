import { FilterIcon } from "lucide-react";

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch
} from "@app/components/v3";
import {
  PrincipalAccessFilter,
  PrincipalUsageFilter,
  SyncStatusFilter
} from "@app/hooks/api/blastRadius";

export type TBlastRadiusFilterState = {
  access: PrincipalAccessFilter;
  usage: PrincipalUsageFilter;
  syncStatus: SyncStatusFilter;
  clusterUnusedAccess: boolean;
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
  [PrincipalUsageFilter.NoReads]: "No reads in window",
  [PrincipalUsageFilter.Observed]: "Observed readers"
};

const SYNC_LABEL: Record<SyncStatusFilter, string> = {
  [SyncStatusFilter.All]: "All",
  [SyncStatusFilter.Unhealthy]: "Stale, failing, or manual"
};

const FilterSelect = <T extends string>({
  label,
  value,
  options,
  onValueChange
}: {
  label: string;
  value: T;
  options: Record<T, string>;
  onValueChange: (value: T) => void;
}) => (
  <div className="flex items-center gap-1.5">
    <Label className="text-xs text-accent">{label}</Label>
    <Select value={value} onValueChange={(next) => onValueChange(next as T)}>
      <SelectTrigger size="sm" className="w-44">
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
  </div>
);

/**
 * Principal filters are sent to the server so they apply to the whole set before the page is cut;
 * paging through a filtered graph then walks the filtered set. The destination filter is client-side
 * because destinations are never paged.
 */
export const BlastRadiusFilters = ({ filters, onChange }: Props) => (
  <div className="flex flex-wrap items-center gap-4 rounded-sm border border-border bg-container px-3 py-2">
    <span className="flex items-center gap-1.5 text-xs tracking-wide text-muted uppercase">
      <FilterIcon />
      Filter
    </span>

    <FilterSelect
      label="Access"
      value={filters.access}
      options={ACCESS_LABEL}
      onValueChange={(access) => onChange({ ...filters, access })}
    />
    <FilterSelect
      label="Usage"
      value={filters.usage}
      options={USAGE_LABEL}
      onValueChange={(usage) => onChange({ ...filters, usage })}
    />
    <FilterSelect
      label="Sync status"
      value={filters.syncStatus}
      options={SYNC_LABEL}
      onValueChange={(syncStatus) => onChange({ ...filters, syncStatus })}
    />

    <div className="flex items-center gap-2">
      <Switch
        id="cluster-unused"
        variant="project"
        size="sm"
        checked={filters.clusterUnusedAccess}
        onCheckedChange={(clusterUnusedAccess) => onChange({ ...filters, clusterUnusedAccess })}
      />
      <Label htmlFor="cluster-unused" className="text-xs text-accent">
        Cluster unused access
      </Label>
    </div>
  </div>
);
