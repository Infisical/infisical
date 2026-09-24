import { useState } from "react";

import { Combobox } from "@app/components/v3";
import { BillingV2Organization } from "@app/hooks/api";

// The pinned row's id. Not a real organization, so it never collides with one and the page keys its
// scope off it rather than off a parallel boolean the picker could drift from.
export const ALL_ORGS_VALUE = "__all__";

type RootOrgFilterProps = {
  orgs: BillingV2Organization[];
  value: string;
  onChange: (orgId: string) => void;
  onSearchChange: (search: string) => void;
  totalCount: number;
  isLoading?: boolean;
};

const OrgLabel = ({ org }: { org: BillingV2Organization }) => (
  <span className="flex min-w-0 items-baseline gap-2">
    <span className="truncate">{org.name}</span>
    {org.slug && <span className="min-w-0 truncate text-xs text-muted">{org.slug}</span>}
  </span>
);

// Picks which root organization's usage the breakdown explains. A self-hosted licence covers every org
// in the instance, so the billed figure spans all of them and one org's page cannot account for it on
// its own. Cloud bills per root org, so this is not rendered there.
export const RootOrgFilter = ({
  orgs,
  value,
  onChange,
  onSearchChange,
  totalCount,
  isLoading
}: RootOrgFilterProps) => {
  const allOrgsOption: BillingV2Organization = { id: ALL_ORGS_VALUE, name: "All organizations" };
  const options = [allOrgsOption, ...orgs];

  const [lastSelected, setLastSelected] = useState<BillingV2Organization | null>(null);
  const orgInPage = options.find((org) => org.id === value) ?? null;
  if (orgInPage && orgInPage.id !== lastSelected?.id) {
    setLastSelected(orgInPage);
  }
  const selectedOrg = orgInPage ?? (lastSelected?.id === value ? lastSelected : null);

  return (
    <Combobox<BillingV2Organization>
      id="billing-root-org-filter"
      className="w-[34rem] max-w-full"
      placeholder="Select an organization..."
      searchPlaceholder="Search organizations..."
      searchAriaLabel="Search root organizations"
      isLoading={isLoading}
      isClearable={false}
      options={options}
      value={selectedOrg}
      getOptionGroup={(option) => (option.id === ALL_ORGS_VALUE ? "" : "Organizations")}
      onValueChange={(option) => onChange(option.id)}
      onSearchChange={onSearchChange}
      getOptionValue={(option) => option.id}
      getOptionLabel={(option) => option.name}
      renderOption={(option) => <OrgLabel org={option} />}
      renderValue={(option) => <OrgLabel org={option} />}
      emptyMessage="No organizations found"
      listFooter={
        totalCount > orgs.length
          ? `Showing ${orgs.length.toLocaleString()} of ${totalCount.toLocaleString()}. Type in the input to search.`
          : null
      }
    />
  );
};
