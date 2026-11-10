import { useState } from "react";

import { Combobox } from "@app/components/v4/ui/combobox";
import type { BillingOrganization } from "@app/hooks/api/billing/types";

// Not a real organization, so it never collides with one and the page keys its scope off it.
export const ALL_ORGS_VALUE = "__all__";

type RootOrgFilterProps = {
  orgs: BillingOrganization[];
  value: string;
  onChange: (orgId: string) => void;
  onSearchChange: (search: string) => void;
  totalCount: number;
  isLoading?: boolean;
};

// A self-hosted license covers every org in the instance, so the billed figure spans all of them
// and one org's page cannot account for it alone. Cloud bills per root org, so this is not shown.
export const RootOrgFilter = ({
  orgs,
  value,
  onChange,
  onSearchChange,
  totalCount,
  isLoading
}: RootOrgFilterProps) => {
  const allOrgsOption: BillingOrganization = { id: ALL_ORGS_VALUE, name: "All organizations" };
  const options = [allOrgsOption, ...orgs];

  const [lastSelected, setLastSelected] = useState<BillingOrganization | null>(null);
  const orgInPage = options.find((org) => org.id === value) ?? null;
  if (orgInPage && orgInPage.id !== lastSelected?.id) {
    setLastSelected(orgInPage);
  }
  const selectedOrg = orgInPage ?? (lastSelected?.id === value ? lastSelected : null);
  const shown =
    selectedOrg && !options.some((org) => org.id === selectedOrg.id)
      ? [selectedOrg, ...options]
      : options;

  return (
    <Combobox
      id="billing-root-org-filter"
      label="Organization"
      placeholder="Select an organization"
      emptyText={
        totalCount > orgs.length
          ? `No match in the first ${orgs.length.toLocaleString()} of ${totalCount.toLocaleString()}. Type to search.`
          : "No organizations found"
      }
      loading={isLoading}
      options={shown.map((org) => ({ value: org.id, label: org.name, meta: org.slug }))}
      value={selectedOrg?.id ?? ""}
      onValueChange={onChange}
      onSearch={onSearchChange}
    />
  );
};
