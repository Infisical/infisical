import { useState } from "react";
import { Building2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Combobox
} from "@app/components/v3";
import { BillingV2Organization } from "@app/hooks/api";

type RootOrgFilterProps = {
  orgs: BillingV2Organization[];
  value: string;
  onChange: (orgId: string) => void;
  onSearchChange: (search: string) => void;
  totalCount: number;
  isLoading?: boolean;
};

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
  const [lastSelected, setLastSelected] = useState<BillingV2Organization | null>(null);
  const orgInPage = orgs.find((org) => org.id === value) ?? null;
  if (orgInPage && orgInPage.id !== lastSelected?.id) {
    setLastSelected(orgInPage);
  }
  const selectedOrg = orgInPage ?? (lastSelected?.id === value ? lastSelected : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Building2 className="size-4 text-org" />
          Organization
        </CardTitle>
        <CardDescription>
          This instance&apos;s licence covers every organization on it. Pick one to see the usage it
          contributes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Combobox<BillingV2Organization>
          id="billing-root-org-filter"
          placeholder="Select an organization..."
          searchPlaceholder="Search organizations..."
          searchAriaLabel="Search root organizations"
          isLoading={isLoading}
          options={orgs}
          value={selectedOrg}
          onValueChange={(option) => onChange(option.id)}
          onSearchChange={onSearchChange}
          getOptionValue={(option) => option.id}
          getOptionLabel={(option) => option.name}
          emptyMessage="No organizations found"
          listFooter={
            totalCount > orgs.length
              ? `Showing ${orgs.length.toLocaleString()} of ${totalCount.toLocaleString()}. Type in the input to search.`
              : null
          }
        />
      </CardContent>
    </Card>
  );
};
